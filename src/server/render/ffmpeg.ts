import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { env } from "@/server/env";

/** Error del motor. `retryable` indica si tiene sentido reintentar (fallo transitorio) o no (entrada/filtro inválido). */
export class RenderError extends Error {
  constructor(message: string, public retryable = false, public stderrTail = "") { super(message); this.name = "RenderError"; }
}
export class CanceledError extends Error { constructor() { super("Cancelado"); this.name = "CanceledError"; } }
export class TimeoutError extends Error {
  constructor(ms: number) { super(`Tiempo máximo excedido (${ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`})`); this.name = "TimeoutError"; }
}

// ---------- control de procesos hijos ----------
const children = new Set<ChildProcess>();
let exitHook = false;
function track(c: ChildProcess) {
  children.add(c); c.once("close", () => children.delete(c));
  if (!exitHook) { exitHook = true; process.on("exit", () => { for (const k of children) try { k.kill("SIGKILL"); } catch { /* ya terminó */ } }); }
}
export const runningFfmpegProcesses = () => children.size;

/** Errores deterministas (entrada rota, filtro inexistente…): reintentar daría el mismo resultado. */
const DETERMINISTIC = /(no such file|invalid data found|error (parsing|initializing|reinitializing|while opening)|option .* not found|no such filter|unable to find a suitable output|invalid argument|cannot find a matching stream|does not contain any stream|moov atom not found|unrecognized option|failed to set value)/i;
export const isDeterministicFailure = (stderr: string) => DETERMINISTIC.test(stderr);

// ---------- progreso ----------
/** Interpreta el flujo `-progress pipe:1` de FFmpeg (clave=valor por línea). */
export function parseProgressLine(line: string, state: { outSec?: number; speed?: number; ended?: boolean }) {
  const i = line.indexOf("="); if (i < 0) return;
  const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
  if (k === "out_time_us" || k === "out_time_ms") { const n = Number(v); if (Number.isFinite(n) && n >= 0) state.outSec = n / 1e6; }
  else if (k === "speed") { const n = parseFloat(v); if (Number.isFinite(n)) state.speed = n; }
  else if (k === "progress" && v === "end") state.ended = true;
}

export type RunOptions = {
  signal?: AbortSignal;
  /** Duración esperada de la salida; permite calcular el progreso real (0..1). */
  expectedSec?: number;
  onProgress?: (p: { fraction: number; outSec: number; speed?: number }) => void;
};

/**
 * Ejecuta FFmpeg SIN shell (argumentos en array → sin inyección), con prioridad baja, progreso real y cancelación.
 * Cancelar = SIGTERM (cierra el MP4 limpiamente) y SIGKILL si no responde en 3 s.
 */
export function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<{ stderrTail: string }> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new CanceledError());
    const full = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats", ...args];
    const child = spawn(env().KAP_FFMPEG_PATH, full, { stdio: ["ignore", "pipe", "pipe"] });
    track(child);
    try { if (child.pid) os.setPriority(child.pid, 10); } catch { /* sin permiso: se ignora */ }

    let tail = "", buf = "", aborted = false, killTimer: NodeJS.Timeout | undefined;
    const st: { outSec?: number; speed?: number; ended?: boolean } = {};
    child.stderr.on("data", (d: Buffer) => { tail = (tail + d.toString()).slice(-4000); });
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString(); const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        parseProgressLine(l, st);
        if (l.startsWith("progress=") && opts.onProgress && st.outSec !== undefined) {
          const f = opts.expectedSec ? Math.min(0.999, st.outSec / opts.expectedSec) : 0;
          opts.onProgress({ fraction: f, outSec: st.outSec, speed: st.speed });
        }
      }
    });
    const onAbort = () => { aborted = true; child.kill("SIGTERM"); killTimer = setTimeout(() => child.kill("SIGKILL"), 3000); };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", (e: NodeJS.ErrnoException) => {
      opts.signal?.removeEventListener("abort", onAbort); clearTimeout(killTimer);
      reject(new RenderError(e.code === "ENOENT" ? `FFmpeg no está instalado o no se encuentra (${env().KAP_FFMPEG_PATH})` : `No se pudo iniciar FFmpeg: ${e.message}`, false));
    });
    child.once("close", (code, sig) => {
      opts.signal?.removeEventListener("abort", onAbort); clearTimeout(killTimer);
      if (aborted) return reject(new CanceledError());
      if (code === 0) return resolve({ stderrTail: tail });
      const msg = tail.trim().split("\n").slice(-3).join(" | ") || (sig ? `terminado por señal ${sig}` : "sin detalle");
      reject(new RenderError(`FFmpeg falló (código ${code ?? sig}): ${msg}`, !isDeterministicFailure(tail), tail));
    });
  });
}

// ---------- ffprobe ----------
export type ProbeResult = {
  durationSec: number; width: number; height: number; hasVideo: boolean; hasAudio: boolean;
  videoCodec?: string; audioCodec?: string; pixFmt?: string; sizeBytes: number;
};

/** Lee metadatos. `-protocol_whitelist file`: el archivo no puede arrastrar lecturas de red ni de otros archivos. */
export function ffprobe(file: string, timeoutMs = 20000): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(env().KAP_FFPROBE_PATH, ["-v", "error", "-protocol_whitelist", "file", "-print_format", "json", "-show_format", "-show_streams", file], { stdio: ["ignore", "pipe", "pipe"] });
    track(child);
    let out = "", err = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d: Buffer) => { if (out.length < 2_000_000) out += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-1000); });
    child.once("error", (e: NodeJS.ErrnoException) => { clearTimeout(t); reject(new RenderError(e.code === "ENOENT" ? "ffprobe no está instalado" : e.message, false)); });
    child.once("close", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new RenderError(`Archivo ilegible: ${err.trim().split("\n").pop() || "ffprobe falló"}`, false));
      try {
        const j = JSON.parse(out) as { streams?: Record<string, unknown>[]; format?: Record<string, unknown> };
        const v = j.streams?.find((s) => s.codec_type === "video"), a = j.streams?.find((s) => s.codec_type === "audio");
        const dur = Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0);
        resolve({
          durationSec: Number.isFinite(dur) ? dur : 0, width: Number(v?.width ?? 0), height: Number(v?.height ?? 0),
          hasVideo: !!v, hasAudio: !!a, videoCodec: v?.codec_name as string | undefined, audioCodec: a?.codec_name as string | undefined,
          pixFmt: v?.pix_fmt as string | undefined, sizeBytes: Number(j.format?.size ?? 0),
        });
      } catch { reject(new RenderError("Respuesta de ffprobe inválida", false)); }
    });
  });
}

// ---------- capacidades ----------
const FONT_CANDIDATES = [
  "/usr/share/fonts/opentype/inter/Inter-Bold.otf", "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  "/Library/Fonts/Arial Bold.ttf", "C:\\Windows\\Fonts\\arialbd.ttf",
];
export function resolveFont(): string | null {
  const f = env().KAP_FONT_FILE;
  if (f) return fs.existsSync(f) ? f : null;
  return FONT_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
}

function capture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    let out = ""; const c = spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"] });
    c.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    c.once("error", () => resolve("")); c.once("close", () => resolve(out));
  });
}

export type Capabilities = {
  ok: boolean; version: string | null; ffprobe: boolean; h264: boolean; aac: boolean;
  filters: Record<"subtitles" | "drawtext" | "xfade" | "amix" | "loudnorm" | "zoompan", boolean>;
  font: string | null; problems: string[]; checkedAt: number;
};
let cache: { at: number; value: Capabilities } | undefined;

/** Qué puede hacer realmente el FFmpeg instalado (se cachea 60 s). */
export async function getCapabilities(force = false): Promise<Capabilities> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.value;
  const bin = env().KAP_FFMPEG_PATH;
  const [ver, enc, fil, probe] = await Promise.all([
    capture(bin, ["-hide_banner", "-version"]), capture(bin, ["-hide_banner", "-encoders"]),
    capture(bin, ["-hide_banner", "-filters"]), capture(env().KAP_FFPROBE_PATH, ["-version"]),
  ]);
  const has = (txt: string, name: string) => new RegExp(`\\s${name}\\s`).test(txt);
  const filters = { subtitles: has(fil, "subtitles"), drawtext: has(fil, "drawtext"), xfade: has(fil, "xfade"), amix: has(fil, "amix"), loudnorm: has(fil, "loudnorm"), zoompan: has(fil, "zoompan") };
  const v: Capabilities = {
    ok: false, version: /ffmpeg version (\S+)/.exec(ver)?.[1] ?? null, ffprobe: probe.includes("ffprobe version"),
    h264: has(enc, "libx264"), aac: has(enc, "aac"), filters, font: resolveFont(), problems: [], checkedAt: Date.now(),
  };
  if (!v.version) v.problems.push("FFmpeg no está instalado o no es ejecutable");
  if (v.version && !v.h264) v.problems.push("Falta el códec H.264 (libx264)");
  if (v.version && !v.aac) v.problems.push("Falta el códec AAC");
  if (v.version && !v.ffprobe) v.problems.push("Falta ffprobe");
  if (v.version && !filters.drawtext) v.problems.push("Falta el filtro drawtext (libfreetype)");
  if (v.version && !filters.subtitles) v.problems.push("Falta el filtro subtitles (libass): no se podrán quemar subtítulos");
  if (!v.font) v.problems.push("No se encontró ninguna fuente (instala fonts-inter o define KAP_FONT_FILE)");
  v.ok = !!v.version && v.h264 && v.aac && v.ffprobe && filters.drawtext && !!v.font;
  cache = { at: Date.now(), value: v };
  return v;
}
