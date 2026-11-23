/**
 * IDEAS V3 (módulo puro) — una idea es una PEQUEÑA HISTORIA con cadena causal: situación → motivo → acción → consecuencia → decisión → nueva acción → resultado → mentalidad, contada con 8-14 viñetas
 * que son ACONTECIMIENTOS distintos (no planos distintos de lo mismo). Pocas reglas, todas bloqueantes: si falla una, la idea se DESCARTA (no se salva con puntuación). La coherencia semántica la comprueba
 * después un crítico (Qwen, en otra llamada). La puntuación solo se calcula para las ideas que sobreviven y discrimina de verdad.
 */
import { CLICKBAIT, textWarningIds } from "./shortSafety.ts";
import { BANNED_OPENINGS, wordCount } from "./visualShort.ts";
import { GENERIC, acts, mentions } from "./ideasV2.ts";
import { similarity } from "./ideas.ts";

export const CATEGORIES_V3 = ["aprobacion", "comparacion", "justificarse", "evitacion", "hablar-sin-hacer"] as const;
export type CategoryV3 = (typeof CATEGORIES_V3)[number];
export const FUNCIONES = ["situacion", "motivo", "accion", "consecuencia", "decision", "nueva-accion", "resultado", "metafora"] as const;
export type Funcion = (typeof FUNCIONES)[number];
export const PLANOS = ["general", "medio", "primer-plano", "detalle"] as const;
export const PERSPECTIVAS = ["frontal", "lateral", "cenital", "contrapicado", "pov", "espalda"] as const;
export type Vineta = { funcion: Funcion; sujeto: string; que: string; objeto: string; plano: (typeof PLANOS)[number]; perspectiva: (typeof PERSPECTIVAS)[number]; composicion: string };
export type IdeaV3 = { category: CategoryV3; titulo: string; situacion: string; motivo: string; accionKap: string; objeto: string; consecuencia: string; decision: string; nuevaAccion: string; resultado: string; mentalidad: string; vinetas: Vineta[] };
export type Block = { id: string; msg: string };
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Acontecimientos que son solo reacción: mirar, pensar, suspirar, respirar, sonreír, quedarse quieto. */
export const REACCION = /\b(?:mira\w*|observa\w*|piensa\w*|suspira\w*|respira\w*|sonrie\w*|sonrisa|se queda\w*|cruza\w* los brazos|reflexiona\w*|duda\w*|se siente|parpadea\w*|se pregunta)\b/;
/** El verbo principal de KAP es un estado o una reacción (callarse, mirar, pensar, esperar…), no una acción. */
const mainPassive = (t: string) => /^\s*kap\s+(?:se\s+(?:queda|calla|siente|paraliza|bloquea|encoge)|piensa|mira|observa|reflexiona|duda|espera|escucha|siente|imagina)\w*\b/.test(plain(t));
const MENTALIDAD_PROHIBIDA = /^\s*(?:a veces|el problema es|debes entender|la clave es|recuerda que|hay que|lo importante es|tienes que|siempre|nunca)\b/;
export const isReaction = (v: Vineta) => REACCION.test(plain(v.que)) && !acts(v.que.replace(REACCION, ""));

