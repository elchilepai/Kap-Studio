/**
 * IDEAS V2 (módulo puro) — ideas nacidas de una ACCIÓN, pensadas para 8-14 ilustraciones estáticas 2D (stickman) con KAP de protagonista. Una idea no se «salva con puntuación»: el código aplica
 * puertas de calidad (acción visible, conflicto, objeto, consecuencia visible, 8-14 imágenes distintas, cambio de comportamiento, sin patrón pasivo ni frase de coach) y DESCARTA la que falle;
 * detecta duplicados entre TODOS los lotes y puntúa por criterios propios (no por la autopuntuación del modelo). También define los hooks V2 (nacen de la situación, no son aforismos).
 */
import { CLICKBAIT, textWarningIds } from "./shortSafety.ts";
import { BANNED_OPENINGS, showsAction, wordCount } from "./visualShort.ts";
import { similarity } from "./ideas.ts";

export const CATEGORIES_V2 = ["limites-decir-no", "aprobacion", "disciplina", "responsabilidad", "comparacion", "rechazo", "independencia-emocional", "proposito", "decisiones", "caracter", "habitos", "autoestima", "relaciones"] as const;
export type CategoryV2 = (typeof CATEGORIES_V2)[number];
/** Tipos de plano de una imagen (variedad visual). detalle/entorno/metafora/pov no necesitan que KAP aparezca físicamente. */
export const SHOTS = ["general", "medio", "primer-plano", "pov", "cenital", "contrapicado", "detalle", "silueta", "metafora", "entorno", "kap-presenta", "reaccion", "decision"] as const;
export type Shot = (typeof SHOTS)[number];
export const NO_KAP_SHOTS: readonly Shot[] = ["detalle", "entorno", "metafora", "pov"];
export type ImageBrief = { plano: Shot; que: string };
export type IdeaV2 = { category: CategoryV2; titulo: string; situacion: string; problema: string; accionKap: string; objeto: string; consecuencia: string; momentoDecision: string; hacerDiferente: string; mentalidad: string; imagenes: ImageBrief[] };
export type Gate = { id: string; critical: boolean; msg: string };
export type EvalIdea = IdeaV2 & { id: string; fails: Gate[]; duplicateOf?: string; duplicateWhy?: string; rejected: boolean; subs: Record<string, number>; score: number };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["nunca", "siempre", "personas", "persona", "gente", "cosas", "cosa", "cuando", "porque", "donde", "quien", "mucho", "todo", "todos", "hacer", "decir", "tiene", "tener", "sabe", "saber", "quiere", "querer", "puede", "poder", "cada", "otra", "otro", "algo", "nada", "mismo", "sobre", "entre", "desde", "hasta", "como", "pero", "aunque", "despues", "antes", "ahora", "vida", "esta", "este", "esto", "para", "tambien", "solo", "cuanto", "veces", "vez", "luego", "aquello"]);
const stemSet = (t: string, stop = false) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3 && !(stop && STOP.has(w))).map((w) => w.slice(0, 5)));
/** Verbos cotidianos de hacer algo (además de los de movimiento de `showsAction`): una acción de KAP o una viñeta con alguno «se ve». */
const DOES = /\b(?:dice|responde|contesta|pide|acepta|rechaza|compra|paga|cancela|firma|guarda|devuelve|entrega|presta|ordena|limpia|organiza|arregla|revisa|publica|comparte|elimina|instala|descarga|apunta|anota|marca|corta|rompe|quema|recoge|carga|lleva|trae|prepara|apaga|enciende|empuja|golpea|llama|quita|pone|saca|mete|cuelga|dibuja|copia|pega|repite|prueba|intenta|empieza|termina|completa|cumple|llega|entra|coge|agarra|sirve|lava|cocina|compara|pospone|justifica|discute|grita|ofrece|regala|vende|invita|cede|elige|decide|escoge|cuenta|prometi\w*|mancha|ensucia|acumula|suma|resta|crece|pierde|gana|tarda|olvida|llena|vacia)\b/;
const STATIVE = new Set(["es", "esta", "siente", "piensa", "cree", "sabe", "quiere", "duda", "imagina", "recuerda", "reflexiona", "entiende", "necesita", "espera", "parece", "tiene", "mira", "observa", "ve", "escucha", "teme", "desea", "se", "queda", "calla", "siente"]);
/** «KAP + verbo conjugado» que no sea un estado (sentir, pensar, mirar…): cualquier verbo de hacer algo, sin lista cerrada. */
const kapDoes = (t: string) => { const m = /^\s*kap\s+(?:(?:se|le|lo|la|les)\s+)?([a-zñ]+)/.exec(plain(t)); return !!m && !STATIVE.has(m[1]) && /(?:a|e|o|an|en|io)$/.test(m[1]) && m[1].length > 3; };
const acts = (t: string) => showsAction(t) || DOES.test(plain(t)) || kapDoes(t);
/** ¿el texto menciona el objeto (por raíz de palabra)? */
export const mentions = (objeto: string, text: string) => { const o = stemSet(objeto); if (!o.size) return plain(text).includes(plain(objeto).trim()); const t = stemSet(text); for (const k of o) if (t.has(k)) return true; return false; };

