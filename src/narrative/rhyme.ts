/**
 * COMPROBACIÓN SENCILLA DE LA PRIMERA RIMA DE KAP (módulo puro). No es un sistema lingüístico: detecta los casos CLARAMENTE malos
 * (no hay dos segmentos, no riman, no tiene que ver con la escena, es un lema o está llena de modismos). Una rima torpe o imperfecta
 * de niño bajo presión es válida: se prioriza ritmo y naturalidad sobre la rima perfecta.
 * PRIORIDAD (de más a menos): 1) naturalidad de KAP (voz de niño, sin lemas ni palabras de poeta, acento chileno ligero y natural),
 * 2) relación directa con el contexto, 3) ritmo y musicalidad hip-hop (versos cortos y parejos, fáciles de decir), 4) rima técnicamente correcta.
 * Una rima imperfecta pero natural y contextual PASA; una rima perfecta pero artificial FALLA: la técnica nunca compensa la naturalidad.
 * Indicador: `rhyme_valid` = existe ∧ natural ∧ contextual ∧ ritmo ∧ rima (consonante, asonante o cercana).
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
/** Rima CERCANA (imperfecta): misma vocal tónica y ambas palabras llanas acabadas en vocal («casa/mano»). Es la que sale de un niño improvisando. */
export function rhymeLevel(a: string, b: string): "consonante" | "asonante" | "cercana" | undefined {
  const strict = rhymes(a, b); if (strict) return strict; const x = rhymeKey(a), y = rhymeKey(b); if (!x || !y || plain(a) === plain(b)) return undefined;
  const stressed = (k: { asso: string }) => k.asso[0], endsV = (w: string) => /[aeiouáéíóú]$/i.test(w.trim()), llana = (k: { cons: string; asso: string }) => k.asso.length === 2;
  return stressed(x) === stressed(y) && endsV(a) && endsV(b) && llana(x) && llana(y) ? "cercana" : undefined;
}
/** Trozos «cantables» de una intervención: se parten en `/`, saltos de línea y signos de pausa. */
export const segments = (lines: string[]): string[] => lines.flatMap((l) => l.split(/[\n/;,.!?¡¿…:]+/)).map((s) => s.trim()).filter((s) => s.split(/\s+/).filter((w) => w.length > 0).length >= 2);
const endWord = (seg: string) => (seg.match(/[A-Za-záéíóúüñÁÉÍÓÚÜÑ]+/g) ?? []).at(-1) ?? "";

/** Modismos chilenos: sirven para detectar el ABUSO (caricatura), nunca se exigen. */
export const CHILENISMOS = /\b(wea|weón|weon|po|cachai|cachái|bacán|bacan|fome|pololo|polola|al tiro|luca|lucas|guagua|cuático|cuatico|harto|la raja|pucha|chuta|achuntar|latero|lolo|lola|cabro|cabra|carrete|pega|filo|ya po|sipo|nopo|aweonao|flaite)\b/gi;
/** Vocabulario de poeta adulto: una rima perfecta hecha con estas palabras suena artificial en boca de un niño. */
const POETIC = /\b(alma|destino|eterno|eterna|eternidad|infinito|infinita|anhelo|anhela|horizonte|universo|esencia|melod[ií]a|sinfon[ií]a|resplandor|fulgor|ensue[ñn]o|quimera|utop[ií]a|coraz[oó]n|latir|florece|florecer|vuela|volar|alas|estrellas?|cielo|eco|susurro|nostalgia|trascender|existencia)\b/i;
const GENERIC = /\bmi (?:m[uú]sica|sue[ñn]o|voz|historia)\b|\bmis sue[ñn]os\b/i;
/** Palabras que no demuestran relación con la escena (aparecen en cualquier episodio). */
const FILLER = new Set(["kap", "para", "pero", "como", "cuando", "donde", "porque", "tengo", "quiero", "estoy", "esto", "esta", "este", "todo", "toda", "algo", "nada", "mundo", "vida", "musica", "sueño", "sueno", "voz", "rima", "rap", "ritmo", "mejor", "ahora", "siempre", "nunca"]);
const stems = (s: string) => new Set((norm(s).match(/[a-zñ]{4,}/g) ?? []).filter((w) => !FILLER.has(w)).map((w) => w.slice(0, 5)));