/** Cadena causal y estructura: SOLO bloqueos (cada fallo descarta la idea). */
export function blocks(i: IdeaV3): Block[] {
  const b: Block[] = [], add = (id: string, msg: string) => b.push({ id, msg });
  for (const [k, min] of [["situacion", 10], ["motivo", 8], ["accionKap", 6], ["consecuencia", 8], ["decision", 8], ["nuevaAccion", 6], ["resultado", 8], ["mentalidad", 10]] as const) if (wordCount(i[k]) < min) add("cadena", `${k}: demasiado corto (< ${min} palabras): la cadena no está completa`);
  if (!/^\s*kap\b/i.test(i.accionKap) || !acts(i.accionKap) || mainPassive(i.accionKap)) add("accion", "la acción principal no es una acción visible de KAP (o es pasiva)");
  if (!/^\s*kap\b/i.test(i.nuevaAccion) || !acts(i.nuevaAccion) || mainPassive(i.nuevaAccion) || similarity(i.accionKap, i.nuevaAccion) >= 0.5) add("nueva-accion", "la nueva acción no es una acción visible distinta de la primera");
  if (MENTALIDAD_PROHIBIDA.test(plain(i.mentalidad)) || GENERIC.test(plain(i.mentalidad)) || !/\bkap\b/i.test(i.mentalidad)) add("mentalidad", "la mentalidad es una moraleja genérica o no dice qué ha entendido KAP");
  const all = plain([i.titulo, i.situacion, i.motivo, i.accionKap, i.consecuencia, i.decision, i.nuevaAccion, i.resultado, i.mentalidad, ...i.vinetas.map((v) => v.que)].join(" "));
  const bad = textWarningIds(all); if (bad.length || CLICKBAIT.test(all) || GENERIC.test(all)) add("contenido", `coach genérico, clickbait o contenido no permitido${bad.length ? ` (${bad.join(", ")})` : ""}`);
  const v = i.vinetas, n = v.length;
  if (n < 8 || n > 14) add("vinetas", `${n} viñetas (deben ser 8-14)`);
  else {
    const first = (f: Funcion) => v.findIndex((x) => x.funcion === f), order = ["accion", "consecuencia", "decision", "nueva-accion", "resultado"] as const, idx = order.map(first);
    if (idx.some((x) => x < 0) || idx.some((x, k) => k > 0 && x < idx[k - 1])) add("vinetas", "las viñetas no cuentan la cadena en orden (acción → consecuencia → decisión → nueva acción → resultado)");
    if (v.filter(isReaction).length > Math.floor(n * 0.3)) add("vinetas", `demasiadas viñetas son solo reacción (mirar, pensar, respirar…): ${v.filter(isReaction).length} de ${n} (máx. ${Math.floor(n * 0.3)})`);
    let rep = false; v.forEach((x, a) => v.forEach((y, c) => { if (c < a && similarity(x.que, y.que) >= 0.5) rep = true; })); if (rep || v.some((x) => wordCount(x.que) < 5)) add("vinetas", "hay viñetas que repiten el mismo acontecimiento o no describen un acontecimiento");
    if (!v.some((x) => !/\bkap\b/i.test(x.sujeto))) add("vinetas", "ninguna viñeta se cuenta sin KAP en pantalla (objeto, entorno, POV o consecuencia)");
  }
  return b;
}
/** ¿Dos ideas son la misma? título, acción, situación, conclusión u objeto + conflicto. */
export function duplicateV3(a: IdeaV3, b: IdeaV3): string | undefined {
  if (plain(a.titulo) === plain(b.titulo) || similarity(a.titulo, b.titulo) >= 0.5) return "título igual o casi idéntico";
  if (similarity(a.accionKap, b.accionKap) >= 0.45) return "misma acción"; if (similarity(a.situacion, b.situacion) >= 0.4) return "misma situación"; if (similarity(a.mentalidad, b.mentalidad) >= 0.5) return "misma conclusión";
  if ((plain(a.objeto) === plain(b.objeto) || similarity(a.objeto, b.objeto) >= 0.6) && (similarity(a.motivo, b.motivo) >= 0.25 || similarity(a.consecuencia, b.consecuencia) >= 0.25)) return "mismo objeto y mismo conflicto";
}