/** El patrón que NO puede dominar: callarse, mirar al suelo/móvil/espejo, pensar, voz baja, sentirse inseguro. */
export const PASSIVE = /\b(?:se (?:queda|calla|siente|paraliza|pone a pensar)\w*|queda(?:se|ndose)? (?:callad\w+|en silencio|inmovil\w*)|mira(?:ndo|r)? (?:fijamente )?(?:al suelo|el movil|su movil|el telefono|su telefono|el espejo|su reflejo|la pantalla|al vacio)|piensa\w*|reflexiona\w*|voz (?:baja|tranquila|suave)|se da cuenta de que|se siente|inseguro)\b/;
const GENERIC = /\b(?:cree en ti|eres suficiente|tu valor no depende|zona de confort|el manana es (?:una )?excusa|trabaja en ti|a veces,? (?:debes|hay que|necesitas)|mejor version|tu puedes con todo|no depende de los demas|lo importante es)\b/;
const FEELING_ONLY = /^\s*(?:kap )?(?:se siente|siente|se da cuenta|piensa|reflexiona|entiende)\b/;

/** Puertas de calidad de UNA idea (solo devuelve las que FALLAN). critical = descarta por sí sola; ≥2 no críticas también descartan. */
export function ideaGates(i: IdeaV2): Gate[] {
  const g: Gate[] = [], add = (id: string, critical: boolean, msg: string) => g.push({ id, critical, msg }), ims = i.imagenes ?? [], all = plain([i.titulo, i.situacion, i.problema, i.accionKap, i.consecuencia, i.momentoDecision, i.hacerDiferente, i.mentalidad, ...ims.map((m) => m.que)].join(" "));
  if (!/^\s*kap\b/i.test(i.accionKap) || !acts(i.accionKap)) add("accion-visible", true, "la acción de KAP no es una acción visible que empiece por «KAP» + verbo de hacer algo");
  if (PASSIVE.test(plain(i.accionKap)) || [i.accionKap, i.hacerDiferente, i.consecuencia, i.momentoDecision].filter((t) => PASSIVE.test(plain(t))).length >= 2) add("patron-pasivo", true, "cae en el patrón pasivo (se calla / mira al suelo o al móvil / piensa / voz baja / se siente inseguro)");
  const bad = textWarningIds(all); if (bad.length) add("contenido", true, `contenido: ${bad.join(", ")}`); if (CLICKBAIT.test(all)) add("contenido", true, "clickbait"); if (GENERIC.test(all)) add("frase-coach", true, "contiene frases de coach genérico");
  if (wordCount(i.problema) < 6 || wordCount(i.situacion) < 10) add("conflicto", false, "falta un conflicto/situación concretos (problema ≥6 palabras, situación ≥10)");
  const nObj = ims.filter((m) => mentions(i.objeto, m.que)).length; if (wordCount(i.objeto) < 1 || wordCount(i.objeto) > 6 || nObj < 3) add("objeto", false, `el objeto «${i.objeto}» no es protagonista visual: aparece en ${nObj} imágenes (mínimo 3)`);
  if (wordCount(i.consecuencia) < 6 || FEELING_ONLY.test(plain(i.consecuencia)) || !(acts(i.consecuencia) || mentions(i.objeto, i.consecuencia))) add("consecuencia", false, "la consecuencia no se puede ver (es un sentimiento o no muestra un cambio)");
  const planos = new Set(ims.map((m) => m.plano)); let dup = false; ims.forEach((m, n) => ims.forEach((o, k) => { if (k < n && similarity(m.que, o.que) >= 0.6) dup = true; }));
  if (ims.length < 8 || ims.length > 14) add("imagenes", true, `${ims.length} imágenes (deben ser 8-14)`); else if (dup || planos.size < 5 || !ims.some((m) => NO_KAP_SHOTS.includes(m.plano))) add("imagenes", false, "las imágenes no son suficientemente distintas (≥5 planos distintos, ≥1 sin KAP, sin repetirse)");
  if (!acts(i.hacerDiferente) || wordCount(i.hacerDiferente) < 6 || similarity(i.accionKap, i.hacerDiferente) >= 0.5 || wordCount(i.momentoDecision) < 6) add("cambio", false, "no hay un cambio de comportamiento claro (decisión + acción distinta)");
  if (wordCount(i.mentalidad) < 6 || /^\s*(?:a veces|la vida|todos|el exito)\b/.test(plain(i.mentalidad))) add("mentalidad", false, "la mentalidad que descubre es vaga o un aforismo");
  return g;
}

