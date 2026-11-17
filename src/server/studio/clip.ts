import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Scene } from "@/domain/types";
import { encodeArgs, FPS } from "@/server/render/presets";
import { RenderError, resolveFont, runFfmpeg } from "@/server/render/ffmpeg";
import { escFilter, wrapText } from "@/server/render/slate";

export const CLIP_VERSION = 3; // súbelo si cambia el aspecto de los clips: invalida la caché

export type Visual = { path: string; kind: "image" | "video"; sig: string };
export type ClipSpec = {
  scene: Scene; visual?: Visual; width: number; height: number; durationSec: number;
  assText?: string; fontsDir?: string; sceneNumber: number; threads?: number;
};

/** Clave de caché: solo cambia si cambia algo que afecta al resultado visual de ESTA escena. */
export function clipKey(s: ClipSpec): string {
  return createHash("sha256").update(JSON.stringify([CLIP_VERSION, s.width, s.height, Math.round(s.durationSec * 100), s.scene.motion, s.visual?.sig ?? null,
    s.visual ? null : [s.scene.title, s.scene.location], s.assText ?? null])).digest("hex").slice(0, 32);
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Renderiza UNA escena a un clip de vídeo sin audio (H.264, 30 fps), con movimiento suave (Ken Burns), subtítulos
 * quemados (ASS) y, si no hay recurso visual, una tarjeta KAP con el título/lugar. Se cachea por contenido.
 */
export async function renderSceneClip(spec: ClipSpec, o: { cacheDir: string; tmpDir: string; signal?: AbortSignal; onProgress?: (f: number) => void }): Promise<{ file: string; cached: boolean }> {
  const key = clipKey(spec);
  const cached = path.join(o.cacheDir, "clips", `${key}.mp4`);
  try { const st = await fs.stat(cached); if (st.size > 1000) { await fs.utimes(cached, new Date(), new Date()); return { file: cached, cached: true }; } } catch { /* a renderizar */ }

  const { width: W, height: H, durationSec: D } = spec;
  await fs.mkdir(o.tmpDir, { recursive: true, mode: 0o700 });
  const font = resolveFont();
  const steps: string[] = []; const input: string[] = [];

  if (spec.visual?.kind === "image") {
    const EW = even(W * 1.2), EH = even(H * 1.2);
    input.push("-loop", "1", "-framerate", String(FPS), "-t", D.toFixed(3), "-i", spec.visual.path);
    if (spec.scene.motion === "kenburns") {
      // zoom lento y centrado; la imagen se amplía antes para que el movimiento no «tiemble»
      steps.push(`scale=${EW}:${EH}:force_original_aspect_ratio=increase`, `crop=${EW}:${EH}`,
        `zoompan=z='min(1+0.00055*on,1.12)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS}`);
    } else steps.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`);
  } else if (spec.visual?.kind === "video") {
    input.push("-stream_loop", "-1", "-t", D.toFixed(3), "-i", spec.visual.path);
    steps.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${FPS}`);
  } else {
    if (!font) throw new RenderError("No hay ninguna fuente disponible para la tarjeta de escena", false);
    const vertical = H > W; const f = escFilter(font);
    const t1 = path.join(o.tmpDir, "card-title.txt"), t2 = path.join(o.tmpDir, "card-sub.txt");
    await fs.writeFile(t1, wrapText(spec.scene.location || spec.scene.title || `Escena ${spec.sceneNumber}`, vertical ? 14 : 26), { mode: 0o600 });
    await fs.writeFile(t2, `KAP · ESCENA ${spec.sceneNumber}`, { mode: 0o600 });
    input.push("-f", "lavfi", "-i", `color=c=0x111318:s=${W}x${H}:r=${FPS}:d=${D.toFixed(3)}`);
    steps.push(
      `drawtext=fontfile=${f}:textfile=${escFilter(t1)}:expansion=none:fontcolor=0xE9B949:fontsize=${vertical ? "w/10" : "h/12"}:line_spacing=10:text_align=center:x=(w-text_w)/2:y=(h-text_h)/2-h*0.04`,
      `drawbox=x=(iw-iw*0.14)/2:y=ih*0.62:w=iw*0.14:h=${Math.max(3, Math.round(H / 270))}:color=0xE9B949:t=fill`,
      `drawtext=fontfile=${f}:textfile=${escFilter(t2)}:expansion=none:fontcolor=0x9299A6:fontsize=${vertical ? "w/30" : "h/36"}:x=(w-text_w)/2:y=h*0.68`);
  }
  steps.push("setsar=1");
  if (spec.assText) {
    const ass = path.join(o.tmpDir, "sub.ass"); await fs.writeFile(ass, spec.assText, { mode: 0o600 });
    steps.push(`subtitles=filename=${escFilter(ass)}${spec.fontsDir ? `:fontsdir=${escFilter(spec.fontsDir)}` : ""}`);
  }
  steps.push("format=yuv420p");

  const out = path.join(o.tmpDir, "clip.mp4");
  const enc = encodeArgs({ threads: spec.threads, crf: 19, preset: "veryfast" }).filter((_, i, a) => !(a[i - 1] === "-c:a" || a[i] === "-c:a" || a[i] === "-b:a" || a[i - 1] === "-b:a" || a[i] === "-ar" || a[i - 1] === "-ar" || a[i] === "-ac" || a[i - 1] === "-ac"));
  await runFfmpeg([...input, "-vf", steps.join(","), "-t", D.toFixed(3), "-an", ...enc, out], { signal: o.signal, expectedSec: D, onProgress: (p) => o.onProgress?.(p.fraction) });
  await fs.mkdir(path.dirname(cached), { recursive: true, mode: 0o700 });
  await fs.rename(out, cached).catch(async () => { await fs.copyFile(out, cached); });
  return { file: cached, cached: false };
}

/** Elimina clips antiguos de la caché hasta quedar por debajo de `maxMb` (los menos usados primero). */
export async function pruneClipCache(cacheDir: string, maxMb: number, sub = "clips"): Promise<number> {
  const dir = path.join(cacheDir, sub); let names: string[]; try { names = await fs.readdir(dir); } catch { return 0; }
  const items = (await Promise.all(names.map(async (n) => { try { const st = await fs.stat(path.join(dir, n)); return { n, size: st.size, t: st.mtimeMs }; } catch { return null; } }))).filter(Boolean) as { n: string; size: number; t: number }[];
  let total = items.reduce((a, b) => a + b.size, 0), removed = 0;
  for (const it of items.sort((a, b) => a.t - b.t)) { if (total <= maxMb * 1048576) break; await fs.rm(path.join(dir, it.n), { force: true }); total -= it.size; removed++; }
  return removed;
}
