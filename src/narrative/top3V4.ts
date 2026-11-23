/**
 * TOP 3 V4 (módulo puro) — formato de KAP como PRESENTADOR: HOOK → (presentación + ejemplos visuales) × 3 → conclusión, de 35-50 s y 10-12 escenas. Solo validación ESTRUCTURAL (duración, voz,
 * bloques, alternancia presentador/ejemplo, cámara posible en CapCut, texto breve, vocabulario no permitido). Si el formato representa lo que se quiere lo decide una persona.
 */
import { speechSeconds, wordCount, BANNED_OPENINGS } from "./visualShort.ts";
import { CAMARAS } from "./scenePlanV4.ts";
import { CLICKBAIT, textWarningIds } from "./shortSafety.ts";
import { GENERIC } from "./ideasV2.ts";
import type { Issue } from "./chainV4.ts";

export type EscenaTop3 = { n: number; bloque: string; funcion: string; kap: string; narracion: string; duracion: number; vemos: string; composicion: string; objeto: string; texto: string; camara: string; camaraNota: string };
export type Top3 = { tema: string; musica: string; escenas: EscenaTop3[] };
export const TOP3 = { min: 35, max: 50 };
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PROHIBIDO = /\b(?:alfa|beta|mujeres?|chicas?|hombres? de alto valor|gur[uú]|macho|a veces|sab[ií]as que|conquistar|ligar)\b/;
export const presenter = (e: EscenaTop3) => e.kap === "presentador";
export const totalTop3 = (t: Top3) => Math.round(t.escenas.reduce((n, e) => n + e.duracion, 0) * 10) / 10;

export function top3Issues(t: Top3): Issue[] {
  const out: Issue[] = [], add = (id: string, msg: string) => out.push({ id, msg }), es = t.escenas, n = es.length, total = totalTop3(t);
  if (n < 10 || n > 12) add("escenas", `${n} escenas (deben ser 10-12)`); if (total < TOP3.min || total > TOP3.max) add("duracion", `duración total ${total} s (debe ser ${TOP3.min}-${TOP3.max} s)`);
  es.forEach((e, k) => { if (e.n !== k + 1) add("escenas", `la escena ${k + 1} está numerada ${e.n}`); const sp = speechSeconds(e.narracion); if (sp > e.duracion + 0.5) add("voz", `escena ${e.n}: la voz dura ${sp} s y la escena ${e.duracion} s`); if (!(CAMARAS as readonly string[]).includes(e.camara)) add("camara", `escena ${e.n}: «${e.camara}» no es posible en CapCut sobre una imagen fija`); if (wordCount(e.texto) > 6) add("pantalla", `escena ${e.n}: texto en pantalla de más de 6 palabras`); if (wordCount(e.vemos) < 12 || wordCount(e.composicion) < 10) add("escena", `escena ${e.n}: describe mejor qué vemos y la composición`); });
  const words = wordCount(es.map((e) => e.narracion).join(" ")); if (words < 80 || words > 130) add("voz", `la narración tiene ${words} palabras (80-130 para ${TOP3.min}-${TOP3.max} s)`);
  const hook = es[0]?.narracion ?? ""; if (es[0]?.bloque !== "HOOK" || !presenter(es[0])) add("formato", "la escena 1 debe ser el HOOK con KAP presentando a cámara"); if (BANNED_OPENINGS.test(hook) || /^\s*(?:a veces|¿?sab[ií]as que|los hombres|si quieres que)/i.test(hook) || wordCount(hook) > 16) add("gancho", "el gancho es largo o empieza con una fórmula prohibida");
  for (const b of ["TOP 1", "TOP 2", "TOP 3"]) { const ix = es.filter((e) => e.bloque === b); if (!ix.length || (b !== "TOP 1" && !presenter(ix[0]))) add("formato", `${b}: debe empezar con KAP presentando el punto (el TOP 1 puede abrirse con una transición visual tras el HOOK)`); if (ix.filter((e) => !presenter(e)).length < 2) add("formato", `${b}: necesita al menos 2 escenas de ejemplo visual`); }
  if (es.at(-1)?.bloque !== "CONCLUSIÓN" || !presenter(es.at(-1)!)) add("formato", "la última escena debe ser la conclusión de KAP a cámara");
  if (es.filter(presenter).length < 4) add("formato", "KAP debe presentar en al menos 4 escenas"); es.forEach((e, k) => { if (k > 0 && presenter(e) && presenter(es[k - 1]) && es[k - 1].bloque !== "HOOK") add("variedad", `escenas ${e.n - 1} y ${e.n}: dos escenas seguidas de KAP presentando (alterna con ejemplos; solo se admite tras el HOOK, que abre el primer punto)`); });
  if (es.filter((e) => /^no aparece/.test(e.kap)).length < 2) add("variedad", "faltan escenas de detalle/POV/mensajes sin KAP"); if (new Set(es.map((e) => e.camara)).size < 4) add("variedad", "menos de 4 movimientos de cámara distintos");
  const all = plain([...es.flatMap((e) => [e.narracion, e.texto, e.vemos])].join(" ")); if (PROHIBIDO.test(all)) add("contenido", "vocabulario no permitido (guerra de sexos, gurú, «a veces»…)"); const bad = textWarningIds(all); if (bad.length || CLICKBAIT.test(all) || GENERIC.test(all)) add("contenido", `coach genérico, clickbait o contenido no permitido${bad.length ? ` (${bad.join(", ")})` : ""}`);
  es.forEach((e) => { if (/\bkap\b/i.test(e.narracion)) add("voz", `escena ${e.n}: KAP no habla de sí mismo en tercera persona`); });
  return out;
}
