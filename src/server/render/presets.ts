import type { RenderFormat, RenderQuality } from "@/domain/render";

const SHORT_SIDE: Record<RenderQuality, number> = { "480p": 480, "720p": 720, "1080p": 1080 };
export const FPS = 30;

/** 16:9 → 854x480 · 1280x720 · 1920x1080 ; 9:16 → las mismas con ejes invertidos. Siempre pares (requisito de yuv420p). */
export function dimensions(format: RenderFormat, quality: RenderQuality): { width: number; height: number } {
  const s = SHORT_SIDE[quality];
  const long = Math.round((s * 16) / 9 / 2) * 2;
  return format === "16:9" ? { width: long, height: s } : { width: s, height: long };
}

/** H.264 (High, yuv420p) + AAC estéreo 48 kHz, MP4 con moov al principio (reproducción progresiva en móvil). */
export function encodeArgs(opts: { threads?: number; crf?: number; preset?: string } = {}): string[] {
  return [
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", opts.preset ?? "veryfast", "-crf", String(opts.crf ?? 21),
    "-r", String(FPS), "-g", String(FPS * 2), "-threads", String(opts.threads ?? 0),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
  ];
}
