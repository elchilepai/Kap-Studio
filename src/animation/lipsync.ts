import type { Viseme } from "./types.ts";
import { hash32 } from "./util.ts";

/**
 * SINCRONIZACIÓN LABIAL SUSTITUIBLE. Un proveedor convierte (texto, duración, audio) en una pista por fotograma:
 * apertura de boca (0..1) y, opcionalmente, el visema. El resto del sistema solo consume la pista; cambiar de proveedor
 * no toca el director, la línea de tiempo ni el dibujante.
 *  · amplitud  (por defecto): la boca se abre donde hay sonido; no conoce fonemas.
 *  · texto     (experimental): visemas deducidos de las letras del texto en español, repartidos en el tiempo.
 *  · fonético  (futuro): visemas alineados con el audio por un reconocedor de voz. NO está conectado.
 */
export type LipSyncInput = { text: string; durationSec: number; fps: number; audioEnvelope?: number[] };
export type LipSyncTrack = { envelope: number[]; visemes?: Viseme[] };
export interface LipSyncProvider { id: string; label: string; kind: "amplitude" | "text" | "phoneme"; track(input: LipSyncInput): LipSyncTrack }

/** Envolvente a partir del ritmo del texto (sílabas y pausas). Solo se usa si no hay audio real. */
export function syntheticEnvelope(text: string, dur: number, fps: number): number[] {
  const n = Math.max(1, Math.round(dur * fps)); const w: { len: number; open: number }[] = [];
  for (const m of text.matchAll(/[aeiouáéíóúü]+|[,.;:!?…]+/gi)) w.push(/[,.;:!?…]/.test(m[0]) ? { len: 1.1, open: 0 } : { len: 1, open: 0.35 + ((hash32(m[0] + w.length) % 100) / 100) * 0.65 });
  if (!w.length) return new Array(n).fill(0);
  const total = w.reduce((a, b) => a + b.len, 0), out: number[] = [];
  for (let i = 0; i < n; i++) { let u = ((i + 0.5) / n) * total, k = 0; while (k < w.length - 1 && u > w[k].len) { u -= w[k].len; k++; } const p = u / w[k].len; out.push(w[k].open ? +(w[k].open * Math.pow(Math.sin(Math.PI * Math.min(1, p)), 0.7)).toFixed(2) : 0); }
  return out;
}

export const amplitudeProvider: LipSyncProvider = {
  id: "amplitud", label: "Por amplitud del audio", kind: "amplitude",
  track: ({ text, durationSec, fps, audioEnvelope }) => ({ envelope: audioEnvelope && audioEnvelope.length ? audioEnvelope : syntheticEnvelope(text, durationSec, fps) }),
};

const OPEN: Record<Viseme, number> = { rest: 0, A: 0.9, E: 0.6, I: 0.35, O: 0.7, U: 0.45, FV: 0.15, MBP: 0, L: 0.4, WQ: 0.3 };
const LETTER: Record<string, Viseme> = { a: "A", á: "A", e: "E", é: "E", i: "I", í: "I", o: "O", ó: "O", u: "U", ú: "U", ü: "U", m: "MBP", b: "MBP", p: "MBP", f: "FV", v: "FV", l: "L", w: "WQ", q: "WQ" };

/** Visemas a partir de las letras (español): vocal → su forma; m/b/p cierran; f/v labiodental; el resto mantiene la forma anterior. */
export const textVisemeProvider: LipSyncProvider = {
  id: "texto", label: "Visemas por texto (experimental)", kind: "text",
  track: ({ text, durationSec, fps, audioEnvelope }) => {
    const n = Math.max(1, Math.round(durationSec * fps)); const seq: { v: Viseme; w: number }[] = []; let prev: Viseme = "rest";
    for (const ch of text.toLowerCase()) {
      if (/[,.;:!?…]/.test(ch)) { seq.push({ v: "rest", w: 1.4 }); prev = "rest"; continue; }
      if (/\s/.test(ch)) continue;
      const v = LETTER[ch]; if (v) { seq.push({ v, w: v === "MBP" || v === "FV" ? 0.6 : 1 }); prev = v; } else seq.push({ v: prev === "rest" ? "rest" : prev, w: 0.35 });
    }
    if (!seq.length) return { envelope: new Array(n).fill(0), visemes: new Array(n).fill("rest") };
    const total = seq.reduce((a, b) => a + b.w, 0); const visemes: Viseme[] = [], envelope: number[] = [];
    for (let i = 0; i < n; i++) {
      let u = ((i + 0.5) / n) * total, k = 0; while (k < seq.length - 1 && u > seq[k].w) { u -= seq[k].w; k++; }
      const gate = audioEnvelope && audioEnvelope.length ? (audioEnvelope[Math.min(audioEnvelope.length - 1, i)] ?? 0) > 0.05 : true;   // con audio real, no abre la boca en silencio
      const v = gate ? seq[k].v : "rest"; visemes.push(v); envelope.push(+(OPEN[v] * (audioEnvelope?.length ? Math.max(0.5, Math.min(1, (audioEnvelope[Math.min(audioEnvelope.length - 1, i)] ?? 0) + 0.3)) : 1)).toFixed(2));
    }
    return { envelope, visemes };
  },
};
export const LIPSYNC_PROVIDERS: Record<string, LipSyncProvider> = { amplitud: amplitudeProvider, texto: textVisemeProvider };
