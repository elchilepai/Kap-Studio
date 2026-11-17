/** El canon como LIBRO DE CAMBIOS: el estado actual es el pliegue (fold) ordenado de los cambios aceptados. Puro y determinista. */
import type { CanonState, Change, CharState, ObjState, ProposedChange } from "./schema.ts";
import { epLabel, hash, slug } from "./text.ts";

export const emptyCanon = (): CanonState => ({ asOf: 0, characters: {}, relationships: {}, objects: {}, threads: {}, places: {}, facts: [], rules: [], events: [], stages: {}, milestones: {} });

/** Hito por clave o por título (normalizados): las directivas pueden escribir cualquiera de los dos. */
export const findMilestone = (s: CanonState, ref: string) => Object.values(s.milestones ?? {}).find((m) => m.key === slug(ref) || slug(m.title) === slug(ref));
export const findStage = (s: CanonState, ref: string) => Object.values(s.stages ?? {}).find((x) => x.key === slug(ref) || slug(x.title) === slug(ref));
export const stagesInOrder = (s: CanonState) => Object.values(s.stages ?? {}).sort((a, b) => a.order - b.order);
export const milestonesInOrder = (s: CanonState) => Object.values(s.milestones ?? {}).sort((a, b) => a.order - b.order);
const push = <T>(h: { ep: number; value: T }[] | undefined, ep: number, value: T) => [...(h ?? []), { ep, value }];
export const cloneCanon = (c: CanonState): CanonState => structuredClone(c);
const relKey = (a: string, b: string) => [slug(a), slug(b)].sort().join("~");

const ensureChar = (s: CanonState, name: string, ep: number): CharState => {
  const k = slug(name); return (s.characters[k] ??= { key: k, name: name.trim(), status: "active", accessories: [], knows: [], firstSeen: ep, lastSeen: ep, notes: [] });
};
const ensureObj = (s: CanonState, name: string, ep: number): ObjState => {
  const k = slug(name); return (s.objects[k] ??= { key: k, name: name.trim(), status: "intact", introducedIn: ep, lastChangedIn: ep, notes: [] });
};

