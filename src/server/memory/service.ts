/**
 * SERVICIO DE MEMORIA NARRATIVA: orquesta almacenamiento + núcleo puro (`@/memory`). Reglas que garantiza:
 *  · SOLO lo aprobado por el usuario es canon: un episodio entra al canon cuando está aprobado Y el usuario confirma sus cambios.
 *  · Una generación fallida o un borrador nunca toca el canon (solo crea una propuesta, que es un borrador).
 *  · Un episodio cuyo contenido cambió tras confirmarse deja de contar como canon hasta volver a aprobarlo y confirmarlo.
 * No depende de ningún modelo de IA ni de Next: se usa igual desde acciones, trabajos y tests.
 */
import type { Storage } from "@/ports";
import type { EpisodeRequestInterpreter, EpisodeSummarizer, ScriptAuthor } from "@/ports/studio";
import type { Character, Place, Production } from "@/domain/types";
import { canExport } from "@/server/studio/export";
import {
  applyChanges, buildContextPack, buildProposal, contentSig, deriveEnding, emptyCanon, markPresent, orderOf, parseEpisodeRequest, parseManual, parseScenes, slug, validateContinuity,
  asProposed, epLabel,
  type CanonBase, type CanonState, type ContextPack, type Decision, type EpisodeInput, type EpisodeMemory, type EpisodeRequest, type Finding, type MemoryProposal, type ProposedChange,
} from "@/memory";

export class MemoryError extends Error { constructor(message: string) { super(message); this.name = "MemoryError"; } }
/** `ai`: adaptadores OPCIONALES (hoy ninguno). Sin IA todo funciona con reglas y formularios; con IA, sus propuestas pasan por el mismo flujo. */
export type MemoryDeps = { storage: Storage; ai?: { author?: ScriptAuthor; summarizer?: EpisodeSummarizer; requests?: EpisodeRequestInterpreter }; log?: (action: string, target: string, detail: string) => Promise<void> | void; now?: () => string };
const nowOf = (d: MemoryDeps) => (d.now ?? (() => new Date().toISOString()))();
const log = async (d: MemoryDeps, a: string, t: string, detail: string) => { try { await d.log?.(a, t, detail); } catch { /* la auditoría nunca rompe la acción */ } };

// ------------------------------------------------------------------ entrada del episodio
/** Convierte una producción en la entrada del núcleo: escenas con nombres resueltos, prenda del reparto y continuidad declarada. */
export async function episodeInput(storage: Storage, prod: Production, characters?: Character[]): Promise<EpisodeInput> {
  const chars = characters ?? (await storage.characters.list()), byId = new Map(chars.map((c) => [c.id, c]));
  const scenes = prod.scenes.map((s) => ({
    title: s.title, location: s.location, lines: s.lines, narration: s.narration, summary: s.summary, directions: s.directions, memory: s.memory ?? [],
    characterNames: s.characterIds.map((id) => byId.get(id)?.name).filter((n): n is string => !!n),
  }));
  const cast = new Map(prod.cast.map((c) => [c.characterId, c.outfitId]));
  const infos = chars.map((c) => ({ name: c.name, designVersion: c.design?.version, outfits: c.design?.outfits.map((o) => o.name),
    castOutfit: cast.has(c.id) ? c.design?.outfits.find((o) => o.id === cast.get(c.id))?.name : undefined }));
  const ep: EpisodeInput = { productionId: prod.id, season: prod.season, number: prod.number, title: prod.title, continuesFrom: prod.continuesFrom, scenes, characters: infos };
  if (ep.continuesFrom === undefined) { const c = parseScenes(ep)[0]?.parsed.continues ?? parseScenes(ep).find((p) => p.parsed.continues !== undefined)?.parsed.continues; if (c !== undefined) ep.continuesFrom = orderOf(prod.season, c); }
  return ep;
}

// ------------------------------------------------------------------ canon (pliegue del libro de cambios)
export async function loadBase(storage: Storage): Promise<CanonBase> { return (await storage.memoryCanon.get("base")) ?? { id: "base", changes: [], updatedAt: "" }; }