/** ¿Dos ideas son la misma con otras palabras? Título, acción, situación, conclusión u objeto+conflicto. */
export function duplicateWhy(a: IdeaV2, b: IdeaV2): string | undefined {
  if (plain(a.titulo) === plain(b.titulo) || similarity(a.titulo, b.titulo) >= 0.5) return "título igual o casi idéntico";
  if (similarity(a.accionKap, b.accionKap) >= 0.45) return "misma acción";
  if (similarity(a.situacion, b.situacion) >= 0.4) return "misma situación";
  if (similarity(a.mentalidad, b.mentalidad) >= 0.5) return "misma conclusión";
  if ((plain(a.objeto) === plain(b.objeto) || similarity(a.objeto, b.objeto) >= 0.6) && (similarity(a.situacion, b.situacion) >= 0.2 || similarity(a.problema, b.problema) >= 0.25 || similarity(a.consecuencia, b.consecuencia) >= 0.25)) return "mismo objeto y mismo conflicto";
}
const core = (i: IdeaV2) => `${i.situacion} ${i.accionKap} ${i.objeto}`;
/** Juzga una idea frente a las ya aceptadas (de todos los lotes). rejected = fallo crítico, ≥2 no críticos o duplicada. */
export function judgeIdea(i: IdeaV2, prior: IdeaV2[]): { fails: Gate[]; duplicateOf?: number; duplicateWhy?: string; rejected: boolean; reasons: string[] } {
  const fails = ideaGates(i); let duplicateOf: number | undefined, why: string | undefined;
  prior.forEach((p, n) => { if (why) return; const w = duplicateWhy(i, p); if (w) { why = w; duplicateOf = n; } });
  const rejected = fails.some((f) => f.critical) || fails.length >= 2 || !!why;
  return { fails, ...(why ? { duplicateOf, duplicateWhy: why } : {}), rejected, reasons: [...fails.map((f) => f.msg), ...(why ? [`duplica una idea anterior («${prior[duplicateOf!].titulo}»): ${why}`] : [])] };
}

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));
/** Puntuación PROPIA (0-10) por criterios de código: fuerza visual, acción, conflicto, consecuencia, variedad, potencial 8-14, originalidad y transformación. No usa la autopuntuación del modelo. */
export function subScores(i: IdeaV2, others: IdeaV2[]): Record<string, number> {
  const ims = i.imagenes ?? [], planos = new Set(ims.map((m) => m.plano)), noKap = ims.filter((m) => NO_KAP_SHOTS.includes(m.plano)).length, nObj = ims.filter((m) => mentions(i.objeto, m.que)).length, act = ims.filter((m) => acts(m.que)).length;
  const maxSim = others.reduce((m, o) => Math.max(m, similarity(core(i), core(o))), 0), gates = new Set(ideaGates(i).map((g) => g.id));
  return { fuerzaVisual: clamp(Math.min(8, planos.size) * 0.75 + Math.min(2, noKap) + (nObj >= 4 ? 2 : nObj >= 3 ? 1 : 0)), accion: clamp((acts(i.accionKap) ? 4 : 0) + (acts(i.hacerDiferente) ? 3 : 0) + Math.min(3, act * 0.6)), conflicto: clamp((gates.has("conflicto") ? 2 : 6) + (wordCount(i.momentoDecision) >= 8 ? 4 : 1)), consecuencia: clamp(gates.has("consecuencia") ? 2 : mentions(i.objeto, i.consecuencia) ? 10 : 7), variedad: clamp((Math.min(8, planos.size) / 8) * 10), potencial: clamp((ims.length - 3) * 1.4), originalidad: clamp(10 * (1 - maxSim / 0.5)), transformacion: clamp((gates.has("cambio") ? 2 : 6) + (gates.has("mentalidad") ? 0 : 4)) };
}
const WEIGHTS: Record<string, number> = { fuerzaVisual: 2, accion: 2, conflicto: 1.5, consecuencia: 1.5, variedad: 1, potencial: 1, originalidad: 1.5, transformacion: 1.5 };
export const totalScore = (s: Record<string, number>) => Math.round((Object.entries(WEIGHTS).reduce((n, [k, w]) => n + (s[k] ?? 0) * w, 0) / Object.values(WEIGHTS).reduce((a, b) => a + b, 0)) * 10) / 10;