/** Aplica UN cambio al estado (inmutable: devuelve una copia). Tolerante: lo que no existe se crea (el validador avisa aparte). */
export function applyChange(state: CanonState, ch: Change, ep: number): CanonState {
  const s = cloneCanon(state);
  switch (ch.kind) {
    case "character.add": { const c = ensureChar(s, ch.name, ep); if (ch.note) c.notes.push(ch.note); break; }
    case "character.status": { const c = ensureChar(s, ch.name, ep); c.status = ch.status; c.statusSince = ep; if (ch.note) c.notes.push(ch.note); break; }
    case "character.location": { const c = ensureChar(s, ch.name, ep); c.location = ch.location; c.lastSeen = Math.max(c.lastSeen, ep); break; }
    case "character.outfit": { const c = ensureChar(s, ch.name, ep); c.outfit = ch.outfit; if (ch.accessories) c.accessories = ch.accessories; break; }
    case "character.knows": { const c = ensureChar(s, ch.name, ep); if (!c.knows.includes(ch.fact)) c.knows.push(ch.fact); break; }
    case "relationship.set": {
      ensureChar(s, ch.a, ep); ensureChar(s, ch.b, ep); const k = relKey(ch.a, ch.b), prev = s.relationships[k];
      const trust = ch.trust ?? prev?.trust ?? 0;
      s.relationships[k] = { key: k, a: prev?.a ?? ch.a, b: prev?.b ?? ch.b, relation: ch.relation, trust, note: ch.note ?? prev?.note, since: prev?.since ?? ep, history: [...(prev?.history ?? []), { ep, relation: ch.relation, trust }] };
      break; }
    case "object.introduce": { const o = ensureObj(s, ch.name, ep); if (ch.owner) { ensureChar(s, ch.owner, ep); o.owner = ch.owner; } if (ch.location) o.location = ch.location; if (ch.note) o.notes.push(ch.note); o.lastChangedIn = ep; break; }
    case "object.update": {
      const o = ensureObj(s, ch.name, ep);
      if (ch.status) { o.status = ch.status; if (ch.status === "lost" || ch.status === "destroyed") { if (o.owner) o.lastOwner = o.owner; o.owner = undefined; } }
      if (ch.owner === null) { if (o.owner) o.lastOwner = o.owner; o.owner = undefined; } else if (ch.owner) { ensureChar(s, ch.owner, ep); o.owner = ch.owner; }
      if (ch.location) o.location = ch.location; if (ch.note) o.notes.push(ch.note); o.lastChangedIn = ep; break; }
    case "thread.open": { const k = slug(ch.title), t = s.threads[k]; s.threads[k] = { key: k, title: t?.title ?? ch.title, status: "open", openedIn: t?.openedIn ?? ep, involves: ch.involves ?? t?.involves ?? [], notes: [...(t?.notes ?? []), ...(ch.note ? [ch.note] : [])] }; for (const n of ch.involves ?? []) ensureChar(s, n, ep); break; }
    case "thread.close": { const k = slug(ch.title), t = s.threads[k] ?? { key: k, title: ch.title, status: "open" as const, openedIn: ep, involves: [], notes: [] }; s.threads[k] = { ...t, status: "closed", closedIn: ep, notes: [...t.notes, ...(ch.note ? [ch.note] : [])] }; break; }
    case "fact.add": {
      const k = ch.key ? slug(ch.key) : "";
      if (k) { const i = s.facts.findIndex((f) => f.k && slug(f.k) === k); const f = { key: `f_${hash(ch.text)}`, text: ch.text, k: ch.key, v: ch.value, ep, knownBy: ch.knownBy ?? [] }; if (i >= 0) s.facts[i] = f; else s.facts.push(f); }
      else if (!s.facts.some((f) => f.text === ch.text)) s.facts.push({ key: `f_${hash(ch.text)}`, text: ch.text, ep, knownBy: ch.knownBy ?? [] });
      break; }
    case "rule.add": if (!s.rules.some((r) => r.text === ch.text)) s.rules.push({ key: `r_${hash(ch.text)}`, text: ch.text, ep }); break;
    case "place.update": { const k = slug(ch.name), p = (s.places[k] ??= { key: k, name: ch.name.trim(), notes: [], firstSeen: ep, lastSeen: ep }); p.lastSeen = Math.max(p.lastSeen, ep); if (ch.note && !p.notes.includes(ch.note)) p.notes.push(ch.note); break; }
    case "series.set": { s.series = { protagonist: ch.protagonist, ...(ch.title ? { title: ch.title } : {}) }; ensureChar(s, ch.protagonist, ep); break; }
    case "stage.define": { const k = slug(ch.key); (s.stages ??= {})[k] = { key: k, title: ch.title, order: ch.order, facets: ch.facets }; break; }
    case "milestone.define": { const k = slug(ch.key), prev = s.milestones?.[k]; (s.milestones ??= {})[k] = { key: k, title: ch.title, stage: slug(ch.stage), order: ch.order, status: prev?.status ?? "pending", startedIn: prev?.startedIn, achievedIn: prev?.achievedIn, episodes: prev?.episodes ?? [], notes: prev?.notes ?? [] }; break; }
    case "milestone.progress": {
      const m = findMilestone(s, ch.key); if (!m) break; const mm = s.milestones![m.key];
      if (mm.status !== "achieved" || ch.status === "achieved") mm.status = ch.status; if (mm.startedIn === undefined) mm.startedIn = ep; if (ch.status === "achieved") mm.achievedIn = ep;
      if (!mm.episodes.includes(ep)) mm.episodes.push(ep); if (ch.note) mm.notes.push(ch.note); break; }
    case "character.stage": { const c = ensureChar(s, ch.name, ep), st = findStage(s, ch.stage), v = st?.key ?? slug(ch.stage); c.stage = v; c.stageHistory = push(c.stageHistory, ep, v); if (ch.note) c.notes.push(ch.note); break; }
    case "character.age": { const c = ensureChar(s, ch.name, ep); c.age = ch.age; c.ageHistory = push(c.ageHistory, ep, ch.age); break; }
    case "character.profile": { const c = ensureChar(s, ch.name, ep), k = slug(ch.facet), p = (c.profile ??= {})[k]; c.profile[k] = { value: ch.value, history: push(p?.history, ep, ch.value) }; break; }
    case "character.trait": { const c = ensureChar(s, ch.name, ep), k = slug(ch.trait), t = (c.traits ??= {})[k]; c.traits[k] = { level: ch.level, history: push(t?.history, ep, ch.level) }; break; }
    case "character.appearance": { const c = ensureChar(s, ch.name, ep); c.appearance = { description: ch.description, designVersion: ch.designVersion, ep, history: push(c.appearance?.history, ep, ch.description) }; break; }
    case "event.add": { s.events.push({ id: `e_${hash(`${ep}|${ch.title}`)}`, ep, title: ch.title, summary: ch.summary, participants: ch.participants ?? [] }); for (const n of ch.participants ?? []) ensureChar(s, n, ep); break; }
  }
  s.asOf = Math.max(s.asOf, ep);
  return s;
}

export function applyChanges(state: CanonState, changes: Change[], ep: number): CanonState { return changes.reduce((s, c) => applyChange(s, c, ep), state); }

/** Marca como «vistos» en el episodio a quienes aparecen en él (para saber quién estuvo en cada episodio). */
export function markPresent(state: CanonState, names: string[], ep: number): CanonState {
  const s = cloneCanon(state);
  for (const n of names) { const c = ensureChar(s, n, ep); c.lastSeen = Math.max(c.lastSeen, ep); }
  s.asOf = Math.max(s.asOf, ep); return s;
}

/** Identificador estable de un cambio: el mismo cambio genera el mismo id aunque se recalcule la propuesta (así se conservan las decisiones). */
export function changeId(ch: Change): string {
  const { kind, ...rest } = ch as Change & Record<string, unknown>;
  const norm = JSON.stringify(Object.keys(rest).sort().map((k) => [k, typeof rest[k] === "string" ? slug(rest[k] as string) : rest[k]]));
  return `c_${hash(kind + norm)}`;
}

