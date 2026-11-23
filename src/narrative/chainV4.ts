/**
 * CADENA NARRATIVA V4 (módulo puro) — FASE A del nuevo flujo: idea → CADENA → aprobación humana → escenas → hooks → guion → imágenes.
 * Una cadena es una historia corta y causal (situación → conflicto → motivo → acción → consecuencia → decisión → nueva acción → resultado → mentalidad). Aquí SOLO hay validación ESTRUCTURAL
 * (campos completos y sin truncar, acciones de KAP concretas, objeto con función, mentalidad derivada de la historia, contenido permitido, sin duplicados entre cadenas). La coherencia lógica
 * NO se valida con un modelo: la valida una persona. Un fallo estructural no «puntúa»: se marca y, como mucho, se regenera una vez con el motivo.
 */
import { CLICKBAIT, textWarningIds } from "./shortSafety.ts";
import { wordCount } from "./visualShort.ts";
import { GENERIC, acts, mentions } from "./ideasV2.ts";
import { REACCION, mainPassive } from "./ideasV3.ts";
import { similarity } from "./ideas.ts";

export const CATEGORIES_V4 = ["aprobacion", "comparacion", "justificarse", "rechazo-identidad", "limites-costumbre"] as const;
export type CategoryV4 = (typeof CATEGORIES_V4)[number];
export const FIELDS_V4 = ["situacion", "conflicto", "motivo", "accion", "consecuencia", "decision", "nuevaAccion", "resultado", "mentalidad"] as const;
export type FieldV4 = (typeof FIELDS_V4)[number];
/** Los 9 campos de la cadena + título y objeto (el objeto con función narrativa que pide la dirección editorial). */
export type Chain = { category: CategoryV4; titulo: string; objeto: string } & Record<FieldV4, string>;
export type Issue = { id: string; field?: string; msg: string };
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const WORDS_MIN = 6, WORDS_MAX = 32;
/** Objetos decorativos que no cuentan: el objeto debe participar en la historia. */
export const DECORATIVE = /^(?:el |la |los |las |un |una )?(?:sofa|pared|mesa|silla|suelo|habitacion|cuarto|casa|cama|ventana|puerta de casa|escritorio|luz|lampara|sala|cocina|banco|calle|ciudad|parque)$/;
const DANGLING = new Set(["de", "del", "la", "el", "los", "las", "al", "a", "y", "o", "que", "en", "con", "por", "para", "su", "sus", "un", "una", "se", "lo", "le", "como", "pero", "si", "no", "e", "ni", "sin", "entre", "sobre", "hacia", "ahora", "al"]);
const NON_LATIN = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿ؀-ۿ]/;
const MENTALIDAD_PROHIBIDA = /^\s*(?:a veces|el problema es|debes\b|la clave es|recuerda\b|hay que|tienes que|lo importante es|siempre|nunca)/;
const STOP = new Set(["descubre", "entiende", "comprende", "cuando", "aunque", "porque", "mucho", "mejor", "sobre", "entre", "puede", "tiene", "hacer", "algo", "otros", "otras", "cada", "solo", "ahora", "antes", "despues", "nunca", "siempre", "mismo", "misma", "para", "como", "esta", "este", "esto"]);
const stemsOf = (t: string) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
/** Raíces de palabra de `a` que también aparecen en `b` (la mentalidad debe retomar algo concreto de la historia). */
export const sharedStems = (a: string, b: string) => { const y = stemsOf(b); return [...stemsOf(a)].filter((k) => y.has(k)).length; };
const CORE: FieldV4[] = ["situacion", "conflicto", "motivo", "accion", "consecuencia", "decision", "nuevaAccion", "resultado"];

