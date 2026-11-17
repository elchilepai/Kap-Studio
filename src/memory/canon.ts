/** El canon como LIBRO DE CAMBIOS: el estado actual es el pliegue (fold) ordenado de los cambios aceptados. Puro y determinista. */
import type { CanonState, Change, CharState, ObjState, ProposedChange } from "./schema.ts";
import { epLabel, hash, slug } from "./text.ts";

export const emptyCanon = (): CanonState => ({ asOf: 0, characters: {}, relationships: {}, objects: {}, threads: {}, places: {}, facts: [], rules: [], events: [] });
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
  }
}
export const asProposed = (ch: Change, origin: ProposedChange["origin"], before?: CanonState, scene?: number): ProposedChange => ({ id: changeId(ch), change: ch, origin, decision: "pending", ...(scene !== undefined ? { scene } : {}), text: describeChange(ch, before) });

export { epLabel };