/** Texto legible, en castellano, de un cambio (lo que se muestra en «Cambios propuestos»). */
export function describeChange(ch: Change, before?: CanonState): string {
  const q = (s: string) => `«${s}»`;
  switch (ch.kind) {
    case "character.add": return `Nuevo personaje en el canon: ${ch.name}${ch.note ? ` (${ch.note})` : ""}`;
    case "character.status": return ch.status === "dead" ? `${ch.name} muere` : ch.status === "absent" ? `${ch.name} queda ausente` : `${ch.name} reaparece / vuelve a estar activo`;
    case "character.location": return `${ch.name} termina en ${ch.location}`;
    case "character.outfit": return `${ch.name} lleva ${ch.outfit}`;
    case "character.knows": return `${ch.name} sabe: ${ch.fact}`;
    case "relationship.set": { const prev = before?.relationships[relKey(ch.a, ch.b)]; return `${ch.a} y ${ch.b}: ${ch.relation}${ch.trust !== undefined ? ` (confianza ${ch.trust > 0 ? "+" : ""}${ch.trust})` : ""}${prev ? ` — antes: ${prev.relation}` : " — relación nueva"}`; }
    case "object.introduce": return `Objeto nuevo: ${q(ch.name)}${ch.owner ? ` (de ${ch.owner})` : ""}`;
    case "object.update": {
      const known = before?.objects[slug(ch.name)]; const parts: string[] = [];
      if (ch.status === "destroyed") parts.push("queda destruido"); else if (ch.status === "lost") parts.push("se pierde"); else if (ch.status === "damaged") parts.push("queda dañado"); else if (ch.status === "intact") parts.push(known && known.status !== "intact" ? "vuelve a estar en buen estado" : "");
      if (ch.owner) parts.push(`${ch.owner} lo obtiene`); else if (ch.owner === null && ch.status !== "lost" && ch.status !== "destroyed") parts.push("queda sin dueño");
      if (ch.location) parts.push(`está en ${ch.location}`);
      return `${q(ch.name)}${known ? "" : " (nuevo)"}: ${parts.filter(Boolean).join("; ") || "se modifica"}`; }
    case "thread.open": return `Se abre el hilo ${q(ch.title)}${ch.involves?.length ? ` (${ch.involves.join(", ")})` : ""}`;
    case "thread.close": return `Se cierra el hilo ${q(ch.title)}`;
    case "fact.add": return `Hecho confirmado: ${ch.text}${ch.supersede ? " (corrige el anterior)" : ""}`;
    case "rule.add": return `Regla del universo: ${ch.text}`;
    case "place.update": return `Lugar ${q(ch.name)}${ch.note ? `: ${ch.note}` : ""}`;
    case "event.add": return `Acontecimiento: ${ch.title}`;
    case "series.set": return `Serie sobre ${ch.protagonist}${ch.title ? ` («${ch.title}»)` : ""}`;
    case "stage.define": return `Etapa de vida «${ch.title}» (${ch.facets.length} rasgos a seguir)`;
    case "milestone.define": return `Hito del arco ${ch.order}: ${ch.title}`;
    case "milestone.progress": { const m = before ? findMilestone(before, ch.key) : undefined; return `${ch.status === "achieved" ? "Hito logrado" : "Hito en curso"}: ${m?.title ?? ch.key}${ch.note ? ` — ${ch.note}` : ""}`; }
    case "character.stage": return `${ch.name} entra en la etapa «${before ? findStage(before, ch.stage)?.title ?? ch.stage : ch.stage}»${before?.characters[slug(ch.name)]?.stage ? ` (antes: ${before.stages?.[before.characters[slug(ch.name)].stage!]?.title ?? before.characters[slug(ch.name)].stage})` : ""}`;
    case "character.age": { const prev = before?.characters[slug(ch.name)]?.age; return `${ch.name} tiene ≈ ${ch.age} años${prev !== undefined ? ` (antes ${prev})` : ""}`; }
    case "character.profile": { const prev = before?.characters[slug(ch.name)]?.profile?.[slug(ch.facet)]?.value; return `${ch.name} · ${ch.facet}: ${ch.value}${prev ? ` (antes: ${prev})` : ""}`; }
    case "character.trait": { const prev = before?.characters[slug(ch.name)]?.traits?.[slug(ch.trait)]?.level; return `${ch.name} · ${ch.trait}: nivel ${ch.level}/10${prev !== undefined ? ` (antes ${prev})` : ""}`; }
    case "character.appearance": return `${ch.name} · aspecto: ${ch.description}${ch.designVersion ? ` (diseño v${ch.designVersion})` : ""}`;
  }
}
export const asProposed = (ch: Change, origin: ProposedChange["origin"], before?: CanonState, scene?: number): ProposedChange => ({ id: changeId(ch), change: ch, origin, decision: "pending", ...(scene !== undefined ? { scene } : {}), text: describeChange(ch, before) });

export { epLabel };