/** Una frase está truncada si no termina en puntuación final o termina en una palabra que no puede cerrar una frase («…Ahora, al»). */
export function truncated(t: string): boolean {
  const s = t.trim(); if (!/[.!?»”"')]$/.test(s)) return true;
  const last = (plain(s).replace(/[^a-z0-9ñ ]+$/g, "").trim().split(/\s+/).pop() ?? ""); return DANGLING.has(last);
}
/** Validación estructural de UNA cadena (vacío = bien formada). No juzga la lógica de la historia. */
export function chainIssues(c: Chain): Issue[] {
  const out: Issue[] = [], add = (id: string, msg: string, field?: string) => out.push({ id, msg, ...(field ? { field } : {}) });
  for (const f of FIELDS_V4) {
    const t = c[f] ?? "", n = wordCount(t);
    if (n < WORDS_MIN) add("campo-corto", `«${f}» demasiado corto (${n} palabras, mínimo ${WORDS_MIN})`, f); else if (n > WORDS_MAX) add("campo-largo", `«${f}» demasiado largo (${n} palabras, máximo ${WORDS_MAX}): hazlo corto y concreto`, f);
    if (n >= 1 && truncated(t)) add("truncado", `«${f}» parece cortado a mitad de frase: «…${t.trim().slice(-30)}»`, f); if (NON_LATIN.test(t)) add("caracteres", `«${f}» contiene caracteres que no son del español`, f);
  }
  if (wordCount(c.titulo) < 2 || wordCount(c.titulo) > 10) add("campo-corto", "«titulo» debe tener entre 2 y 10 palabras", "titulo");
  for (const f of ["accion", "nuevaAccion"] as const) if (!/^\s*kap\b/i.test(c[f]) || mainPassive(c[f]) || !acts(c[f])) add("accion-kap", `«${f}» debe ser algo que KAP HACE (empieza por «KAP» + verbo concreto; no callarse, mirar, pensar ni sentirse)`, f);
  if (similarity(c.accion, c.nuevaAccion) >= 0.5) add("nueva-accion", "la nueva acción es casi igual que la primera: debe ser un cambio de comportamiento");
  const obj = plain(c.objeto).trim();
  if (wordCount(c.objeto) < 1 || wordCount(c.objeto) > 5) add("objeto", "«objeto» debe tener 1-5 palabras", "objeto"); else if (DECORATIVE.test(obj)) add("objeto", `el objeto «${c.objeto}» es decorativo: debe participar en la historia`, "objeto");
  else { const uses = CORE.filter((f) => mentions(c.objeto, c[f])); if (uses.length < 3) add("objeto", `el objeto «${c.objeto}» solo aparece en ${uses.length} pasos de la cadena (mínimo 3): no participa en la historia`, "objeto"); }
  if (MENTALIDAD_PROHIBIDA.test(plain(c.mentalidad)) || GENERIC.test(plain(c.mentalidad))) add("mentalidad", "la mentalidad es una moraleja genérica (empieza por «A veces», «Debes», «La clave es», «Recuerda»…)", "mentalidad");
  else if (!/\bkap\b/i.test(c.mentalidad) || sharedStems(c.mentalidad, [c.accion, c.nuevaAccion, c.consecuencia, c.motivo, c.conflicto, c.resultado, c.objeto].join(" ")) < 1) add("mentalidad", "la mentalidad debe decir qué entiende KAP a partir de lo que acaba de ocurrir (menciona a KAP y retoma algo concreto de la historia: su acción, su motivo, la consecuencia o el objeto)", "mentalidad");
  const visual = (["accion", "consecuencia", "nuevaAccion", "resultado"] as const).filter((f) => acts(c[f]) && !(REACCION.test(plain(c[f])) && !acts(c[f].replace(REACCION, "")))); if (visual.length < 3) add("visual", `solo ${visual.length} de los 4 pasos clave (acción, consecuencia, nueva acción, resultado) se pueden dibujar como algo que ocurre: hacen falta al menos 3`);
  for (let a = 0; a < CORE.length; a++) for (let b = a + 1; b < CORE.length; b++) if (similarity(c[CORE[a]], c[CORE[b]]) >= 0.6) add("repetida", `«${CORE[a]}» y «${CORE[b]}» dicen casi lo mismo: cada paso debe añadir información`);
  const all = plain(FIELDS_V4.map((f) => c[f]).join(" ") + " " + c.titulo), bad = textWarningIds(all); if (bad.length || CLICKBAIT.test(all) || GENERIC.test(all)) add("contenido", `coach genérico, clickbait o contenido no permitido${bad.length ? ` (${bad.join(", ")})` : ""}`);
  return out;
}
/** ¿Dos cadenas son la misma historia? título, objeto, acción, situación, conflicto o conclusión. */
export function duplicateChain(a: Chain, b: Chain): string | undefined {
  if (plain(a.titulo) === plain(b.titulo) || similarity(a.titulo, b.titulo) >= 0.5) return "título igual o casi idéntico";
  if (plain(a.objeto).trim() === plain(b.objeto).trim() || similarity(a.objeto, b.objeto) >= 0.6) return "mismo objeto central";
  if (similarity(a.accion, b.accion) >= 0.45) return "misma acción"; if (similarity(a.situacion, b.situacion) >= 0.4) return "misma situación"; if (similarity(a.conflicto, b.conflicto) >= 0.45) return "mismo conflicto"; if (similarity(a.mentalidad, b.mentalidad) >= 0.5) return "misma conclusión";
}
