/**
 * SONIDO CON FUNCIÓN. Una escena sin diálogo no es una escena muda: el director propone sonidos (puerta, golpe, llamada, pasos, ambiente) a partir de lo que
 * cuenta la narración y aquí se SINTETIZAN con FFmpeg (sin ficheros externos ni licencias), en caché. Son sonidos sencillos pensados como ritmo y vida,
 * no un diseño sonoro completo: la arquitectura permite sustituirlos más adelante por sonidos reales (SFX/música) sin tocar el director.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { SoundKind } from "@/animation/types";
import { runFfmpeg } from "@/server/render/ffmpeg";

/** Expresión (aevalsrc), duración por defecto, filtros y volumen de cada sonido. */
const SOUNDS: Record<SoundKind, { expr: (d: number) => string; dur: number; af: string; volume: number }> = {
  door: { expr: () => "(0.9*sin(2*PI*65*t)+0.6*(random(0)-0.5))*exp(-9*t)", dur: 0.55, af: "lowpass=f=900", volume: 0.7 },
  bump: { expr: () => "(1.0*sin(2*PI*48*t)+0.5*(random(0)-0.5))*exp(-7*t)", dur: 0.6, af: "lowpass=f=700", volume: 0.8 },
  knock: { expr: () => "sin(2*PI*190*t)*exp(-45*mod(t\\,0.24))*lt(t\\,0.48)", dur: 0.6, af: "lowpass=f=1200", volume: 0.6 },
  ring: { expr: () => "0.4*sin(2*PI*880*t)*lt(mod(t\\,0.6)\\,0.2)", dur: 1.8, af: "lowpass=f=3000", volume: 0.5 },
  steps: { expr: () => "0.7*(random(0)-0.5)*exp(-38*mod(t\\,0.46))", dur: 1.5, af: "lowpass=f=900", volume: 0.25 },
  ambience: { expr: () => "0.5*(random(0)-0.5)", dur: 3, af: "lowpass=f=260,volume=0.5", volume: 0.35 },
};
export const SOUND_VOLUME = (k: SoundKind) => SOUNDS[k].volume;
/** Sintetiza (o recupera de caché) un sonido. `dur` solo cuenta para pasos y ambiente (se redondea a 0,5 s para reutilizar la caché). */
export async function synthSound(kind: SoundKind, dur: number | undefined, o: { cacheDir: string; signal?: AbortSignal }): Promise<string> {
  const def = SOUNDS[kind], d = kind === "steps" || kind === "ambience" ? Math.max(0.5, Math.round((dur ?? def.dur) * 2) / 2) : def.dur;
  const file = path.join(o.cacheDir, "sfx", `${kind}-${Math.round(d * 10)}.wav`);
  try { await fs.access(file); return file; } catch { /* hay que sintetizarlo */ }
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); const tmp = `${file}.tmp.wav`;
  await runFfmpeg(["-f", "lavfi", "-i", `aevalsrc='${def.expr(d)}':d=${d.toFixed(2)}:s=48000`, "-af", `${def.af},aformat=sample_rates=48000:channel_layouts=stereo`, "-c:a", "pcm_s16le", tmp], { signal: o.signal });
  await fs.rename(tmp, file); return file;
}