/** Veredicto del crítico de coherencia (otra llamada a Qwen): 7 enlaces + causalidad + 3 valoraciones 1-5 ancladas. */
export const ENLACES = ["situacion-motivo", "motivo-accion", "accion-consecuencia", "consecuencia-decision", "decision-nueva-accion", "nueva-accion-resultado", "resultado-mentalidad"] as const;
export type Critic = { enlaces: { enlace: (typeof ENLACES)[number]; coherente: boolean; motivo: string }[]; accionCausadaPorMotivo: boolean; identificacion: number; fuerzaSituacion: number; potencialShort: number };
export function criticBlocks(c: Critic): Block[] {
  const b: Block[] = [], missing = ENLACES.filter((e) => !c.enlaces.some((x) => x.enlace === e)); if (missing.length) b.push({ id: "coherencia", msg: `el crítico no evaluó: ${missing.join(", ")}` });
  for (const e of c.enlaces) if (!e.coherente) b.push({ id: "coherencia", msg: `enlace roto «${e.enlace}»: ${e.motivo}` });
  if (!c.accionCausadaPorMotivo) b.push({ id: "causalidad", msg: "la acción no está causada por el conflicto/motivo" }); return b;
}

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));
/** Puntuación (solo para ideas que superan los bloqueos). Criterios medibles en código + 3 valoraciones del crítico ancladas (3 = normal, 5 = excepcional). Reparte de verdad: lo normal queda en 4-6. */
export function scoreV3(i: IdeaV3, others: IdeaV3[], c?: Critic): { subs: Record<string, number>; score: number } {
  const v = i.vinetas, n = v.length, react = v.filter(isReaction).length, funcs = new Set(v.map((x) => x.funcion)).size, objs = new Set(v.map((x) => plain(x.objeto).slice(0, 5)).filter((s) => s.trim())).size, noKap = v.filter((x) => !/\bkap\b/i.test(x.sujeto)).length;
  const maxSim = others.reduce((m, o) => Math.max(m, similarity(`${i.situacion} ${i.accionKap} ${i.objeto}`, `${o.situacion} ${o.accionKap} ${o.objeto}`)), 0);
  const subs: Record<string, number> = {
    variedadAcontecimientos: clamp(10 * (1 - react / n) * (funcs / 8) * (1 - Math.max(0, maxSimInside(v) - 0.15))),
    visualidad: clamp(Math.min(4, objs) * 1.5 + (noKap >= 2 && noKap <= Math.ceil(n * 0.5) ? 4 : noKap > 0 ? 2 : 0)),
    transformacion: clamp((similarity(i.accionKap, i.nuevaAccion) < 0.25 ? 4 : 2) + (mentions(i.objeto, i.resultado) ? 3 : 0) + (similarity(i.mentalidad, `${i.accionKap} ${i.nuevaAccion} ${i.motivo}`) >= 0.12 ? 3 : 0)),
    originalidad: clamp(10 * (1 - maxSim / 0.4)),
    ...(c ? { identificacion: clamp((c.identificacion - 1) * 2.5), fuerzaSituacion: clamp((c.fuerzaSituacion - 1) * 2.5), potencialShort: clamp((c.potencialShort - 1) * 2.5) } : {}),
  };
  const w: Record<string, number> = { variedadAcontecimientos: 2, visualidad: 1.5, transformacion: 1.5, originalidad: 1, identificacion: 1.2, fuerzaSituacion: 1.2, potencialShort: 1.2 }; let s = 0, t = 0; for (const [k, x] of Object.entries(subs)) { s += x * (w[k] ?? 1); t += w[k] ?? 1; }
  return { subs, score: Math.round((s / t) * 10) / 10 };
}
const maxSimInside = (v: Vineta[]) => { let m = 0; v.forEach((a, x) => v.forEach((b, y) => { if (y < x) m = Math.max(m, similarity(a.que, b.que)); })); return m; };

