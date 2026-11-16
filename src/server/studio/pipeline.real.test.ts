import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createSqliteRender } from "@/adapters/local/sqlite-render";
import { RenderQueue } from "@/server/render/queue";
import { createExecutor } from "@/server/render/executor";
import { ffprobe, runningFfmpegProcesses } from "@/server/render/ffmpeg";
import { espeakProvider } from "./voice";
import { afterRender } from "./after";
import type { Asset, Production } from "@/domain/types";
import { buildFilterGraph } from "./compose";

const hasTts = await espeakProvider().available();
let root: string, st: ReturnType<typeof createSqliteStorage>, store: ReturnType<typeof createSqliteRender>, q: RenderQueue;
const media = () => path.join(root, "media"), cache = () => path.join(root, "cache");
const ff = (...a: string[]) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a]); if (r.status !== 0) throw new Error(r.stderr.toString()); };

const asset = async (o: Partial<Asset> & { id: string; path: string; kind: Asset["kind"] }): Promise<Asset> => {
  const size = (await fs.stat(path.join(media(), o.path))).size;
  const a = { origin: "uploaded", license: "propio", createdAt: "2026-01-01", name: o.path, mime: "x", size, ...o } as Asset; await st.assets.save(a); return a;
};
const script = Array.from({ length: 12 }, (_, i) => `# ${i === 0 ? "Refugio" : i === 1 ? "Azotea" : `Lugar ${i}`}
${i === 0 ? "[imagen: refugio de noche]\n[transición: fadeblack]\n" : ""}Escena número ${i + 1}: el viento cruza la ciudad vacía y KAP avanza despacio hacia el horizonte.
MIRA: ¿Seguimos adelante, KAP?`).join("\n\n");

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-pipe-")); await fs.mkdir(media(), { recursive: true });
  st = createSqliteStorage(":memory:"); store = createSqliteRender(st.db);
  ff("-f", "lavfi", "-i", "testsrc2=s=1280x720:d=1", "-frames:v", "1", path.join(media(), "refugio.png"));
  ff("-f", "lavfi", "-i", "smptebars=s=1280x720:d=1", "-frames:v", "1", path.join(media(), "azotea.png"));
  ff("-f", "lavfi", "-i", "sine=f=220:d=40", "-c:a", "libmp3lame", path.join(media(), "tema.mp3"));
  await asset({ id: "img-refugio", path: "refugio.png", kind: "image", name: "refugio.png", tags: ["refugio", "noche"], role: "background", mime: "image/png" });
  await asset({ id: "img-azotea", path: "azotea.png", kind: "image", name: "azotea.png", tags: ["azotea"], role: "background", mime: "image/png" });
  await asset({ id: "mus", path: "tema.mp3", kind: "audio", name: "tema.mp3", role: "music", license: "CC0 (propia)", mime: "audio/mpeg" });
  await st.characters.save({ id: "c1", name: "KAP", description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });
  await st.characters.save({ id: "c2", name: "Mira", description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });
  q = new RenderQueue({
    store, storage: st, mediaDir: media(), tmpRoot: path.join(root, "tmp"), concurrency: 1, timeoutMs: 170_000, minFreeMb: 0, pollMs: 50, heartbeatMs: 100,
    execute: createExecutor(st, { threads: 0, concurrency: 1, studio: { mediaDir: media(), cacheDir: cache(), voice: espeakProvider(), clipCacheMb: 500 } }),
    afterSuccess: (job, id) => afterRender(job, id, st, store, media(), 1),
  }).start();
});
afterAll(async () => { await q.shutdown(); await fs.rm(root, { recursive: true, force: true }); });

const waitFor = async (fn: () => Promise<boolean>, ms = 170_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error("timeout"); };
const job = async (id: string) => (await store.get(id))!;
const finished = async (id: string, ms = 170_000) => { await waitFor(async () => ["done", "failed", "canceled"].includes((await job(id)).status), ms); const j = await job(id); if (j.status !== "done") throw new Error(`job ${id} → ${j.status}: ${j.error}`); return j; };
const enqueue = (id: string, o: { productionId: string; kind?: "episode" | "short" | "preview"; format?: "16:9" | "9:16"; params?: Record<string, unknown> }) =>
  store.enqueue({ id, kind: o.kind ?? "episode", format: o.format ?? "16:9", quality: "480p", productionId: o.productionId, params: o.params ?? {}, maxAttempts: 1 }, Date.now());
