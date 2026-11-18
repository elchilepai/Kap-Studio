/**
 * COMPROBACIÓN SENCILLA DE LA PRIMERA RIMA DE KAP (módulo puro). No es un sistema lingüístico: detecta los casos CLARAMENTE malos
 * (no hay dos segmentos, no riman, no tiene que ver con la escena, es un lema o está llena de modismos). Una rima torpe o imperfecta
 * de niño bajo presión es válida: se prioriza ritmo y naturalidad sobre la rima perfecta.
 * Indicador: `rhyme_valid` = existe ∧ ≥ 2 segmentos ∧ similitud fonética ∧ relacionada con el contexto ∧ no genérica ∧ sin abuso de chilenismos.
 */
import { norm } from "../memory/text.ts";
import { ADULT_VOICE, MOTIVATIONAL } from "./review.ts";

const STRONG = "aeo", ACC: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };
const plain = (w: string) => w.toLowerCase().replace(/[áéíóúü]/g, (c) => ACC[c]);

/** Núcleos vocálicos de una palabra (un diptongo cuenta como un núcleo). */
function nuclei(w: string): { s: number; e: number; accented: boolean }[] {
  const out: { s: number; e: number; accented: boolean }[] = []; let i = 0; const lw = w.toLowerCase();
  while (i < lw.length) { if (!/[aeiouáéíóúü]/.test(lw[i])) { i++; continue; } let j = i; let acc = /[áéíóú]/.test(lw[i]);
    while (j + 1 < lw.length && /[aeiouáéíóúü]/.test(lw[j + 1])) { const a = plain(lw[j]), b = plain(lw[j + 1]); const hiatus = STRONG.includes(a) && STRONG.includes(b) || /[íú]/.test(lw[j]) || /[íú]/.test(lw[j + 1]); if (hiatus) break; j++; acc = acc || /[áéíóú]/.test(lw[j]); }
    out.push({ s: i, e: j, accented: acc }); i = j + 1; }
  return out;
}
/** Clave de rima de una palabra: consonante (desde la vocal tónica) y asonante (solo vocales desde la tónica). */
export function rhymeKey(word: string): { cons: string; asso: string } | undefined {
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, ""); if (w.length < 2) return undefined; const ns = nuclei(w); if (!ns.length) return undefined;
  let st = ns.findIndex((n) => n.accented); if (st < 0) st = ns.length === 1 ? 0 : /[aeiouns]$/.test(plain(w)) ? ns.length - 2 : ns.length - 1;
  let from = ns[st].e; for (let k = ns[st].s; k <= ns[st].e; k++) if (STRONG.includes(plain(w[k]))) { from = k; break; }   // la rima cuenta desde la vocal fuerte tónica (pu-ER-ta ≈ abi-ER-ta)
  const vowels = ns.slice(st).map((n) => { const seg = plain(w.slice(n.s, n.e + 1)); return [...seg].find((c) => STRONG.includes(c)) ?? seg.at(-1)!; }).join("");
  return { cons: plain(w.slice(from)), asso: vowels };
}
/** ¿Riman dos palabras? consonante, o asonante con al menos dos vocales iguales (o una si es palabra aguda). */
export function rhymes(a: string, b: string): "consonante" | "asonante" | undefined {
  const x = rhymeKey(a), y = rhymeKey(b); if (!x || !y || plain(a) === plain(b)) return undefined;
  if (x.cons === y.cons && x.cons.length >= 2) return "consonante"; if (x.asso === y.asso && x.asso.length >= 1 && (x.asso.length >= 2 || x.cons.length <= 2 || y.cons.length <= 2)) return "asonante"; return undefined;
}
/** Trozos «cantables» de una intervención: se parten en `/`, saltos de línea y signos de pausa. */
export const segments = (lines: string[]): string[] => lines.flatMap((l) => l.split(/[\n/;,.!?¡¿…:]+/)).map((s) => s.trim()).filter((s) => s.split(/\s+/).filter((w) => w.length > 0).length >= 2);
const endWord = (seg: string) => (seg.match(/[A-Za-záéíóúüñÁÉÍÓÚÜÑ]+/g) ?? []).at(-1) ?? "";

