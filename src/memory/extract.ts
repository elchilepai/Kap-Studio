/**
 * EXTRACCIÓN de la propuesta de memoria de un episodio SIN IA: a partir de las escenas (ya validadas por el pipeline), las
 * directivas del guion y el reparto. Lo semántico (quién conoce a quién, qué se pierde…) lo declara el autor con directivas o
 * lo escribe el usuario en el panel; un modelo de IA futuro devolverá los mismos `Change` y pasará por el mismo flujo.
 */
import { asProposed, changeId } from "./canon.ts";
import { parseMemoryDirectives, type ParsedMemory } from "./directives.ts";
import type { Act, CanonState, Change, LastShot, MemoryProposal, ProposedChange } from "./schema.ts";
import { clip, epLabel, hash, norm, orderOf, slug } from "./text.ts";

export type SceneInput = {
  title: string; location: string; lines: { speaker?: string; text: string }[]; narration?: string; summary?: string;
  characterNames: string[];                 // quién aparece (ids ya resueltos a nombres)
  directions: string[]; memory: string[];   // direcciones 2D y directivas de memoria del autor
};
export type CharInfo = { name: string; castOutfit?: string; outfits?: string[]; designVersion?: number };
export type EpisodeInput = { productionId: string; season: number; number: number; title: string; continuesFrom?: number; /** «Continúa exactamente donde terminó»: el arranque debe coincidir con el último plano. Si es false, un cambio de lugar entre episodios es normal. */ continuesExact?: boolean; scenes: SceneInput[]; characters: CharInfo[]; /** Duración total (suma de las escenas, real o estimada). */ durationSec?: number };
export type PerScene = { index: number; title: string; parsed: ParsedMemory };

/** Firma del contenido narrativo: si cambia (se edita una escena o su memoria), la propuesta y la confirmación quedan desfasadas. */
export function contentSig(ep: EpisodeInput): string {
  const present = new Set(presentNames(ep).map(slug));   // solo cuentan los personajes de ESTE episodio: crear otros en el estudio no debe invalidar episodios ya confirmados
  return hash(JSON.stringify([ep.title, ep.continuesFrom ?? null, ep.characters.filter((c) => present.has(slug(c.name))).map((c) => [c.name, c.castOutfit ?? ""]),
    ep.scenes.map((s) => [s.title, s.location, s.lines.map((l) => [l.speaker ?? "", l.text]), s.characterNames, s.memory])]));
}

export const parseScenes = (ep: EpisodeInput): PerScene[] => ep.scenes.map((s, index) => ({ index, title: s.title, parsed: parseMemoryDirectives(s.memory) }));

/** Quién aparece en el episodio (en orden de aparición, sin repetir; con la grafía del reparto). */
export function presentNames(ep: EpisodeInput): string[] {
  const seen = new Map<string, string>();
  for (const sc of ep.scenes) for (const n of [...sc.characterNames, ...sc.lines.map((l) => l.speaker ?? "")]) { const k = slug(n); if (k && !seen.has(k)) seen.set(k, n.trim()); }
  const canonical = new Map(ep.characters.map((c) => [slug(c.name), c.name]));
  return [...seen.entries()].map(([k, n]) => canonical.get(k) ?? n);
}

export function lastShotOf(ep: EpisodeInput): LastShot {
  const sc = ep.scenes.at(-1); if (!sc) return { scene: "", location: "", characters: [], text: "", directions: [] };
  const lines = sc.lines.slice(-4).map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)).join("\n");
  return { scene: sc.title, location: sc.location, characters: [...new Set([...sc.characterNames, ...sc.lines.map((l) => l.speaker ?? "").filter(Boolean)])], text: clip(lines, 700), directions: sc.directions.slice(0, 8) };
}

const sentence = (s: string) => (/^[^.!?…]+[.!?…]?/.exec(s.trim())?.[0] ?? s).trim();
export function summarizeByRules(ep: EpisodeInput): { logline: string; summary: string } {
  const first = ep.scenes[0]; const loglineSrc = first?.narration || first?.lines.find((l) => !l.speaker)?.text || first?.lines[0]?.text || ep.title;
  const per = ep.scenes.map((s, i) => `${i + 1}. ${s.title || `Escena ${i + 1}`}${s.location && s.location !== s.title ? ` (${s.location})` : ""}: ${clip(sentence(s.summary || s.narration || s.lines.map((l) => l.text).join(" ")), 140)}`);
  return { logline: clip(sentence(loglineSrc), 160), summary: clip(`«${ep.title}»: ${per.join(" ")}`, 1200) };
}

/** Estado final en texto: dónde y cómo queda cada personaje que aparece, qué llevan y qué hilos siguen abiertos. */
export function deriveEnding(state: CanonState, present: string[], order: number): string {
  const objs = Object.values(state.objects);
  const per = present.map((n) => {
    const c = state.characters[slug(n)]; const own = objs.filter((o) => o.owner && slug(o.owner) === slug(n)).map((o) => o.name);
    return `${c?.name ?? n}: ${c && c.status !== "active" ? `${c.status === "dead" ? "muerto" : "ausente"}, ` : ""}${c?.location ? `en ${c.location}` : "lugar sin definir"}${c?.outfit ? `, lleva ${c.outfit}` : ""}${own.length ? `, con ${own.join(", ")}` : ""}`;
  });
  const open = Object.values(state.threads).filter((t) => t.status === "open").map((t) => t.title);
  return `Al terminar el ${epLabel(order)}: ${per.join(" · ") || "sin personajes"}.${open.length ? ` Hilos abiertos: ${open.join("; ")}.` : ""}`;
}

export type Extraction = { changes: ProposedChange[]; present: string[]; perScene: PerScene[]; parseErrors: string[]; acts: Act[]; hook?: string };

