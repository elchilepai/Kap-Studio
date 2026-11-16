/** Utilidades de texto compartidas por el pipeline (todo puro y determinista). */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set("el la los las un una unos unas de del al y o u e en a con por para que se su sus lo le les es son era fue ha han mi tu su nos como mas pero si no ya muy sin sobre entre hasta desde este esta estos estas ese esa eso aquel aquella".split(" "));
export const tokens = (s: string): string[] => norm(s).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 2 && !STOP.has(t));
export const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;
export const uniq = <T,>(a: T[]) => [...new Set(a)];

/** Ritmo de locución en español ≈ 155 palabras/min (2,6 pal/s). Solo es una ESTIMACIÓN cuando no hay audio real. */
export const WORDS_PER_SEC = 2.6;
export const estimateSeconds = (words: number) => Math.min(30, Math.max(3, words / WORDS_PER_SEC + 1));

/** Divide en frases conservando la puntuación. */
export function sentences(text: string): string[] {
  return (text.replace(/\s+/g, " ").trim().match(/[^.!?…;]+[.!?…;]*\s*/g) ?? []).map((x) => x.trim()).filter(Boolean);
}
