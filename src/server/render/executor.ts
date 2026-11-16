import os from "node:os";
import type { Storage } from "@/ports";
import { dimensions } from "./presets";
import { RenderError, ffprobe } from "./ffmpeg";
import { renderSlate } from "./slate";
import type { Executor } from "./queue";

/** Comprueba que la salida es exactamente lo prometido: H.264 + AAC, yuv420p, dimensiones y duración. */
export async function validateOutput(file: string, expect: { width: number; height: number; durationSec: number }) {
  const p = await ffprobe(file);
  const problems: string[] = [];
  if (p.videoCodec !== "h264") problems.push(`códec de vídeo ${p.videoCodec}`);
  if (p.audioCodec !== "aac") problems.push(`códec de audio ${p.audioCodec ?? "ausente"}`);
  if (p.pixFmt !== "yuv420p") problems.push(`formato de píxel ${p.pixFmt}`);
  if (p.width !== expect.width || p.height !== expect.height) problems.push(`dimensiones ${p.width}x${p.height} (esperadas ${expect.width}x${expect.height})`);
  if (Math.abs(p.durationSec - expect.durationSec) > Math.max(0.6, expect.durationSec * 0.03)) problems.push(`duración ${p.durationSec.toFixed(2)} s (esperada ${expect.durationSec} s)`);
  if (problems.length) throw new RenderError("La salida no cumple el formato esperado: " + problems.join("; "), false);
  return p;
}

export function createExecutor(storage: Storage, cfg: { threads: number; concurrency: number }): Executor {
  const threads = cfg.threads || Math.max(1, Math.floor(os.cpus().length / cfg.concurrency));
  return async (job, ctx) => {
    if (job.kind !== "slate") throw new RenderError(`El renderizado de «${job.kind}» se implementa en la subfase B (composición de escenas)`, false);
    const prod = job.productionId ? await storage.productions.get(job.productionId) : undefined;
    if (job.productionId && !prod) throw new RenderError("La producción asociada ya no existe", false);
    const title = String(job.params.title ?? prod?.title ?? "KAP");
    const subtitle = job.params.subtitle ? String(job.params.subtitle) : prod ? `Temporada ${prod.season} · ${prod.kind === "episode" ? "Episodio" : "Short"} ${prod.number}` : undefined;
    const durationSec = Math.max(1, Math.min(Number(job.params.durationSec ?? 8), 600));
    const { file, expectedSec } = await renderSlate({ title, subtitle, durationSec, format: job.format, quality: job.quality, tmpDir: ctx.tmpDir, threads, signal: ctx.signal, onProgress: (f) => ctx.onProgress(f) });
    const { width, height } = dimensions(job.format, job.quality);
    const p = await validateOutput(file, { width, height, durationSec: expectedSec });
    return { file, durationSec: p.durationSec, width: p.width, height: p.height, sizeBytes: p.sizeBytes };
  };
}
