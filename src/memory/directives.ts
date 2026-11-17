/**
 * Directivas de memoria del guion: líneas `[clave: valor]` que el autor escribe para declarar qué cambia en la historia.
 * Es la forma de declarar hechos SIN IA (y la misma estructura que devolverá un modelo). Nunca se narran ni se subtitulan.
 *
 *   [conoce: Alex, Laura]            [obtiene: Alex, bicicleta]       [pierde: Alex, bicicleta]
 *   [destruye: teléfono]             [repara: teléfono]               [usa: Alex, bicicleta]
 *   [abre-hilo: deuda con Marcos | Alex, Marcos]    [cierra-hilo: deuda con Marcos]
 *   [relacion: Alex, Marcos, deuda, -1]              [hecho: faro.estado = abandonado]   [corrige-hecho: …]
 *   [regla: nadie puede salir de la ciudad]          [sabe: Alex | Marcos tiene la llave]
 *   [ropa: Alex, chaqueta roja]      [ubicacion: Alex, Faro]          [lugar: Faro | abandonado]
 *   [muere: X]  [ausente: X]  [reaparece: X]         [momento: Día 3, noche]   [flashback: sí]   [continua: 6]   [evento: título | resumen]
 */
import { Change, type Act, type ActKind } from "./schema.ts";
import { norm } from "./text.ts";

export const MEMORY_KEYS = new Set(["conoce", "relacion", "obtiene", "pierde", "destruye", "repara", "usa", "abre-hilo", "cierra-hilo", "hecho", "corrige-hecho", "regla", "sabe", "ropa", "ubicacion", "muere", "ausente", "reaparece", "lugar", "momento", "flashback", "continua", "evento",
  "protagonista", "etapa", "edad", "perfil", "atributo", "aspecto", "hito", "hito-logrado", "acto", "gancho"]);
export const isMemoryKey = (k: string) => MEMORY_KEYS.has(norm(k).replace(/\s+/g, "-"));

export type Usage = { who?: string; object: string };
export type ParsedMemory = { changes: Change[]; uses: Usage[]; acts: Act[]; hook?: string; moment?: string; flashback?: boolean; continues?: number; errors: string[] };
const ACT_ALIASES: Record<string, ActKind> = { inicio: "inicio", planteamiento: "inicio", conflicto: "conflicto", desarrollo: "desarrollo", emocional: "emocional", tension: "emocional", "punto-emocional": "emocional", "punto-de-tension": "emocional", resolucion: "resolucion", "resolucion-parcial": "resolucion", gancho: "gancho" };

const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const bar = (v: string) => v.split("|").map((s) => s.trim());

