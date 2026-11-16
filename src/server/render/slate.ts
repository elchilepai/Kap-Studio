import fs from "node:fs/promises";
import path from "node:path";
import type { RenderFormat, RenderQuality } from "@/domain/render";
import { dimensions, encodeArgs, FPS } from "./presets";
import { RenderError, resolveFont, runFfmpeg } from "./ffmpeg";

export type SlateSpec = {
  title: string; subtitle?: string; durationSec: number; format: RenderFormat; quality: RenderQuality;
  tmpDir: string; threads?: number; signal?: AbortSignal; onProgress?: (fraction: number) => void;
};

/** Escapa un valor para usarlo dentro de un filtro de FFmpeg entre comillas simples. */
export const escFilter = (s: string) => "'" + s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%") + "'";

/** Parte un texto en líneas de como mucho `max` caracteres (sin cortar palabras). */
export function wrapText(text: string, max: number, maxLines = 4): string {
  const words = text.replace(/\s+/g, " ").trim().split(" "); const lines: string[] = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[maxLines - 1] = out[maxLines - 1].replace(/.{0,2}$/, "…");
  return out.join("\n");
}

/**
 * Tarjeta de título KAP: fondo #111318, título en amarillo #E9B949, marca y código de tiempo.
 * Es un render real (no una simulación): también servirá de escena de relleno cuando una escena no tenga imagen.
 * Los textos viajan en archivos (`textfile`), nunca interpolados en el filtro → sin inyección ni problemas de escape.
 */
export async function renderSlate(spec: SlateSpec): Promise<{ file: string; expectedSec: number }> {
  const font = resolveFont();
  if (!font) throw new RenderError("No hay ninguna fuente disponible para el texto (instala fonts-inter o define KAP_FONT_FILE)", false);
  const { width, height } = dimensions(spec.format, spec.quality);
  const vertical = spec.format === "9:16";
  const dur = Math.max(1, Math.min(spec.durationSec, 3600));

  await fs.mkdir(spec.tmpDir, { recursive: true, mode: 0o700 });
  const tTitle = path.join(spec.tmpDir, "title.txt"), tSub = path.join(spec.tmpDir, "sub.txt");
  await fs.writeFile(tTitle, wrapText(spec.title || "KAP", vertical ? 14 : 26), { mode: 0o600 });
  await fs.writeFile(tSub, wrapText(spec.subtitle ?? "KAP STUDIO", vertical ? 34 : 60, 2), { mode: 0o600 });

  const f = escFilter(font);
  const dt = (file: string, color: string, size: string, y: string, extra = "") =>
    `drawtext=fontfile=${f}:textfile=${escFilter(file)}:expansion=none:fontcolor=${color}:fontsize=${size}:line_spacing=10:text_align=center:x=(w-text_w)/2:y=${y}${extra}`;
  const vf = [
    dt(tTitle, "0xE9B949", `${vertical ? "w/9" : "h/11"}`, "(h-text_h)/2-h*0.05"),
    dt(tSub, "0x9299A6", `${vertical ? "w/26" : "h/30"}`, "h*0.78"),
    `drawtext=fontfile=${f}:text='%{pts\\:hms}':fontcolor=0xF5F5F5:fontsize=${vertical ? "w/26" : "h/34"}:x=(w-text_w)/2:y=h*0.88`,
  ].join(",");

  const out = path.join(spec.tmpDir, "out.mp4");
  await runFfmpeg([
    "-f", "lavfi", "-i", `color=c=0x111318:s=${width}x${height}:r=${FPS}:d=${dur}`,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", vf, "-t", String(dur), "-map", "0:v", "-map", "1:a",
    ...encodeArgs({ threads: spec.threads }), out,
  ], { signal: spec.signal, expectedSec: dur, onProgress: (p) => spec.onProgress?.(p.fraction) });
  return { file: out, expectedSec: dur };
}