/** Evalúa TODAS las candidatas juntas: puertas, duplicados entre todas (la peor de cada pareja se marca duplicada) y puntuación propia. */
export function evaluateIdeas(ideas: IdeaV2[]): EvalIdea[] {
  const ev: EvalIdea[] = ideas.map((idea, n) => { const subs = subScores(idea, ideas.filter((_, k) => k !== n)), fails = ideaGates(idea); return { ...idea, id: `idea-${String(n + 1).padStart(2, "0")}`, fails, subs, score: totalScore(subs), rejected: fails.some((f) => f.critical) || fails.length >= 2 }; });
  for (let a = 0; a < ev.length; a++) for (let b = a + 1; b < ev.length; b++) { const w = duplicateWhy(ev[a], ev[b]); if (!w) continue; const loser = ev[a].rejected !== ev[b].rejected ? (ev[a].rejected ? ev[a] : ev[b]) : ev[a].score > ev[b].score ? ev[b] : ev[a], winner = loser === ev[a] ? ev[b] : ev[a]; if (!loser.duplicateOf) { loser.duplicateOf = winner.id; loser.duplicateWhy = w; loser.rejected = true; } }
  return ev;
}
/** Elige las k mejores NO descartadas, una por categoría. Si hay menos de k buenas, devuelve menos (no rellena con mediocres). */
export function selectIdeasV2(ev: EvalIdea[], k = 10): string[] { const used = new Set<string>(), out: string[] = []; for (const i of [...ev].sort((a, b) => b.score - a.score)) { if (out.length >= k) break; if (i.rejected || used.has(i.category)) continue; used.add(i.category); out.push(i.id); } return out; }