/** Episodios que cuentan como canon: confirmados, con su producción aprobada y con el contenido con el que se confirmaron. */
export async function validEpisodes(storage: Storage): Promise<EpisodeMemory[]> {
  const [mems, prods, chars] = await Promise.all([storage.memoryEpisodes.list(), storage.productions.list(), storage.characters.list()]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  const ok: EpisodeMemory[] = [];
  for (const m of mems) { const p = byId.get(m.productionId); if (p && canExport(p.status) && contentSig(await episodeInput(storage, p, chars)) === m.contentSig) ok.push(m); }
  return ok.sort((a, b) => a.order - b.order);
}
export async function staleEpisodes(storage: Storage): Promise<EpisodeMemory[]> { const valid = new Set((await validEpisodes(storage)).map((e) => e.id)); return (await storage.memoryEpisodes.list()).filter((m) => !valid.has(m.id)); }

const foldBase = (b: CanonBase) => applyChanges(emptyCanon(), b.changes.map((c) => c.change), 0);
const foldEpisode = (s: CanonState, m: EpisodeMemory) => applyChanges(markPresent(s, m.present, m.order), m.accepted.map((c) => c.change), m.order);

/** Canon vigente tras incorporar los episodios válidos con orden ≤ `upTo` (por defecto todos). */
export async function canonUpTo(storage: Storage, upTo = Infinity, valid?: EpisodeMemory[]): Promise<CanonState> {
  let s = foldBase(await loadBase(storage));
  for (const m of valid ?? (await validEpisodes(storage))) if (m.order <= upTo) s = foldEpisode(s, m);
  return s;
}
export const canonBefore = (storage: Storage, order: number) => canonUpTo(storage, order - 1);

// ------------------------------------------------------------------ propuesta (borrador)
export async function proposeMemory(deps: MemoryDeps, productionId: string, o: { manual?: string } = {}): Promise<MemoryProposal> {
  const { storage } = deps, prod = await storage.productions.get(productionId);
  if (!prod) throw new MemoryError("Producción no encontrada");
  if (prod.kind !== "episode") throw new MemoryError("La memoria narrativa se propone solo para episodios (los Shorts derivan de un episodio)");
  const ep = await episodeInput(storage, prod), before = await canonBefore(storage, orderOf(prod.season, prod.number));
  const previous = await storage.memoryProposals.get(productionId);
  const built = buildProposal(ep, before, { previous, manual: o.manual ? parseManual(o.manual) : undefined, now: nowOf(deps) });
  let proposal = built.proposal;
  const sm = deps.ai?.summarizer;   // IA opcional: propone resumen y cambios con el MISMO esquema; nunca escribe en el canon
  if (sm && (await sm.available().catch(() => false))) {
    try {
      const r = await sm.summarize({ episode: ep, canon: before });
      const extra = r.changes.map((c) => ({ ...asProposed(c, "llm", before), decision: "pending" as const })).filter((c) => !proposal.changes.some((x) => x.id === c.id));
      proposal = { ...proposal, changes: [...proposal.changes, ...extra], ...(!previous?.summaryEdited && r.summary ? { summary: r.summary, logline: r.logline || proposal.logline } : {}), ...(r.warnings.length ? { warnings: r.warnings } : {}) };
    } catch (e) { proposal = { ...proposal, warnings: [`La IA no pudo resumir el episodio (se usan las reglas): ${(e as Error).message}`] }; }
  }
  // si ya estaba confirmado y el contenido es el mismo, no se toca; si cambió, se abre una propuesta nueva (la confirmación anterior queda desfasada)
  const saved: MemoryProposal = previous?.status === "committed" && previous.contentSig === proposal.contentSig ? previous : { ...proposal, status: "pending" };
  await storage.memoryProposals.save(saved);
  return saved;
}

export type MemoryStatus = {
  production: Production; proposal?: MemoryProposal; committed?: EpisodeMemory; findings: Finding[]; parseErrors: string[];
  stale: boolean;            // la propuesta/confirmación no corresponde al contenido actual
  approved: boolean; pendingDecisions: number; accepted: number; rejected: number;
};

/** Estado de memoria de un episodio: propuesta, hallazgos de continuidad frente al canon anterior y si se puede confirmar. */
export async function memoryStatus(storage: Storage, productionId: string): Promise<MemoryStatus | undefined> {
  const production = await storage.productions.get(productionId); if (!production || production.kind !== "episode") return undefined;
  const [proposal, committed, ep] = [await storage.memoryProposals.get(productionId), await storage.memoryEpisodes.get(productionId), await episodeInput(storage, production)];
  const sig = contentSig(ep), order = orderOf(production.season, production.number), before = await canonBefore(storage, order);
  const stale = !!proposal && proposal.contentSig !== sig, perScene = parseScenes(ep);
  const changes = proposal?.changes ?? [];
  const manual = { changes: changes.filter((c) => c.origin === "manual").map((c) => c.change), uses: [], errors: [] };   // lo que el usuario añadió a mano también se valida
  const prevMem = ep.continuesFrom !== undefined ? (await validEpisodes(storage)).find((e) => e.order === ep.continuesFrom) : undefined;
  const findings = validateContinuity({ episode: ep, canon: before, perScene, changes, manual, previousLastShot: prevMem ? { characters: prevMem.lastShot.characters, location: prevMem.lastShot.location } : undefined });
  return { production, proposal, committed, findings, parseErrors: perScene.flatMap((p) => p.parsed.errors), stale: stale || (!!committed && committed.contentSig !== sig), approved: canExport(production.status),
    pendingDecisions: changes.filter((c) => c.decision === "pending").length, accepted: changes.filter((c) => c.decision === "accepted").length, rejected: changes.filter((c) => c.decision === "rejected").length };
}

export type DecisionsInput = { decisions?: Record<string, Decision>; all?: Decision; summary?: string; logline?: string; endingNote?: string; addManual?: string };
export async function saveDecisions(deps: MemoryDeps, productionId: string, inp: DecisionsInput): Promise<MemoryProposal> {
  const { storage } = deps; let p = await storage.memoryProposals.get(productionId);
  if (!p) throw new MemoryError("No hay propuesta de memoria: recalcúlala primero");
  if (p.status === "committed") throw new MemoryError("Este episodio ya está confirmado en el canon: retíralo para volver a decidir");
  if (inp.addManual?.trim()) {
    const parsed = parseManual(inp.addManual); if (parsed.errors.length && !parsed.changes.length) throw new MemoryError(`No se entendió el cambio: ${parsed.errors.join("; ")}`);
    const before = await canonBefore(storage, p.order), extra: ProposedChange[] = [];
    for (const ch of parsed.changes) { const pc = asProposed(ch, "manual", before); if (!p.changes.some((c) => c.id === pc.id)) extra.push({ ...pc, decision: "accepted" }); }   // lo que escribe el usuario ya es una decisión suya
    p = { ...p, changes: [...p.changes, ...extra] };
  }
  const changes = p.changes.map((c) => ({ ...c, decision: inp.all ?? inp.decisions?.[c.id] ?? c.decision }));
  p = { ...p, changes, ...(inp.summary !== undefined ? { summary: inp.summary.slice(0, 2000), summaryEdited: true } : {}), ...(inp.logline !== undefined ? { logline: inp.logline.slice(0, 300), summaryEdited: true } : {}), ...(inp.endingNote !== undefined ? { endingNote: inp.endingNote.slice(0, 1000) } : {}), updatedAt: nowOf(deps) };
  await storage.memoryProposals.save(p);
  return p;
}

// ------------------------------------------------------------------ confirmación → canon
export async function commitMemory(deps: MemoryDeps, productionId: string, by = "usuario"): Promise<EpisodeMemory> {
  const { storage } = deps, prod = await storage.productions.get(productionId);
  if (!prod) throw new MemoryError("Producción no encontrada");
  if (!canExport(prod.status)) throw new MemoryError("Solo lo aprobado entra en el canon: aprueba primero el episodio.");
  const p = await storage.memoryProposals.get(productionId); if (!p) throw new MemoryError("No hay propuesta de memoria que confirmar");
  const ep = await episodeInput(storage, prod);
  if (p.contentSig !== contentSig(ep)) throw new MemoryError("La propuesta está desfasada (el episodio cambió): recalcúlala antes de confirmar.");
  if (p.changes.some((c) => c.decision === "pending")) throw new MemoryError("Hay cambios sin decidir: acepta o rechaza cada uno (o usa «Aceptar todo» / «Rechazar todo»).");
  const order = orderOf(prod.season, prod.number), before = await canonBefore(storage, order);
  const accepted = p.changes.filter((c) => c.decision === "accepted"), rejected = p.changes.filter((c) => c.decision === "rejected");
  const start = markPresent(before, p.present, order), end = applyChanges(start, accepted.map((c) => c.change), order);
  const known = (n: string) => !!before.objects[slug(n)];
  const em: EpisodeMemory = {
    id: productionId, productionId, season: prod.season, number: prod.number, order, title: prod.title, contentSig: p.contentSig, summary: p.summary, logline: p.logline, present: p.present,
    accepted, rejected, startState: start, endState: end,
    introducedObjects: accepted.flatMap((c) => (c.change.kind === "object.introduce" || (c.change.kind === "object.update" && !known(c.change.name)) ? [c.change.name] : [])),
    modifiedObjects: accepted.flatMap((c) => (c.change.kind === "object.update" && known(c.change.name) ? [c.change.name] : [])),
    relationshipChanges: accepted.filter((c) => c.change.kind === "relationship.set").map((c) => c.text),
    eventsText: accepted.filter((c) => c.change.kind === "event.add").map((c) => (c.change.kind === "event.add" ? c.change.title : "")),
    threadsOpened: accepted.flatMap((c) => (c.change.kind === "thread.open" ? [c.change.title] : [])), threadsClosed: accepted.flatMap((c) => (c.change.kind === "thread.close" ? [c.change.title] : [])),
    lastShot: p.lastShot, endingSituation: p.endingNote.trim() || deriveEnding(end, p.present, order), ...(prod.continuesFrom !== undefined || ep.continuesFrom !== undefined ? { continuesFrom: ep.continuesFrom } : {}),
    committedAt: nowOf(deps), committedBy: by,
  };
  await storage.memoryEpisodes.save(em);
  await storage.memoryProposals.save({ ...p, status: "committed", committedAt: em.committedAt, updatedAt: em.committedAt });
  await log(deps, "memoria.confirmada", productionId, `${epLabel(order)} · ${accepted.length} aceptados / ${rejected.length} rechazados`);
  return em;
}

/** Retira un episodio del canon (vuelve a ser propuesta pendiente). El canon se recalcula solo: es el pliegue de los episodios que quedan. */
export async function retractMemory(deps: MemoryDeps, productionId: string, by = "usuario"): Promise<void> {
  const { storage } = deps, m = await storage.memoryEpisodes.get(productionId); if (!m) throw new MemoryError("Este episodio no está en el canon");
  await storage.memoryEpisodes.remove(productionId);
  const p = await storage.memoryProposals.get(productionId); if (p) await storage.memoryProposals.save({ ...p, status: "pending", committedAt: undefined, updatedAt: nowOf(deps) });
  await log(deps, "memoria.retirada", productionId, `${epLabel(m.order)} retirado del canon por ${by}`);
}

/** Canon base: reglas, hechos y estados que escribe el usuario (escribirlos ES su confirmación). */
export async function addToBase(deps: MemoryDeps, text: string, by = "usuario"): Promise<ProposedChange[]> {
  const parsed = parseManual(text); if (!parsed.changes.length) throw new MemoryError(parsed.errors.length ? `No se entendió: ${parsed.errors.join("; ")}` : "Escribe una directiva, p. ej. «regla: nadie sale de la ciudad»");
  const base = await loadBase(deps.storage), before = foldBase(base), added: ProposedChange[] = [];
  for (const ch of parsed.changes) { const pc = { ...asProposed(ch, "manual", before), decision: "accepted" as const }; if (!base.changes.some((c) => c.id === pc.id)) added.push(pc); }
  await deps.storage.memoryCanon.save({ ...base, changes: [...base.changes, ...added], updatedAt: nowOf(deps) });
  await log(deps, "memoria.base", "base", `${added.length} cambio(s) de canon base por ${by}`);
  return added;
}
export async function removeFromBase(deps: MemoryDeps, changeId: string): Promise<void> { const b = await loadBase(deps.storage); await deps.storage.memoryCanon.save({ ...b, changes: b.changes.filter((c) => c.id !== changeId), updatedAt: nowOf(deps) }); }

// ------------------------------------------------------------------ contexto para el siguiente episodio
export async function requestContext(storage: Storage, text: string, o: { budgetTokens?: number; interpreter?: EpisodeRequestInterpreter } = {}): Promise<{ request: EpisodeRequest; pack: ContextPack }> {
  const [chars, places, prods, valid] = await Promise.all([storage.characters.list(), storage.places.list(), storage.productions.list(), validEpisodes(storage)]);
  const eps = prods.filter((p) => p.kind === "episode"), season = Math.max(1, ...eps.map((p) => p.season));
  const rctx = { knownCharacters: chars.map((c) => c.name), defaultSeason: season,
    nextNumber: (eps.filter((p) => p.season === season).reduce((n, p) => Math.max(n, p.number), 0)) + 1, latestBefore: (s: number, n: number) => [...valid].reverse().find((e) => e.order < orderOf(s, n))?.order };
  let request = parseEpisodeRequest(text, rctx);
  if (o.interpreter && (await o.interpreter.available().catch(() => false))) { try { request = await o.interpreter.parse(text, rctx); } catch { /* si la IA falla, valen las reglas */ } }
  const canon = await canonUpTo(storage, request.continuesFrom ?? Infinity, valid);
  const pack = buildContextPack({ request, canon, episodes: valid.filter((e) => request.continuesFrom === undefined || e.order <= request.continuesFrom), budgetTokens: o.budgetTokens,
    characters: chars.map((c) => ({ name: c.name, designVersion: c.design?.version, outfits: c.design?.outfits.map((x) => x.name), look: lookOf(c) })), places: places.map((p) => ({ name: p.name, look: lookOfPlace(p) })) });
  return { request, pack };
}
const lookOf = (c: Character) => c.design ? [c.design.hairStyle ? `pelo ${c.design.hairStyle}` : "", c.design.body ? `cuerpo ${c.design.body}` : ""].filter(Boolean).join(", ") : undefined;
const lookOfPlace = (p: Place) => p.set ? `${p.set.preset ?? "escenario"} (${p.set.timeOfDay ?? "—"})` : undefined;

/** Crea el borrador del episodio pedido («Crea el episodio 7 continuando el 6») y devuelve su contexto. No genera guion: eso lo hará el ScriptAuthor cuando exista. */
export async function createEpisodeFromRequest(deps: MemoryDeps, text: string): Promise<{ production: Production; request: EpisodeRequest; pack: ContextPack; authored: boolean; warnings: string[] }> {
  const { storage } = deps; const { request, pack } = await requestContext(storage, text, { interpreter: deps.ai?.requests });
  const dup = (await storage.productions.list()).find((p) => p.kind === "episode" && p.season === request.season && p.number === request.number);
  if (dup) throw new MemoryError(`El episodio ${request.number} (temporada ${request.season}) ya existe: «${dup.title}»`);
  const now = nowOf(deps);
  const production: Production = { id: crypto.randomUUID(), kind: "episode", number: request.number, season: request.season, title: `Episodio ${request.number}`, status: "SCRIPTING", synopsis: "", script: "", scenes: [], assetIds: [], durationSec: 0,
    cast: [], storyTime: "", generated: false, brief: request.text, ...(request.continuesFrom !== undefined ? { continuesFrom: request.continuesFrom } : {}), createdAt: now, updatedAt: now };
  const warnings: string[] = []; let authored = false, saved = production;
  const au = deps.ai?.author;   // si hay IA, redacta el guion con el contexto; si no, el usuario lo escribe (el contexto queda a la vista)
  if (au && (await au.available().catch(() => false))) {
    try { const r = await au.write({ request, context: pack }); saved = { ...production, script: r.script }; warnings.push(...r.warnings); authored = true; } catch (e) { warnings.push(`La IA no pudo redactar el guion: ${(e as Error).message}`); }
  }
  await storage.productions.save(saved);
  await log(deps, "memoria.episodio", saved.id, `Pedido: «${request.text.slice(0, 200)}»${authored ? " · guion redactado por IA (pendiente de revisión)" : ""}`);
  return { production: saved, request, pack, authored, warnings };
}