const meanVolume = (file: string) => { const r = spawnSync("ffmpeg", ["-i", file, "-af", "volumedetect", "-f", "null", "-"]); return parseFloat(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr.toString())?.[1] ?? "-99"); };

describe("filtro de montaje (puro)", () => {
  it("xfade encadenado con offsets = inicio de cada escena; música con ducking solo si hay voz", () => {
    const c = (d: number, t: "fade" | "cut" = "fade") => ({ file: "x", dur: d, transition: t });
    const g = buildFilterGraph({ clips: [c(5), c(4), c(6, "cut")], narration: [{ file: "n", start: 0.3 }], sfx: [], music: { file: "m", volume: 0.2 } });
    expect(g.total).toBe(15); expect(g.graph).toContain("xfade=transition=fade:duration=0.700:offset=5.000"); expect(g.graph).toContain("offset=9.000");
    expect(g.graph).toContain("duration=0.033"); expect(g.graph).toContain("sidechaincompress");
    expect(buildFilterGraph({ clips: [c(5)], narration: [], sfx: [], music: { file: "m", volume: 0.2 } }).graph).not.toContain("sidechaincompress");
    expect(buildFilterGraph({ clips: [c(5)], narration: [], sfx: [], music: undefined }).graph).toContain("anullsrc".length ? "atrim=0:5.000[a]" : "");
  });
});