/** Modismos chilenos: sirven para detectar el ABUSO (caricatura), nunca se exigen. */
export const CHILENISMOS = /\b(wea|weón|weon|po|cachai|cachái|bacán|bacan|fome|pololo|polola|al tiro|luca|lucas|guagua|cuático|cuatico|harto|la raja|pucha|chuta|achuntar|latero|lolo|lola|cabro|cabra|carrete|pega|filo|ya po|sipo|nopo|aweonao|flaite)\b/gi;
const GENERIC = /\bmi (?:m[uú]sica|sue[ñn]o|voz|historia)\b|\bmis sue[ñn]os\b/i;
/** Palabras que no demuestran relación con la escena (aparecen en cualquier episodio). */
const FILLER = new Set(["kap", "para", "pero", "como", "cuando", "donde", "porque", "tengo", "quiero", "estoy", "esto", "esta", "este", "todo", "toda", "algo", "nada", "mundo", "vida", "musica", "sueño", "sueno", "voz", "rima", "rap", "ritmo", "mejor", "ahora", "siempre", "nunca"]);
const stems = (s: string) => new Set((norm(s).match(/[a-zñ]{4,}/g) ?? []).filter((w) => !FILLER.has(w)).map((w) => w.slice(0, 5)));

export type RhymeCheck = { rhyme_valid: boolean; exists: boolean; segments: number; phonetic: boolean; contextual: boolean; nonGeneric: boolean; chileanOk: boolean; pairs: string[]; reasons: string[] };
/** `lines`: la intervención de KAP (líneas consecutivas suyas). `contextTerms`: textos de la escena (problema, acción, objetos, lugar…) de los que debe nacer la rima. */
export function checkRhyme(inp: { lines: string[]; contextTerms: string[] }): RhymeCheck {
  const segs = segments(inp.lines), text = inp.lines.join(" "), reasons: string[] = [];
  const exists = inp.lines.length > 0 && segs.length >= 2; if (!exists) reasons.push("no hay una intervención de KAP con al menos dos segmentos rimables");
  const ends = segs.slice(0, 6).map(endWord), pairs: string[] = [];
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length && j <= i + 2; j++) { const r = rhymes(ends[i], ends[j]); if (r) pairs.push(`${ends[i]}/${ends[j]} (${r})`); }
  const phonetic = pairs.length > 0; if (exists && !phonetic) reasons.push(`los finales de los versos no riman (${ends.slice(0, 4).join(", ")})`);
  const ctx = stems(inp.contextTerms.join(" ")), contextual = [...stems(text)].some((s) => ctx.has(s)); if (exists && !contextual) reasons.push("la rima no menciona nada concreto de la escena");
  const nonGeneric = !MOTIVATIONAL.test(text) && !GENERIC.test(text) && !new RegExp(ADULT_VOICE.source, "i").test(text); if (!nonGeneric) reasons.push("suena a lema o a reflexión de adulto («mi música», «mi sueño», «no me rendiré», «el futuro»…)");
  const chileanOk = (text.match(CHILENISMOS) ?? []).length <= 2; if (!chileanOk) reasons.push("demasiados chilenismos: el acento debe ser ligero, no una caricatura");
  return { rhyme_valid: exists && phonetic && contextual && nonGeneric && chileanOk, exists, segments: segs.length, phonetic, contextual, nonGeneric, chileanOk, pairs, reasons };
}
/** La primera intervención de KAP: sus líneas consecutivas desde la primera vez que habla. */
export function firstInterventionOf(lines: { speaker?: string; text: string }[], who = "KAP"): { index: number[]; texts: string[] } {
  const k = norm(who), start = lines.findIndex((l) => norm(l.speaker ?? "") === k); if (start < 0) return { index: [], texts: [] };
  const index: number[] = []; for (let i = start; i < lines.length && norm(lines[i].speaker ?? "") === k; i++) index.push(i); return { index, texts: index.map((i) => lines[i].text) };
}
