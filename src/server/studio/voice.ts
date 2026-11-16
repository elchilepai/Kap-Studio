import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { VoiceProvider } from "@/ports/studio";
import type { Scene } from "@/domain/types";
import { CanceledError, RenderError, ffprobe, runFfmpeg } from "@/server/render/ffmpeg";

const run = (bin: string, args: string[], stdin: string | undefined, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new CanceledError());
  const c = spawn(bin, args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = ""; c.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-500); });
  const onAbort = () => c.kill("SIGKILL"); signal?.addEventListener("abort", onAbort, { once: true });
  c.once("error", (e: NodeJS.ErrnoException) => reject(new RenderError(e.code === "ENOENT" ? `${bin} no está instalado` : e.message, false)));
  c.once("close", (code) => { signal?.removeEventListener("abort", onAbort); if (signal?.aborted) return reject(new CanceledError()); code === 0 ? resolve() : reject(new RenderError(`${bin} falló (${code}): ${err.trim()}`, false)); });
  if (stdin !== undefined) c.stdin.end(stdin); else c.stdin.end();
});

// Variantes de voz de espeak-ng para distinguir personajes sin coste (la calidad es básica/robótica).
const VARIANTS = ["m1", "f1", "m3", "f2", "m5", "f3", "m7", "f4"];
const variantOf = (speaker?: string) => speaker ? VARIANTS[[...speaker].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % VARIANTS.length] : "m2";

/** Voz local libre (eSpeak NG). Solo está «disponible» si el binario existe realmente. */
export function espeakProvider(bin = process.env.KAP_ESPEAK_PATH || "espeak-ng"): VoiceProvider {
  let avail: Promise<boolean> | undefined;
  return {
    id: "espeak-ng", label: "eSpeak NG (voz local)", free: true, quality: "basica", note: "Voz sintética básica, sin conexión ni coste. Útil para borradores; para el resultado final sube tu propia narración.",
    available: () => (avail ??= run(bin, ["--version"], undefined).then(() => true, () => false)),
    async synthesize(text, outFile, o) {
      await run(bin, ["-v", `es+${variantOf(o.speaker)}`, "-s", "150", "-p", "45", "-w", outFile, "--stdin"], text, o.signal);
    },
  };
}

export type SceneAudio = { file: string; durationSec: number; source: "asset" | "synth" };

/**
 * Narración de una escena. Prioridad: audio subido por el usuario → voz local (si se pidió y está disponible) → sin voz.
 * Las locuciones sintetizadas se guardan en caché por contenido (regenerar no vuelve a sintetizar lo que no cambió).
 */
export async function sceneAudio(scene: Scene, ctx: {
  assetPath: (id: string) => Promise<string | undefined>; voice?: VoiceProvider; cacheDir: string; tmpDir: string; signal?: AbortSignal;
}): Promise<SceneAudio | undefined> {
  if (scene.narrationAssetId) {
    const f = await ctx.assetPath(scene.narrationAssetId);
    if (f) { const p = await ffprobe(f); if (p.hasAudio && p.durationSec > 0) return { file: f, durationSec: p.durationSec, source: "asset" }; }
  }
  if (!ctx.voice || !scene.lines.length) return undefined;
  const key = createHash("sha256").update(JSON.stringify([ctx.voice.id, scene.lines])).digest("hex").slice(0, 32);
  const out = path.join(ctx.cacheDir, "tts", `${key}.wav`);
  try { await fs.access(out); const p = await ffprobe(out); return { file: out, durationSec: p.durationSec, source: "synth" }; } catch { /* no está en caché */ }

  await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
  await fs.mkdir(ctx.tmpDir, { recursive: true, mode: 0o700 });
  const parts: string[] = [];
  for (const [i, l] of scene.lines.entries()) {
    const f = path.join(ctx.tmpDir, `tts-${i}.wav`); await ctx.voice.synthesize(l.text, f, { signal: ctx.signal, speaker: l.speaker });
    // espeak-ng sale con código 0 aunque no pueda escribir: se comprueba que el audio exista de verdad
    const st = await fs.stat(f).catch(() => null);
    if (!st || st.size < 100) throw new RenderError(`La voz no generó audio para la línea ${i + 1} de la escena`, false);
    parts.push(f);
  }
  // une las líneas con una pausa breve entre ellas, normalizadas a 48 kHz estéreo
  const tmpOut = path.join(ctx.tmpDir, "scene.wav");
  const inputs = parts.flatMap((f) => ["-i", f]);
  const graph = parts.map((_, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad=pad_dur=0.25[a${i}]`).join(";") + ";" + parts.map((_, i) => `[a${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1[o]`;
  await runFfmpeg([...inputs, "-filter_complex", graph, "-map", "[o]", "-c:a", "pcm_s16le", tmpOut], { signal: ctx.signal });
  await fs.rename(tmpOut, out).catch(async () => { await fs.copyFile(tmpOut, out); });
  const p = await ffprobe(out);
  return { file: out, durationSec: p.durationSec, source: "synth" };
}