describe.skipIf(!hasTts)("pipeline automático REAL de principio a fin (FFmpeg + voz local)", () => {
  let epId = "", ep!: Production;
  it("«Generar episodio»: guion → escenas → voz → clips → montaje → revisión + Shorts derivados", async () => {
    epId = "ep1";
    await st.productions.save({ id: epId, kind: "episode", number: 1, season: 1, title: "El despertar", status: "ASSETS", synopsis: "", script, scenes: [], assetIds: [], durationSec: 0, createdAt: "x", updatedAt: "x", generated: false, brief: "" } as never);
    await enqueue("gen", { productionId: epId, params: { mode: "full", voice: "espeak", musicAssetId: "mus", shortsCount: 2, brief: "5 minutos, 2 shorts, tono oscuro" } });
    await finished("gen");
    const j = await job("gen"); expect(j.error).toBeUndefined();
    ep = (await st.productions.get(epId))!;

    // plan y estado
    expect(ep.status).toBe("REVIEW");                        // listo para revisión; NO aprobado ni publicado
    expect(ep.scenes.length).toBe(12);
    expect(ep.scenes.every((s) => s.durationSource === "audio")).toBe(true);
    expect(ep.scenes[0]).toMatchObject({ visualSource: "directive", visualAssetId: "img-refugio", transition: "fadeblack" });
    expect(ep.scenes[1]).toMatchObject({ visualSource: "library", visualAssetId: "img-azotea" });
    expect(ep.scenes.filter((s) => s.visualSource === "card").length).toBe(10);   // sin recurso: tarjetas, no se inventa nada
    expect((await st.places.list()).map((p) => p.name).sort()).toEqual(["Azotea", "Refugio"]); // memoria visual creada

    // vídeo real
    const v = (await st.assets.get(ep.videoAssetId!))!; const p = await ffprobe(path.join(media(), v.path));
    const sum = ep.scenes.reduce((n, s) => n + s.durationSec, 0);
    expect([p.width, p.height, p.videoCodec, p.audioCodec, p.pixFmt]).toEqual([854, 480, "h264", "aac", "yuv420p"]);
    expect(Math.abs(p.durationSec - sum)).toBeLessThan(0.7); expect(p.durationSec).toBeGreaterThan(40);
    expect(meanVolume(path.join(media(), v.path))).toBeGreaterThan(-45);   // hay voz+música reales, no silencio

    // subtítulos sueltos
    const subs = (await st.assets.list()).filter((a) => a.kind === "subtitle");
    expect(subs.map((a) => path.extname(a.path)).sort()).toEqual([".srt", ".vtt"]);
    const srt = await fs.readFile(path.join(media(), subs.find((a) => a.path.endsWith(".srt"))!.path), "utf8");
    expect(srt).toContain("-->"); expect(srt).toContain("Mira: ¿Seguimos adelante, KAP?");
  }, 180_000);

  it("deriva Shorts 9:16 (≤ 58 s) enlazados al episodio y los renderiza de verdad", async () => {
    const shorts = (await st.productions.list()).filter((s) => s.kind === "short" && s.parentId === epId);
    expect(shorts.length).toBeGreaterThanOrEqual(1); expect(shorts.every((s) => s.generated && s.title.includes("El despertar"))).toBe(true);
    await waitFor(async () => (await store.list(50)).filter((j) => j.kind === "short").every((j) => j.status === "done" || j.status === "failed"));
    for (const s of shorts) {
      const j = (await store.list(50)).find((x) => x.productionId === s.id)!; expect(j.status, j.error).toBe("done");
      const sv = (await st.productions.get(s.id))!; expect(sv.status).toBe("REVIEW");
      const p = await ffprobe(path.join(media(), (await st.assets.get(sv.videoAssetId!))!.path));
      expect([p.width, p.height, p.videoCodec, p.audioCodec]).toEqual([480, 854, "h264", "aac"]); expect(p.durationSec).toBeLessThanOrEqual(59);
    }
  }, 180_000);

  it("corregir UNA escena y volver a componer reutiliza la caché (solo se renderiza lo cambiado)", async () => {
    const before = new Set(await fs.readdir(path.join(cache(), "clips")));
    const cur = (await st.productions.get(epId))!;
    const edited = cur.scenes.map((s, i) => i === 6 ? { ...s, locked: true, lines: [{ text: "Texto corregido a mano en el editor." }, ...s.lines.slice(1)], narration: "" } : s);
    await st.productions.save({ ...cur, scenes: edited });
    const t0 = Date.now(); await enqueue("re", { productionId: epId, params: { mode: "rerender", voice: "espeak", musicAssetId: "mus" } });
    await finished("re"); const dt = Date.now() - t0;
    const after = await fs.readdir(path.join(cache(), "clips")); const fresh = after.filter((f) => !before.has(f));
    expect(fresh.length).toBe(1);                               // solo la escena editada se volvió a renderizar
    expect(after.length - fresh.length).toBeGreaterThanOrEqual(11);
    expect(dt).toBeLessThan(60_000);
    expect((await st.productions.get(epId))!.status).toBe("REVIEW");
  }, 180_000);

  it("vista previa de una sola escena (editor) y limpieza de la previa anterior", async () => {
    const sc = (await st.productions.get(epId))!.scenes[2];
    await enqueue("pv1", { productionId: epId, kind: "preview", params: { mode: "rerender", sceneId: sc.id, voice: "espeak" } });
    await finished("pv1");
    await enqueue("pv2", { productionId: epId, kind: "preview", params: { mode: "rerender", sceneId: sc.id, voice: "espeak" } });
    await finished("pv2");
    expect(await store.get("pv1")).toBeUndefined();            // solo se conserva la última vista previa
    const prev = (await st.assets.get((await job("pv2")).outputAssetId!))!;
    expect((await ffprobe(path.join(media(), prev.path))).durationSec).toBeCloseTo(sc.durationSec, 0);
  }, 120_000);

  it("sin guion → error claro que explica que la redacción con IA no está conectada", async () => {
    await st.productions.save({ id: "vacio", kind: "episode", number: 2, season: 1, title: "Sin guion", status: "IDEA", synopsis: "", script: "", scenes: [], assetIds: [], durationSec: 0, createdAt: "x", updatedAt: "x", generated: false, brief: "" } as never);
    await enqueue("nog", { productionId: "vacio", params: { mode: "full" } });
    await waitFor(async () => (await job("nog")).status === "failed");
    expect((await job("nog")).error).toMatch(/no tiene guion.*proveedor de IA/s);
    expect(runningFfmpegProcesses()).toBe(0);
  }, 30_000);
});

describe("pipeline sin voz (solo subtítulos) — no requiere TTS", () => {
  it("genera un vídeo válido con duraciones estimadas, tarjetas y subtítulos quemados", async () => {
    await st.productions.save({ id: "mudo", kind: "episode", number: 9, season: 1, title: "Mudo", status: "ASSETS", synopsis: "", script: "# Calle\nKAP camina bajo la lluvia.\nMIRA: Vamos.", scenes: [], assetIds: [], durationSec: 0, createdAt: "x", updatedAt: "x", generated: false, brief: "" } as never);
    await enqueue("mudo-j", { productionId: "mudo", format: "9:16", params: { mode: "full", voice: "none" } });
    await finished("mudo-j", 90_000);
    const pr = (await st.productions.get("mudo"))!; const p = await ffprobe(path.join(media(), (await st.assets.get(pr.videoAssetId!))!.path));
    expect([p.width, p.height, p.audioCodec]).toEqual([480, 854, "aac"]); expect(pr.scenes[0].durationSource).toBe("estimated");
  }, 100_000);
});
