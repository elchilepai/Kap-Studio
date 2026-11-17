/** Utilidades de texto de la memoria narrativa (puras e isomórficas). */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** Estimación prudente de tokens para español (≈ 3,6 caracteres por token). No depende de ningún modelo concreto. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.6);
/** Hash corto y estable (FNV-1a, no criptográfico): identifica cambios y firmas de contenido. */
export function hash(s: string): string {
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
/** Orden total de un episodio: temporada × 1000 + número. «Episodio 6» de la temporada 1 → 1006. */
export const orderOf = (season: number, number: number) => season * 1000 + number;
export const epLabel = (order: number) => { if (order <= 0) return "canon inicial"; const s = Math.floor(order / 1000), n = order % 1000; return s === 1 ? `ep. ${n}` : `T${s}E${n}`; };
export const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).trimEnd() + "…");
export const uniqBy = <T>(xs: T[], key: (x: T) => string) => { const seen = new Set<string>(); return xs.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
