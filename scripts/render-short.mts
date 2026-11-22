/** Renderiza el Short ya generado (guion guardado en la base temporal de real-short.mts) sin volver a generar nada. */
import fs from "node:fs/promises"; import path from "node:path"; import { execFileSync } from "node:child_process";
const root = process.env.SHORT_DIR!, media = path.join(root, "media"), cache = path.join(root, "cache"), OUT = path.join(import.meta.dirname, "..", "docs", "short-real"), ID = process.env.SHORT_ID!, QUALITY = (process.env.REAL_QUALITY ?? "1080p") as "1080p";
process.env.KAP_DATA_DIR = root;
const { createSqliteStorage } = await import("../src/adapters/local/sqlite-storage"); const { createSqliteRender } = await import("../src/adapters/local/sqlite-render");
const { RenderQueue } = await import("../src/server/render/queue"); const { createExecutor } = await import("../src/server/render/executor"); const { ffprobe } = await import("../src/server/render/ffmpeg");
const { espeakProvider } = await import("../src/server/studio/voice"); const { afterRender } = await import("../src/server/studio/after");
try { await fetch("http://127.0.0.1:11434/api/generate", { method: "POST", body: JSON.stringify({ model: "qwen3:14b", keep_alive: 0 }) }); await new Promise((x) => setTimeout(x, 5000)); } catch { /* */ }
const st = createSqliteStorage(path.join(root, "kap.db")), store = createSqliteRender(st.db);
const q = new RenderQueue({ store, storage: st, mediaDir: media, tmpRoot: path.join(root, "tmp"), concurrency: 1, timeoutMs: 3 * 3600_000, minFreeMb: 0, pollMs: 100, heartbeatMs: 200,
  execute: createExecutor(st, { threads: 0, concurrency: 1, studio: { mediaDir: media, cacheDir: cache, voice: espeakProvider(), clipCacheMb: 2000, clipWorkers: 1, composeMode: "segmentos", segmentScenes: 4 } }),
  afterSuccess: (j: any, id: any) => afterRender(j, id, st, store, media, 1) }).start();
const t0 = Date.now(); await store.enqueue({ id: "short1", kind: "short", format: "9:16", quality: QUALITY, productionId: ID, params: { mode: "full", voice: "espeak", animation: "2d", shortsCount: 0 }, maxAttempts: 1 }, Date.now());
let job: any; for (;;) { job = (await store.get("short1"))!; if (["done", "failed", "canceled"].includes(job.status)) break; await new Promise((x) => setTimeout(x, 500)); }
const render: any = { status: job.status, error: job.error ?? null, renderSec: +((Date.now() - t0) / 1000).toFixed(0) };
if (job.status === "done") {
  const prod = (await st.productions.get(ID))!, vid = (await st.assets.get(prod.videoAssetId!))!, file = path.join(media, vid.path), pr = await ffprobe(file);
  Object.assign(render, { width: pr.width, height: pr.height, durationSec: +pr.durationSec.toFixed(1), scenes: prod.scenes.length, sizeMb: +(vid.size / 1048576).toFixed(1) });
  const dir = path.join(OUT, "frames"); await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < 12; i++) { try { execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", ((pr.durationSec * (i + 0.5)) / 12).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=270:-1", path.join(dir, `f${i + 1}.png`)]); } catch { /* */ } }
  try { execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(dir, "f%d.png"), "-filter_complex", "tile=6x2", "-frames:v", "1", path.join(OUT, "short-01-hoja-contacto.png")]); } catch { /* */ }
  await fs.copyFile(file, path.join(OUT, "short-01.mp4")); render.video = path.join(OUT, "short-01.mp4");
}
await fs.writeFile(path.join(OUT, "short-01-render.json"), JSON.stringify(render, null, 1)); console.log("RENDER " + JSON.stringify(render)); await q.shutdown();