// ---------------------------------------------------------------- hooks V2
/** Un hook de cada tipo: situación, conflicto, curiosidad, contradicción y mini-historia (nacen de la situación). */
export const HOOK_KINDS_V2 = ["situacion", "conflicto", "curiosidad", "contradiccion", "mini-historia"] as const;
export type HookKindV2 = (typeof HOOK_KINDS_V2)[number];
export type HookV2 = { type: HookKindV2; text: string };
const BANNED_V2 = /^\s*(?:a veces|el problema es|debes entender|tu vida cambia|no necesitas|recuerda que|en este|vamos a|te voy a|aprende|descubre|hoy )/i;
const APHORISM = /\bno es (?:un|una|solo|solamente)\b[^.?!]*\bes (?:un|una)\b|\bdisfrazad[oa]\b|\bte arruinan? la vida\b|\bcambiar[aá] tu vida\b|\bla vida (?:es|te)\b/i;
const idContext = (i: IdeaV2) => `${i.titulo} ${i.situacion} ${i.accionKap} ${i.objeto} ${i.consecuencia}`;
/** Problemas de un hook: corto, sin muletillas/aforismos/clickbait/coach y anclado en la situación de la idea (objeto, acción, consecuencia). */
export function hookIssuesV2(h: HookV2, idea: IdeaV2): string[] {
  const why: string[] = [], n = wordCount(h.text);
  if (!HOOK_KINDS_V2.includes(h.type)) why.push(`tipo inválido «${h.type}»`);
  if (n < 6 || n > 20) why.push(`${n} palabras (deben ser 6-20)`);
  if (BANNED_V2.test(h.text) || BANNED_OPENINGS.test(h.text)) why.push("empieza con una muletilla prohibida");
  if (APHORISM.test(h.text)) why.push("suena a aforismo/frase de coach");
  if (CLICKBAIT.test(plain(h.text))) why.push("clickbait o promesa vacía");
  for (const id of textWarningIds(h.text)) why.push(`contenido: ${id}`);
  const ctx = stemSet(idContext(idea), true), mine = [...stemSet(h.text, true)].filter((s) => ctx.has(s)); if (mine.length < 1) why.push("no nace de la situación (no menciona nada concreto de la idea)");
  return why;
}
export function hookSetIssuesV2(hooks: HookV2[], idea: IdeaV2): string[] {
  const why: string[] = []; if (hooks.length !== 5) why.push(`hay ${hooks.length} hooks (deben ser 5)`);
  const missing = HOOK_KINDS_V2.filter((k) => !hooks.some((h) => h.type === k)); if (missing.length) why.push(`faltan los tipos: ${missing.join(", ")}`);
  hooks.forEach((h, i) => hooks.forEach((g, j) => { if (j < i && similarity(h.text, g.text) >= 0.5) why.push(`el hook ${i + 1} repite al ${j + 1}`); }));
  hooks.forEach((h, i) => { const bad = hookIssuesV2(h, idea); if (bad.length) why.push(`hook ${i + 1}: ${bad.join("; ")}`); });
  return why;
}
/** Ordena los hooks por «gancho»: anclaje concreto, KAP o primera persona, hueco de curiosidad, longitud 8-14; penaliza lo que falla. */
export function rankHooks(hooks: HookV2[], idea: IdeaV2): { hook: HookV2; score: number }[] {
  const ctx = stemSet(idContext(idea), true);
  return hooks.map((hook) => { const t = plain(hook.text), anchors = [...stemSet(hook.text, true)].filter((s) => ctx.has(s)).length, n = wordCount(hook.text); let s = Math.min(3, anchors) + (/\bkap\b|\b(?:le dije|dije|abri|escribi|acepte|empece|mire|tenia|tuve|me )\w*/.test(t) ? 1 : 0) + (/\?|\bpero\b|\bhasta que\b|\bantes de\b|\bdespues\b|\botra vez\b|\bsin\b/.test(t) ? 1 : 0) + (n >= 8 && n <= 14 ? 1 : 0); s -= hookIssuesV2(hook, idea).length * 2; return { hook, score: s }; }).sort((a, b) => b.score - a.score);
}
