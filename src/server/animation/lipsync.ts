import { spawn } from "node:child_process";
import { env } from "@/server/env";
import { RenderError } from "@/server/render/ffmpeg";

/**
 * Labial por AMPLITUD: decodifica la narración a PCM mono de 8 kHz y calcula la energía (RMS) de cada fotograma.
 * Es una aproximación honesta: la boca se abre donde hay sonido; no reconoce fonemas (eso requeriría un reconocedor de voz).
 */
export async function audioEnvelope(file: string, fps: number, signal?: AbortSignal): Promise<number[]> {
  const pcm = await new Promise<Buffer>((resolve, reject) => {
    const c = spawn(env().KAP_FFMPEG_PATH, ["-v", "error", "-nostdin", "-i", file, "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let size = 0, err = "";
    c.stdout.on("data", (d: Buffer) => { size += d.length; if (size > 64 * 1024 * 1024) { c.kill("SIGKILL"); return; } chunks.push(d); });
    c.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-300); });
    const kill = () => c.kill("SIGKILL"); signal?.addEventListener("abort", kill, { once: true });
    c.once("error", (e) => reject(new RenderError(`No se pudo analizar el audio: ${e.message}`, false)));
    c.once("close", (code) => { signal?.removeEventListener("abort", kill); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new RenderError(`No se pudo analizar el audio (${code}): ${err.trim()}`, false)); });
  });
  return envelopeFromPcm(new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2)), 8000, fps);
}

/** RMS por ventana → normalizado por el percentil 95 → puerta de ruido + suavizado (apertura 0..1). Pura y testeable. */
export function envelopeFromPcm(s: Int16Array, rate: number, fps: number): number[] {
  const win = Math.max(1, Math.round(rate / fps)), n = Math.ceil(s.length / win), rms: number[] = [];
  for (let i = 0; i < n; i++) { let a = 0, k = 0; for (let j = i * win; j < Math.min(s.length, (i + 1) * win); j++) { a += s[j] * s[j]; k++; } rms.push(Math.sqrt(a / Math.max(1, k)) / 32768); }
  const sorted = [...rms].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 1e-6, gate = Math.max(0.004, p95 * 0.12);
  let prev = 0; return rms.map((v) => { const x = v < gate ? 0 : Math.min(1, (v / p95) ** 0.8); prev = prev * 0.45 + x * 0.55; return +prev.toFixed(2); });
}