/** Interpreta las directivas de memoria de UNA escena (cada una como «clave: valor»). Tolerante: lo que no entiende se devuelve en `errors`. */
export function parseMemoryDirectives(lines: string[]): ParsedMemory {
  const out: ParsedMemory = { changes: [], uses: [], acts: [], errors: [] };
  const push = (c: unknown, raw: string) => { const r = Change.safeParse(c); if (r.success) out.changes.push(r.data); else out.errors.push(`«${raw}»: ${r.error.issues[0]?.message ?? "no válida"}`); };
  for (const raw of lines) {
    const i = raw.indexOf(":"); if (i < 0) { out.errors.push(`«${raw}»: falta «:»`); continue; }
    const key = norm(raw.slice(0, i)).replace(/\s+/g, "-"), val = raw.slice(i + 1).trim(); if (!val && key !== "flashback") { out.errors.push(`«${raw}»: sin valor`); continue; }
    const a = list(val);
    const who2 = () => (a.length >= 2 ? { who: a[0], obj: a.slice(1).join(", ") } : { who: undefined, obj: a[0] });
    switch (key) {
      case "conoce": if (a.length < 2) { out.errors.push(`«${raw}»: indica dos personajes`); break; }
        push({ kind: "relationship.set", a: a[0], b: a[1], relation: "conocidos", trust: 0 }, raw); push({ kind: "event.add", title: `${a[0]} conoce a ${a[1]}`, participants: [a[0], a[1]] }, raw); break;
      case "relacion": { if (a.length < 3) { out.errors.push(`«${raw}»: usa «A, B, tipo[, −2..2]»`); break; }
        const t = a[3] !== undefined && /^[+-]?\d+$/.test(a[3]) ? Math.max(-2, Math.min(2, parseInt(a[3], 10))) : undefined; push({ kind: "relationship.set", a: a[0], b: a[1], relation: a[2], ...(t !== undefined ? { trust: t } : {}) }, raw); break; }
      case "obtiene": { const { who, obj } = who2(); if (!who) push({ kind: "object.introduce", name: obj }, raw); else push({ kind: "object.update", name: obj, status: "intact", owner: who }, raw);
        if (who) push({ kind: "event.add", title: `${who} obtiene ${obj}`, participants: [who] }, raw); break; }
      case "pierde": { const { who, obj } = who2(); push({ kind: "object.update", name: obj, status: "lost", owner: null }, raw); push({ kind: "event.add", title: who ? `${who} pierde ${obj}` : `Se pierde ${obj}`, participants: who ? [who] : [] }, raw); break; }
      case "destruye": { const { who, obj } = who2(); push({ kind: "object.update", name: obj, status: "destroyed", owner: null }, raw); push({ kind: "event.add", title: who ? `${who} destruye ${obj}` : `${obj} queda destruido`, participants: who ? [who] : [] }, raw); break; }
      case "repara": { const { obj } = who2(); push({ kind: "object.update", name: obj, status: "intact" }, raw); break; }
      case "usa": { if (a.length < 2) out.uses.push({ object: a[0] }); else out.uses.push({ who: a[0], object: a.slice(1).join(", ") }); break; }
      case "abre-hilo": { const [t, who] = bar(val); push({ kind: "thread.open", title: t, ...(who ? { involves: list(who) } : {}) }, raw); break; }
      case "cierra-hilo": push({ kind: "thread.close", title: bar(val)[0] }, raw); break;
      case "hecho": case "corrige-hecho": { const m = /^\s*([^=]{1,60}?)\s*=\s*(.+)$/.exec(val); push({ kind: "fact.add", text: val, ...(m ? { key: m[1].trim(), value: m[2].trim() } : {}), ...(key === "corrige-hecho" ? { supersede: true } : {}) }, raw); break; }
      case "regla": push({ kind: "rule.add", text: val }, raw); break;
      case "sabe": { const [who, fact] = bar(val); if (!who || !fact) { out.errors.push(`«${raw}»: usa «Quién | qué sabe»`); break; } push({ kind: "character.knows", name: who, fact }, raw); break; }
      case "ropa": { if (a.length < 2) { out.errors.push(`«${raw}»: usa «Quién, prenda»`); break; } push({ kind: "character.outfit", name: a[0], outfit: a.slice(1).join(", ") }, raw); break; }
      case "ubicacion": { if (a.length < 2) { out.errors.push(`«${raw}»: usa «Quién, lugar»`); break; } push({ kind: "character.location", name: a[0], location: a.slice(1).join(", ") }, raw); break; }
      case "muere": for (const n of a) push({ kind: "character.status", name: n, status: "dead" }, raw); break;
      case "ausente": for (const n of a) push({ kind: "character.status", name: n, status: "absent" }, raw); break;
      case "reaparece": for (const n of a) push({ kind: "character.status", name: n, status: "active" }, raw); break;
      case "lugar": { const [n, note] = bar(val); push({ kind: "place.update", name: n, ...(note ? { note } : {}) }, raw); break; }
      case "evento": { const [t, s] = bar(val); push({ kind: "event.add", title: t, ...(s ? { summary: s } : {}) }, raw); break; }
      case "protagonista": { const [n, t] = bar(val); push({ kind: "series.set", protagonist: n, ...(t ? { title: t } : {}) }, raw); break; }
      case "etapa": { if (a.length < 2) { out.errors.push(`«${raw}»: usa «Quién, etapa»`); break; } push({ kind: "character.stage", name: a[0], stage: a.slice(1).join(", ") }, raw); break; }
      case "edad": { const n = parseInt(/\d+/.exec(a[1] ?? "")?.[0] ?? "", 10); if (a.length < 2 || !Number.isFinite(n)) { out.errors.push(`«${raw}»: usa «Quién, años»`); break; } push({ kind: "character.age", name: a[0], age: n }, raw); break; }
      case "perfil": case "atributo": { const i2 = val.indexOf(","), rest = i2 < 0 ? "" : val.slice(i2 + 1), m = /^\s*([^=]{1,60}?)\s*=\s*(.+)$/.exec(rest);
        if (i2 < 0 || !m) { out.errors.push(`«${raw}»: usa «Quién, ${key === "perfil" ? "rasgo = valor" : "atributo = 0..10"}»`); break; }
        if (key === "perfil") push({ kind: "character.profile", name: val.slice(0, i2).trim(), facet: m[1].trim(), value: m[2].trim() }, raw);
        else { const lv = parseInt(m[2], 10); if (!Number.isFinite(lv)) out.errors.push(`«${raw}»: el nivel debe ser un número 0..10`); else push({ kind: "character.trait", name: val.slice(0, i2).trim(), trait: m[1].trim(), level: lv }, raw); }
        break; }
      case "aspecto": { const i2 = val.indexOf(","); if (i2 < 0) { out.errors.push(`«${raw}»: usa «Quién, descripción[ | vN]»`); break; } const [d, v] = bar(val.slice(i2 + 1)), dv = v ? parseInt(/\d+/.exec(v)?.[0] ?? "", 10) : NaN; push({ kind: "character.appearance", name: val.slice(0, i2).trim(), description: d, ...(Number.isFinite(dv) ? { designVersion: dv } : {}) }, raw); break; }
      case "hito": case "hito-logrado": { const [k, note] = bar(val); push({ kind: "milestone.progress", key: k, status: key === "hito" ? "in_progress" : "achieved", ...(note ? { note } : {}) }, raw); break; }
      case "acto": { const [k, t] = bar(val), kind = ACT_ALIASES[norm(k).replace(/\s+/g, "-")]; if (!kind || !t) { out.errors.push(`«${raw}»: usa «inicio|conflicto|desarrollo|emocional|resolucion|gancho | texto»`); break; } out.acts.push({ kind, text: t }); break; }
      case "gancho": out.hook = val; out.acts.push({ kind: "gancho", text: val }); break;
      case "momento": out.moment = val; break;
      case "flashback": out.flashback = !/^(no|false|0)$/i.test(val); break;
      case "continua": { const n = parseInt(/\d+/.exec(val)?.[0] ?? "", 10); if (Number.isFinite(n)) out.continues = n; else out.errors.push(`«${raw}»: indica el número de episodio`); break; }
      default: out.errors.push(`«${raw}»: directiva de memoria desconocida`);
    }
  }
  return out;
}

/** Cambios + usos declarados por varias directivas sueltas (p. ej. las que escribe el usuario en el panel). */
export const parseManual = (text: string): ParsedMemory => parseMemoryDirectives(text.split(/\n+/).map((l) => l.trim().replace(/^\[|\]$/g, "").trim()).filter(Boolean));
