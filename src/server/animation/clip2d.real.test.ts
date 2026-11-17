import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { demoStage } from "@/animation/demo";
import { renderAnimatedClip } from "./clip2d";
import { ffprobe, runningFfmpegProcesses, CanceledError } from "@/server/render/ffmpeg";

const dirs: string[] = []; const tmp = async () => { const d = await fs.mkdtemp(path.join(os.tmpdir(), "kap-2d-")); dirs.push(d); return d; };
afterAll(async () => { for (const d of dirs) await fs.rm(d, { recursive: true, force: true }); });
const frameAt = async (video: string, t: number, out: string) => { spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", out]); const img = await loadImage(out); const cv = createCanvas(img.width, img.height); const c = cv.getContext("2d"); c.drawImage(img, 0, 0); return c.getImageData(0, 0, img.width, img.height).data; };

describe("motor de animación 2D: trabajador Skia → FFmpeg (real)", () => {
  it("renderiza un clip MP4 H.264 con movimiento real, y lo cachea por contenido", async () => {
    const root = await tmp(); const spec = { stage: demoStage({ duration: 3 }), width: 854, height: 480, durationSec: 3, images: {} };
    const t0 = Date.now(); const r = await renderAnimatedClip(spec, { cacheDir: path.join(root, "cache"), tmpDir: path.join(root, "t1") });
    const ms = Date.now() - t0; expect(r.cached).toBe(false);
    const p = await ffprobe(r.file);
    expect([p.width, p.height, p.videoCodec, p.pixFmt, p.hasAudio]).toEqual([854, 480, "h264", "yuv420p", false]);
    expect(Math.abs(p.durationSec - 3)).toBeLessThan(0.15);
    // movimiento real: KAP entra caminando → fotogramas distintos
    const a = await frameAt(r.file, 0.3, path.join(root, "a.png")), b = await frameAt(r.file, 1.9, path.join(root, "b.png"));
    let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    expect(d / (a.length / 4)).toBeGreaterThan(3);
    console.log(`   render 2D de 3 s a 480p: ${ms} ms`);
    const again = await renderAnimatedClip(spec, { cacheDir: path.join(root, "cache"), tmpDir: path.join(root, "t2") }); expect(again.cached).toBe(true);
    // cambiar el DISEÑO de un personaje invalida la caché (continuidad: se re-renderiza lo afectado)
    const changed = structuredClone(spec); changed.stage.actors[0].appearance.top = "#ff0000";
    expect((await renderAnimatedClip(changed, { cacheDir: path.join(root, "cache"), tmpDir: path.join(root, "t3") })).cached).toBe(false);
  }, 90_000);

  it("subtítulos ASS se queman sobre la animación", async () => {
    const root = await tmp(); const ass = `[Script Info]\nPlayResX: 854\nPlayResY: 480\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, BorderStyle, Outline, Alignment, MarginV\nStyle: KAP,Inter,40,&H00F5F5F5,&H00111318,-1,1,3,2,30\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:00.20,0:00:02.80,KAP,,0,0,0,,HOLA KAP\n`;
    const base = { stage: demoStage({ duration: 3 }), width: 854, height: 480, durationSec: 3, images: {} };
    const plain = await renderAnimatedClip(base, { cacheDir: path.join(root, "c1"), tmpDir: path.join(root, "t1") });
    const sub = await renderAnimatedClip({ ...base, assText: ass, fontsDir: "/usr/share/fonts/opentype/inter" }, { cacheDir: path.join(root, "c2"), tmpDir: path.join(root, "t2") });
    const a = await frameAt(plain.file, 1.0, path.join(root, "a.png")), b = await frameAt(sub.file, 1.0, path.join(root, "b.png"));
    let d = 0; for (let y = 400 * 854 * 4; y < a.length; y += 4) d += Math.abs(a[y] - b[y]);   // franja inferior: donde va el subtítulo
    expect(d).toBeGreaterThan(20000);
  }, 90_000);

  it("CANCELAR mata el trabajador y FFmpeg: no quedan procesos", async () => {
    const root = await tmp(); const ac = new AbortController();
    const spec = { stage: demoStage({ duration: 120, width: 1920, height: 1080 }), width: 1920, height: 1080, durationSec: 120, images: {} };
    const p = renderAnimatedClip(spec, { cacheDir: path.join(root, "cache"), tmpDir: path.join(root, "t"), signal: ac.signal, onProgress: (f) => { if (f > 0.01 && !ac.signal.aborted) ac.abort(); } });
    await expect(p).rejects.toBeInstanceOf(CanceledError);
    await new Promise((r) => setTimeout(r, 600));
    expect(runningFfmpegProcesses()).toBe(0);
    // solo los procesos de ESTE test (su directorio único aparece en la línea de órdenes del worker y de FFmpeg): otros tests pueden tener trabajadores propios en paralelo
    expect(spawnSync("pgrep", ["-f", root]).stdout.toString().trim()).toBe("");
    expect(await fs.readdir(path.join(root, "cache", "clips")).catch(() => [])).toEqual([]);
  }, 90_000);

  it("si el motor falla, el error es claro y no cuelga", async () => {
    const root = await tmp(); const bad = demoStage(); (bad.actors[0] as { appearance: unknown }).appearance = null;
    await expect(renderAnimatedClip({ stage: bad, width: 320, height: 180, durationSec: 1, images: {} }, { cacheDir: path.join(root, "c"), tmpDir: path.join(root, "t") })).rejects.toThrow(/motor de animación falló/);
    expect(runningFfmpegProcesses()).toBe(0);
  }, 60_000);
});