/** Cambios propuestos: declarados por el autor + deducidos por reglas (presencia, lugar, ropa, nuevos personajes/lugares). */
export function extractChanges(ep: EpisodeInput, canon: CanonState, manual: ParsedMemory | undefined = undefined): Extraction {
  const order = orderOf(ep.season, ep.number), perScene = parseScenes(ep), present = presentNames(ep);
  const out: ProposedChange[] = []; const seen = new Set<string>();
  const add = (ch: Change, origin: ProposedChange["origin"], scene?: number) => { const id = changeId(ch); if (seen.has(id)) return; seen.add(id); out.push(asProposed(ch, origin, canon, scene)); };
  const parseErrors = perScene.flatMap((p) => p.parsed.errors.map((e) => `Escena ${p.index + 1}: ${e}`));

  // 1) declarados por el autor (en orden de escena) y los añadidos a mano
  for (const p of perScene) for (const ch of p.parsed.changes) add(ch, "declared", p.index);
  for (const ch of manual?.changes ?? []) add(ch, "manual");
  const declared = [...perScene.flatMap((p) => p.parsed.changes), ...(manual?.changes ?? [])];
  const declaredFor = (kind: Change["kind"], name: string) => declared.some((c) => c.kind === kind && "name" in c && slug(c.name) === slug(name));

  // 2) deducidos por reglas
  for (const n of present) if (!canon.characters[slug(n)] && !declaredFor("character.add", n)) add({ kind: "character.add", name: n }, "rules");
  for (const n of present) { const c = canon.characters[slug(n)]; if (c?.status === "absent" && !declared.some((d) => d.kind === "character.status" && slug(d.name) === slug(n))) add({ kind: "character.status", name: n, status: "active" }, "rules"); }
  for (const n of present) {   // dónde termina cada personaje: último escenario en el que aparece
    const lastScene = [...ep.scenes].reverse().find((s) => s.location && [...s.characterNames, ...s.lines.map((l) => l.speaker ?? "")].some((x) => slug(x) === slug(n)));
    const c = canon.characters[slug(n)];
    if (lastScene && !declaredFor("character.location", n) && slug(c?.location ?? "") !== slug(lastScene.location)) add({ kind: "character.location", name: n, location: lastScene.location }, "rules");
  }
  for (const ci of ep.characters) {   // prenda del reparto de este episodio
    if (!ci.castOutfit || !present.some((n) => slug(n) === slug(ci.name)) || declaredFor("character.outfit", ci.name)) continue;
    if (norm(canon.characters[slug(ci.name)]?.outfit ?? "") !== norm(ci.castOutfit)) add({ kind: "character.outfit", name: ci.name, outfit: ci.castOutfit }, "rules");
  }
  for (const ci of ep.characters) {   // qué versión de diseño visual se usa en este episodio (para vigilar la evolución física con la edad)
    if (ci.designVersion === undefined || !present.some((n) => slug(n) === slug(ci.name)) || declaredFor("character.appearance", ci.name)) continue;
    if (canon.characters[slug(ci.name)]?.appearance?.designVersion !== ci.designVersion) add({ kind: "character.appearance", name: ci.name, description: `diseño v${ci.designVersion}${canon.characters[slug(ci.name)]?.appearance ? ` (antes: ${canon.characters[slug(ci.name)]!.appearance!.description})` : ""}`, designVersion: ci.designVersion }, "rules");
  }
  for (const sc of ep.scenes) if (sc.location && !canon.places[slug(sc.location)] && !declared.some((d) => d.kind === "place.update" && slug(d.name) === slug(sc.location))) add({ kind: "place.update", name: sc.location }, "rules");
  const acts: Act[] = perScene.flatMap((p) => p.parsed.acts.map((a) => ({ ...a, scene: p.index }))); const hook = [...acts].reverse().find((a) => a.kind === "gancho")?.text;
  return { changes: out, present, perScene, parseErrors, acts, ...(hook ? { hook } : {}) };
}

export function buildProposal(ep: EpisodeInput, canonBefore: CanonState, o: { manual?: ParsedMemory; previous?: MemoryProposal; now?: string } = {}): { proposal: MemoryProposal; extraction: Extraction } {
  const order = orderOf(ep.season, ep.number), ex = extractChanges(ep, canonBefore, o.manual), now = o.now ?? new Date().toISOString();
  const sum = summarizeByRules(ep);
  // las decisiones y ediciones previas del usuario se conservan para los cambios que siguen existiendo (mismo id)
  const prev = new Map((o.previous?.changes ?? []).map((c) => [c.id, c]));
  const changes = ex.changes.map((c) => ({ ...c, decision: prev.get(c.id)?.decision ?? "pending" as const }));
  for (const p of o.previous?.changes ?? []) if (p.origin === "manual" && !changes.some((c) => c.id === p.id)) changes.push(p);   // los cambios manuales del usuario no se pierden al recalcular
  const proposal: MemoryProposal = {
    id: ep.productionId, productionId: ep.productionId, season: ep.season, number: ep.number, order, title: ep.title, contentSig: contentSig(ep), status: "pending",
    summary: o.previous?.summaryEdited ? o.previous.summary : sum.summary, logline: o.previous?.summaryEdited ? o.previous.logline : sum.logline, ...(o.previous?.summaryEdited ? { summaryEdited: true } : {}),
    present: ex.present, lastShot: lastShotOf(ep), endingNote: o.previous?.endingNote ?? "", acts: ex.acts, ...(ex.hook ? { hook: ex.hook } : {}), ...(ep.durationSec !== undefined ? { durationSec: ep.durationSec } : {}), changes, createdAt: o.previous?.createdAt ?? now, updatedAt: now,
  };
  return { proposal, extraction: ex };
}