export type RhymeCheck = { rhyme_valid: boolean; exists: boolean; segments: number; natural: boolean; contextual: boolean; rhythm: boolean; phonetic: boolean; level: "consonante" | "asonante" | "cercana" | "ninguna"; nonGeneric: boolean; chileanOk: boolean; pairs: string[]; reasons: string[] };
/** `lines`: la intervención de KAP (líneas consecutivas suyas). `contextTerms`: textos de la escena (problema, acción, objetos, lugar…) de los que debe nacer la rima. Las razones salen por orden de prioridad. */
export function checkRhyme(inp: { lines: string[]; contextTerms: string[] }): RhymeCheck {
  const segs = segments(inp.lines), text = inp.lines.join(" "), all: string[] = [], reasons: string[] = [];
  const exists = inp.lines.length > 0 && segs.length >= 2; if (!exists) all.push("exists:no hay una intervención de KAP con al menos dos segmentos rimables");
  const ends = segs.slice(0, 6).map(endWord), pairs: string[] = []; let level: RhymeCheck["level"] = "ninguna"; const rank = { consonante: 3, asonante: 2, cercana: 1 } as const;
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length && j <= i + 2; j++) { const r = rhymeLevel(ends[i], ends[j]); if (r) { pairs.push(`${ends[i]}/${ends[j]} (${r})`); if (level === "ninguna" || rank[r] > rank[level]) level = r; } }
  const phonetic = level !== "ninguna";
  // 1) NATURALIDAD de KAP: voz de niño, nada de lemas ni vocabulario de poeta, acento chileno ligero y natural, versos fáciles de decir
  const nonGeneric = !MOTIVATIONAL.test(text) && !GENERIC.test(text) && !new RegExp(ADULT_VOICE.source, "i").test(text);
  const chile = (text.match(CHILENISMOS) ?? []).length, chileEnds = ends.filter((w) => new RegExp(`^(?:${CHILENISMOS.source})$`, "i").test(w)).length, chileanOk = chile <= 2 && chileEnds < 2;
  const ws = text.match(/[A-Za-záéíóúüñÁÉÍÓÚÜÑ]+/g) ?? [], avgLen = ws.length ? ws.reduce((n, w) => n + w.length, 0) / ws.length : 0, poetic = POETIC.test(text) || avgLen > 6.3;
  const counts = segs.slice(0, 6).map((x) => x.split(/\s+/).filter(Boolean).length), tooLong = counts.some((n) => n > 9);
  const natural = nonGeneric && chileanOk && !poetic;
  if (!nonGeneric) all.push("natural:suena a lema o a reflexión de adulto («mi música», «mi sueño», «no me rendiré», «el futuro»…): KAP habla como un niño");
  if (poetic) all.push("natural:suena a poema de adulto (palabras como «alma», «destino», «horizonte»…): una rima de niño usa cosas de lo que ve y hace");
  if (!chileanOk) all.push("natural:los chilenismos sobran o son lo único que rima: el acento debe ser ligero y salir solo cuando suene natural");
  // 2) CONTEXTO: nombra algo concreto de la escena
  const ctx = stems(inp.contextTerms.join(" ")), contextual = [...stems(text)].some((x) => ctx.has(x)); if (exists && !contextual) all.push("contexto:la rima no menciona nada concreto de la escena");
  // 3) RITMO hip-hop: versos cortos y parejos, fáciles de decir en voz alta
  const rhythm = exists && !tooLong && Math.max(...counts) / Math.max(1, Math.min(...counts)) <= 2.6; if (exists && !rhythm) all.push("ritmo:los versos son largos o desiguales; hazlos cortos y parejos, fáciles de decir en voz alta");
  // 4) RIMA técnica: consonante, asonante o cercana (la imperfecta vale si lo anterior se cumple)
  if (exists && !phonetic) all.push(`rima:los finales de los versos no riman ni de forma aproximada (${ends.slice(0, 4).join(", ")})`);
  const order = ["exists", "natural", "contexto", "ritmo", "rima"]; reasons.push(...all.sort((a, b) => order.indexOf(a.split(":")[0]) - order.indexOf(b.split(":")[0])).map((x) => x.slice(x.indexOf(":") + 1)));
  return { rhyme_valid: exists && natural && contextual && rhythm && phonetic, exists, segments: segs.length, natural, contextual, rhythm, phonetic, level, nonGeneric, chileanOk, pairs, reasons };
}
/** La primera intervención de KAP: sus líneas consecutivas desde la primera vez que habla. */
export function firstInterventionOf(lines: { speaker?: string; text: string }[], who = "KAP"): { index: number[]; texts: string[] } {
  const k = norm(who), start = lines.findIndex((l) => norm(l.speaker ?? "") === k); if (start < 0) return { index: [], texts: [] };
  const index: number[] = []; for (let i = start; i < lines.length && norm(lines[i].speaker ?? "") === k; i++) index.push(i); return { index, texts: index.map((i) => lines[i].text) };
}
