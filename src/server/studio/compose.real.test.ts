import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { composeSegmented, composeSinglePass, MAX_OVERLAP, type ComposeClip } from "./compose";
import { ffprobe } from "@/server/render/ffmpeg";

let root: string;
const ff = (...a: string[]) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a]); if (r.status !== 0) throw new Error(r.stderr.toString()); return r; };
const DURS = [3.2, 2.6, 3.7, 2.4, 3.1, 2.9, 3.5];
const TR: ComposeClip["transition"][] = ["cut", "fade", "dissolve", "cut", "fadeblack", "fade", "dissolve"];
let clips: ComposeClip[];
const base = () => ({ clips, narration: [{ file: path.join(root, "nar.wav"), start: 0.4 }, { file: path.join(root, "nar.wav"), start: 9.1 }], sfx: [], music: { file: path.join(root, "mus.wav"), volume: 0.2 } });

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-seg-"));
  ff("-f", "lavfi", "-i", "sine=f=330:d=3", "-ar", "48000", path.join(root, "nar.wav"));
  ff("-f", "lavfi", "-i", "sine=f=110:d=40", "-ar", "48000", path.join(root, "mus.wav"));
  clips = [];
  for (const [i, d] of DURS.entries()) {   // cada clip dura dur + cola, con una imagen y un movimiento distintos y subtítulo-like para que los empalmes se noten
    const f = path.join(root, `c${i}.mp4`);
    ff("-f", "lavfi", "-i", `testsrc2=s=480x270:r=30:d=${(d + MAX_OVERLAP).toFixed(3)}`, "-vf", `hue=h=${i * 50},drawbox=x=${20 + i * 30}:y=40:w=60:h=60:color=white:t=fill`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", "30", f);
    clips.push({ file: f, dur: d, transition: TR[i] });
  }
}, 120_000);
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("montaje por tramos == pasada única (FFmpeg real)", () => {
  it.each([2, 3])("mismo nº de fotogramas, duración, audio y aspecto (%i escenas por tramo)", async (per) => {
    const a = path.join(root, `single-${per}.mp4`), b = path.join(root, `seg-${per}.mp4`);
    await composeSinglePass({ ...base(), tmpDir: path.join(root, `t1-${per}`), out: a });
    const r = await composeSegmented({ ...base(), tmpDir: path.join(root, `t2-${per}`), out: b, segmentScenes: per });
    expect(r.segments).toBeGreaterThan(1);
    const pa = await ffprobe(a), pb = await ffprobe(b);
    expect(pb.width).toBe(pa.width); expect(pb.height).toBe(pa.height); expect(pb.videoCodec).toBe("h264"); expect(pb.audioCodec).toBe("aac");
    expect(Math.abs(pb.durationSec - pa.durationSec)).toBeLessThan(0.05);
    const frames = (f: string) => Number(/nb_read_frames=(\d+)/.exec(spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1", f]).stdout.toString())?.[1]);
    expect(frames(b)).toBe(frames(a));
    // el vídeo decodifica entero sin errores y los fotogramas siguen el mismo orden temporal
    const dec = spawnSync("ffmpeg", ["-v", "error", "-i", b, "-f", "null", "-"]); expect(dec.stderr.toString().trim()).toBe("");
    // aspecto: PSNR fotograma a fotograma contra la pasada única (los empalmes no deben notarse)
    const ps = spawnSync("ffmpeg", ["-i", b, "-i", a, "-lavfi", `psnr=stats_file=${path.join(root, `psnr-${per}.txt`)}`, "-f", "null", "-"]).stderr.toString();
    const avg = Number(/average:([\d.]+|inf)/.exec(ps)?.[1] ?? "0"), min = Number(/min:([\d.]+)/.exec(ps)?.[1] ?? "0");
    expect(avg).toBeGreaterThan(38); expect(min).toBeGreaterThan(30);
    // audio: mismo contenido (la pasada es la misma; se admite diferencia mínima de codificación)
    const pcm = (f: string) => ff("-i", f, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-").stdout;
    const x = pcm(a), y = pcm(b); expect(Math.abs(x.length - y.length)).toBeLessThan(2 * 8000 * 0.05);
    let diff = 0, ref = 0; const n = Math.min(x.length, y.length) / 2; for (let i = 0; i < n; i += 7) { const d = x.readInt16LE(i * 2) - y.readInt16LE(i * 2); diff += d * d; ref += x.readInt16LE(i * 2) ** 2; }
    expect(diff / Math.max(1, ref)).toBeLessThan(0.01);
  }, 180_000);

  it("la caché de tramos se reutiliza y solo se rehace el tramo afectado", async () => {
    const cacheDir = path.join(root, "cache");
    const r1 = await composeSegmented({ ...base(), tmpDir: path.join(root, "t3"), out: path.join(root, "c1.mp4"), segmentScenes: 2, cacheDir });
    expect(r1.reused).toBe(0);
    const r2 = await composeSegmented({ ...base(), tmpDir: path.join(root, "t4"), out: path.join(root, "c2.mp4"), segmentScenes: 2, cacheDir });
    expect(r2.reused).toBe(r2.segments);
    // cambiar la última escena (otro fichero de clip) invalida solo los tramos que la leen
    const edited = clips.map((c, i) => (i === clips.length - 1 ? { ...c, file: clips[0].file } : c));
    const r3 = await composeSegmented({ ...base(), clips: edited, tmpDir: path.join(root, "t5"), out: path.join(root, "c3.mp4"), segmentScenes: 2, cacheDir });
    expect(r3.reused).toBeGreaterThanOrEqual(r3.segments - 2); expect(r3.reused).toBeLessThan(r3.segments);
  }, 180_000);
});