// ---------------------------------------------------------------- hooks V3
export const HOOK_KINDS_V3 = ["situacion", "conflicto", "curiosidad", "contradiccion", "mini-historia"] as const;
export type HookKindV3 = (typeof HOOK_KINDS_V3)[number];
export type HookV3 = { type: HookKindV3; text: string };
/** Persona gramatical de un hook: primera (yo/me/mi o pretérito en -é/-í), segunda (tú/tu/te) o tercera (KAP, él). */
export function persona(t: string): "primera" | "segunda" | "tercera" {
  const s = plain(t), words = t.toLowerCase().match(/[a-záéíóúñ]+/g) ?? [], pret = words.filter((w) => /[eé]$|[ií]$/.test(w) && /[éí]$/.test(w) && !["qué", "sé", "así", "allí", "ahí", "aquí", "sí", "mí", "porqué", "café", "té"].includes(w));
  if (/\b(?:yo|me|mi|mis|conmigo)\b/.test(s) || pret.length) return "primera"; if (/\b(?:tu|tus|te|ti|contigo)\b/.test(s) || /\b(?:estas|haces|tienes|sabes|quieres|puedes|vas)\b/.test(s)) return "segunda"; return "tercera";
}
const STARTS = /^\s*(?:¿?qu[eé] pas[oó] cuando|sab[ií]a que|a veces|el problema es|debes entender|tu vida cambia|no necesitas|recuerda que|hoy |en este |vamos a|te voy a|aprende|descubre)/i;
const APHORISM = /\bno es (?:un|una|solo|solamente)\b[^.?!]*\bes (?:un|una)\b|\bdisfrazad[oa]\b|\bte arruinan? la vida\b|\bla vida (?:es|te)\b/i;
const ctxOf = (i: IdeaV3) => [i.titulo, i.situacion, i.accionKap, i.objeto, i.consecuencia, i.decision].join(" ");
const STOP = new Set(["cuando", "nunca", "personas", "quieren", "siempre", "decir", "saben", "cosas", "hacer", "tiene", "veces", "porque", "donde", "mismo", "antes", "despues", "ahora", "entre", "sobre", "desde", "hasta", "quien", "otras", "otros"]);
const stemsOf = (t: string) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
const anchors = (t: string, i: IdeaV3) => { const c = stemsOf(ctxOf(i)); return [...stemsOf(t)].filter((s) => c.has(s)).length; };
export function hookIssuesV3(h: HookV3, i: IdeaV3): string[] {
  const why: string[] = [], n = wordCount(h.text); if (n < 8 || n > 22) why.push(`${n} palabras (8-22)`); if (STARTS.test(h.text) || BANNED_OPENINGS.test(h.text)) why.push("empieza con una fórmula prohibida");
  if (APHORISM.test(h.text) || GENERIC.test(plain(h.text))) why.push("suena a aforismo o frase de coach"); if (CLICKBAIT.test(plain(h.text))) why.push("clickbait"); if (anchors(h.text, i) < 1) why.push("no nace de la situación");
  return why;
}
export function hookSetIssuesV3(hooks: HookV3[], i: IdeaV3): string[] {
  const why: string[] = []; if (hooks.length !== 5) why.push(`hay ${hooks.length} hooks (deben ser 5)`); const missing = HOOK_KINDS_V3.filter((k) => !hooks.some((h) => h.type === k)); if (missing.length) why.push(`faltan tipos: ${missing.join(", ")}`);
  const ps = new Set(hooks.map((h) => persona(h.text))); if (ps.size > 1) why.push(`mezcla personas gramaticales (${[...ps].join(", ")}): usa solo tercera persona con KAP`);
  const starts = hooks.map((h) => plain(h.text).split(/\s+/).slice(0, 2).join(" ")); if (new Set(starts).size < 4) why.push("los hooks empiezan casi igual");
  hooks.forEach((h, a) => hooks.forEach((g, c) => { if (c < a && similarity(h.text, g.text) >= 0.5) why.push(`el hook ${a + 1} repite al ${c + 1}`); })); hooks.forEach((h, a) => { const bad = hookIssuesV3(h, i); if (bad.length) why.push(`hook ${a + 1}: ${bad.join("; ")}`); });
  return why;
}
/** Los 3 hooks finales: los mejor anclados, de tipos distintos y sin empezar igual. Prefiere tercera persona. */
export function pickHooks(hooks: HookV3[], i: IdeaV3, k = 3): HookV3[] {
  const rank = hooks.map((h) => ({ h, s: Math.min(3, anchors(h.text, i)) + (persona(h.text) === "tercera" ? 1 : 0) + (/\?|\bpero\b|\bhasta\b|\bantes de\b|\bdespués\b|\botra vez\b/i.test(h.text) ? 1 : 0) - hookIssuesV3(h, i).length * 2 })).sort((a, b) => b.s - a.s), out: HookV3[] = [];
  for (const { h } of rank) { if (out.length >= k) break; if (out.some((o) => o.type === h.type || plain(o.text).split(/\s+/)[0] === plain(h.text).split(/\s+/)[0])) continue; out.push(h); }
  for (const { h } of rank) { if (out.length >= k) break; if (!out.includes(h)) out.push(h); } return out;
}
