import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { VoiceProvider } from "@/ports/studio";
import type { Scene } from "@/domain/types";
import { CanceledError, RenderError, ffprobe, runFfmpeg } from "@/server/render/ffmpeg";
import { GAP, isDialogue, sceneTimeline, type TItem } from "./timeline";

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

/** `items`: línea de tiempo REAL de la locución (diálogo + silencios de las acciones), relativa al inicio del audio. */
export type SceneAudio = { file: string; durationSec: number; source: "asset" | "synth"; items?: TItem[] };

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
  // SOLO se pronuncia el diálogo; la narración/dirección no se dice (dirige la animación). Entre frases habladas queda silencio del tamaño de cada acción.
  if (!ctx.voice || !scene.lines.some(isDialogue)) return undefined;
  const key = createHash("sha256").update(JSON.stringify(["v2-solo-dialogo", ctx.voice.id, scene.lines])).digest("hex").slice(0, 32);
  const out = path.join(ctx.cacheDir, "tts", `${key}.wav`), side = out.replace(/\.wav$/, ".json");
  try { await fs.access(out); const p = await ffprobe(out); const items = JSON.parse(await fs.readFile(side, "utf8")) as TItem[]; return { file: out, durationSec: p.durationSec, source: "synth", items }; } catch { /* no está en caché */ }

  await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
  await fs.mkdir(ctx.tmpDir, { recursive: true, mode: 0o700 });
  const files = new Map<number, string>(), durs: (number | undefined)[] = [];
  for (const [i, l] of scene.lines.entries()) {
    if (!isDialogue(l)) continue;
    const f = path.join(ctx.tmpDir, `tts-${i}.wav`); await ctx.voice.synthesize(l.text, f, { signal: ctx.signal, speaker: l.speaker });
    // espeak-ng sale con código 0 aunque no pueda escribir: se comprueba que el audio exista de verdad
    const st = await fs.stat(f).catch(() => null);
    if (!st || st.size < 100) throw new RenderError(`La voz no generó audio para la línea ${i + 1} de la escena`, false);
    files.set(i, f); durs[i] = (await ffprobe(f)).durationSec;
  }
  const items = sceneTimeline(scene.lines, durs);   // tiempos REALES de cada frase hablada; cada acción narrada ocupa su silencio
  // une las frases con una pausa breve y los silencios de las acciones, normalizados a 48 kHz estéreo
  const tmpOut = path.join(ctx.tmpDir, "scene.wav");
  const inputs = scene.lines.flatMap((l, i) => (isDialogue(l) ? ["-i", files.get(i)!] : ["-f", "lavfi", "-t", (items[i].end - items[i].start).toFixed(3), "-i", "anullsrc=r=48000:cl=stereo"]));
  const fmt = "aformat=sample_rates=48000:channel_layouts=stereo";
  const graph = scene.lines.map((l, i) => `[${i}:a]${fmt}${isDialogue(l) ? `,apad=pad_dur=${GAP}` : ""}[a${i}]`).join(";") + ";" + scene.lines.map((_, i) => `[a${i}]`).join("") + `concat=n=${scene.lines.length}:v=0:a=1[o]`;
  await runFfmpeg([...inputs, "-filter_complex", graph, "-map", "[o]", "-c:a", "pcm_s16le", tmpOut], { signal: ctx.signal });
  await fs.rename(tmpOut, out).catch(async () => { await fs.copyFile(tmpOut, out); });
  await fs.writeFile(side, JSON.stringify(items), { mode: 0o600 });
  const p = await ffprobe(out);
  return { file: out, durationSec: p.durationSec, source: "synth", items };
}
