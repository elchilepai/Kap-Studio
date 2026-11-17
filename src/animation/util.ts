import type { Ease } from "./types.ts";
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export function ease(kind: Ease | undefined, p: number): number {
  const x = clamp(p, 0, 1);
  if (kind === "in") return x * x; if (kind === "out") return 1 - (1 - x) * (1 - x);
  if (kind === "linear") return x;
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; // inOut (por defecto)
}
/** PRNG determinista (mulberry32): mismo seed ⇒ mismos números, en navegador y en Node. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash32(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function shade(hex: string, amt: number): string { // amt −1..1 (oscurece/aclara)
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16);
  const f = (c: number) => Math.round(clamp(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt), 0, 255));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export const mix = (a: string, b: string, p: number): string => {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a), pb = /^#?([0-9a-f]{6})$/i.exec(b); if (!pa || !pb) return a;
  const x = parseInt(pa[1], 16), y = parseInt(pb[1], 16); const c = (s: number) => Math.round(lerp((x >> s) & 255, (y >> s) & 255, p));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
