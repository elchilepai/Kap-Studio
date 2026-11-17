import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { StageSpec } from "@/animation/types";
import { ANIM_VERSION } from "@/animation/types";
import { encodeArgs } from "@/server/render/presets";
import { CanceledError, RenderError, runFfmpeg } from "@/server/render/ffmpeg";
import { env } from "@/server/env";

export type Clip2DSpec = {
  stage: StageSpec; width: number; height: number; durationSec: number;
  images: Record<string, { path: string; sig: string }>;   // fondos/imágenes usados por el escenario
  assText?: string; fontsDir?: string; threads?: number;
};
const esc = (s: string) => "'" + s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'") + "'";

/** Clave de caché: cambia si cambia la escena, los diseños de personajes (van dentro de stage), el escenario o el código de render. */
export function clip2dKey(s: Clip2DSpec): string {
  return createHash("sha256").update(JSON.stringify([ANIM_VERSION, s.width, s.height, Math.round(s.durationSec * 100), s.stage, Object.entries(s.images).map(([k, v]) => [k, v.sig]), s.assText ?? null])).digest("hex").slice(0, 32);
}

function workerPath(): string { return env().KAP_ANIM_WORKER ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "anim-worker.mjs"); }

/**
 * Renderiza una escena animada a un clip de vídeo sin audio: proceso hijo (Skia) → tubería RGBA → FFmpeg (subtítulos + H.264).
 * Cancelable, con caché por contenido y sin cargar fotogramas en la memoria del proceso web.
 */
export async function renderAnimatedClip(spec: Clip2DSpec, o: { cacheDir: string; tmpDir: string; signal?: AbortSignal; onProgress?: (f: number) => void }): Promise<{ file: string; cached: boolean }> {
  const key = clip2dKey(spec); const cached = path.join(o.cacheDir, "clips", `${key}.mp4`);
  try { const st = await fs.stat(cached); if (st.size > 1000) { await fs.utimes(cached, new Date(), new Date()); return { file: cached, cached: true }; } } catch { /* a renderizar */ }

  const { width: W, height: H, stage } = spec; const fps = stage.fps; const frames = Math.max(1, Math.ceil(spec.durationSec * fps));
  await fs.mkdir(o.tmpDir, { recursive: true, mode: 0o700 });
  const jobFile = path.join(o.tmpDir, "anim-job.json");
  await fs.writeFile(jobFile, JSON.stringify({ stage, width: W, height: H, fps, frames, images: Object.fromEntries(Object.entries(spec.images).map(([k, v]) => [k, v.path])) }), { mode: 0o600 });

  const worker = spawn(process.execPath, ["--no-warnings", workerPath(), jobFile], { stdio: ["ignore", "pipe", "pipe"] });
  let wErr = "", workerFailure: RenderError | undefined;
  worker.stderr.on("data", (d: Buffer) => { wErr = (wErr + d.toString()).slice(-1500); });
  const inner = new AbortController();
  const onOuter = () => inner.abort(); o.signal?.addEventListener("abort", onOuter, { once: true });
  const workerDone = new Promise<void>((resolve) => {
    worker.once("error", (e) => { workerFailure = new RenderError(`No se pudo iniciar el motor de animación: ${e.message}`, false); inner.abort(); resolve(); });
    worker.once("close", (code) => { if (code !== 0 && !inner.signal.aborted) { workerFailure = new RenderError(`El motor de animación falló (código ${code}): ${wErr.trim().split("\n").slice(-3).join(" | ")}`, false); inner.abort(); } resolve(); });
  });

  const vf = [spec.assText ? (await fs.writeFile(path.join(o.tmpDir, "sub.ass"), spec.assText, { mode: 0o600 }), `subtitles=filename=${esc(path.join(o.tmpDir, "sub.ass"))}${spec.fontsDir ? `:fontsdir=${esc(spec.fontsDir)}` : ""}`) : null, "format=yuv420p"].filter(Boolean).join(",");
  const enc = encodeArgs({ threads: spec.threads, crf: 19, preset: "veryfast" }).filter((_, i, a) => !(a[i - 1] === "-c:a" || a[i] === "-c:a" || a[i] === "-b:a" || a[i - 1] === "-b:a" || a[i] === "-ar" || a[i - 1] === "-ar" || a[i] === "-ac" || a[i - 1] === "-ac"));
  const out = path.join(o.tmpDir, "clip.mp4");
  try {
    await runFfmpeg(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-framerate", String(fps), "-i", "pipe:0", "-vf", vf, "-frames:v", String(frames), "-an", ...enc, out],
      { signal: inner.signal, stdin: worker.stdout, expectedSec: frames / fps, onProgress: (p) => o.onProgress?.(p.fraction) });
    await workerDone;
    if (workerFailure) throw workerFailure;
  } catch (e) {
    worker.kill("SIGKILL"); await workerDone;
    if (workerFailure) throw workerFailure;
    if (o.signal?.aborted) throw new CanceledError();
    throw e;
  } finally { o.signal?.removeEventListener("abort", onOuter); worker.kill("SIGKILL"); }
  await fs.mkdir(path.dirname(cached), { recursive: true, mode: 0o700 });
  await fs.rename(out, cached).catch(async () => { await fs.copyFile(out, cached); });
  return { file: cached, cached: false };
}
