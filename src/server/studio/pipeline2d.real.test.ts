import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createSqliteRender } from "@/adapters/local/sqlite-render";
import { RenderQueue } from "@/server/render/queue";
import { createExecutor } from "@/server/render/executor";
import { ffprobe } from "@/server/render/ffmpeg";
import { espeakProvider } from "./voice";
import { afterRender } from "./after";
import { applyDesignChange, autoDesign } from "@/server/animation/design";
import { buildSceneStage } from "@/server/animation/stage";
import type { CharacterDesign } from "@/domain/animation";

const hasTts = await espeakProvider().available();
let root: string, st: ReturnType<typeof createSqliteStorage>, store: ReturnType<typeof createSqliteRender>, q: RenderQueue;
const media = () => path.join(root, "media"), cache = () => path.join(root, "cache");
const SCRIPT = `# Refugio
[entra: KAP izquierda]
[expresion: KAP preocupado en 2s]
KAP despierta en el refugio y mira a su alrededor, confuso.
MIRA: ¿Estás bien? Llevas horas dormido.
KAP: Creo que sí. No recuerdo nada.

# Azotea
[vfx: lluvia]
[gesto: Mira señala en 1s]
Mira sube a la azotea mientras la lluvia cae sobre la ciudad dormida.

# Ciudad vacía
La ciudad entera guarda un silencio extraño, como si todos hubieran desaparecido de golpe.

# Puente
KAP camina despacio por el puente, sin saber a dónde ir ni a quién buscar.

# Costa
El mar sigue igual que siempre, ajeno a todo lo que ha pasado en la ciudad.

# Faro
[camara: zoom 1.3 durante 2s]
KAP: Mira, hay una luz en el faro.
MIRA: Entonces no estamos solos. ¡Vamos!`;
const kapDesign: CharacterDesign = { ...autoDesign("KAP"), skin: "#f1c9a5", hairStyle: "spiky", hairColor: "#2b2a33", outfits: [{ id: "base", name: "Base", top: "#E9B949", bottom: "#2f3a52", shoes: "#1c1f27", accent: "#ffffff", accessory: "scarf" }] };

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-p2d-")); await fs.mkdir(media(), { recursive: true });
  st = createSqliteStorage(":memory:"); store = createSqliteRender(st.db);
  await st.characters.save({ id: "c1", name: "KAP", description: "", traits: [], voiceNotes: "", referenceAssetIds: [], design: applyDesignChange(undefined, kapDesign, "Diseño inicial", "t") });
  await st.characters.save({ id: "c2", name: "Mira", description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });   // SIN diseño → provisional
  await st.places.save({ id: "pl1", name: "Refugio", description: "", createdAt: "x", set: { preset: "room", timeOfDay: "night" } });
  await st.productions.save({ id: "ep1", kind: "episode", number: 1, season: 1, title: "El despertar", status: "ASSETS", synopsis: "", script: SCRIPT, scenes: [], assetIds: [], durationSec: 0, createdAt: "x", updatedAt: "x", generated: false, brief: "", cast: [], storyTime: "Día 1" } as never);
  q = new RenderQueue({ store, storage: st, mediaDir: media(), tmpRoot: path.join(root, "tmp"), concurrency: 1, timeoutMs: 280_000, minFreeMb: 0, pollMs: 50, heartbeatMs: 100,
    execute: createExecutor(st, { threads: 0, concurrency: 1, studio: { mediaDir: media(), cacheDir: cache(), voice: espeakProvider(), clipCacheMb: 500 } }),
    afterSuccess: (job, id) => afterRender(job, id, st, store, media(), 1) }).start();
});
afterAll(async () => { await q.shutdown(); await fs.rm(root, { recursive: true, force: true }); });
const finished = async (id: string, ms = 280_000) => { const t = Date.now(); for (;;) { const j = (await store.get(id))!; if (["done", "failed", "canceled"].includes(j.status)) { if (j.status !== "done") throw new Error(`${id} → ${j.status}: ${j.error}`); return j; } if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 100)); } };
const enqueue = (id: string, params: Record<string, unknown>) => store.enqueue({ id, kind: "episode", format: "16:9", quality: "480p", productionId: "ep1", params, maxAttempts: 1 }, Date.now());
const frame = async (video: string, t: number, out: string) => { spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", out]); const im = await loadImage(out); const cv = createCanvas(im.width, im.height); const c = cv.getContext("2d"); c.drawImage(im, 0, 0); return c.getImageData(0, 0, im.width, im.height).data; };
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (a.length / 4); };

describe.skipIf(!hasTts)("producción con ANIMACIÓN 2D de principio a fin (Skia + FFmpeg + voz local)", () => {
  it("«Generar episodio» en 2D: direcciones → animación, labial, cámara, montaje y revisión", async () => {
    await enqueue("gen", { mode: "full", voice: "espeak", animation: "2d", shortsCount: 0 });
    const j = await finished("gen"); expect(j.error).toBeUndefined();
    const ep = (await st.productions.get("ep1"))!;
    expect(ep.status).toBe("REVIEW"); expect(ep.scenes).toHaveLength(6);
    expect(ep.scenes[0].directions).toEqual(["entra: KAP izquierda", "expresion: KAP preocupado en 2s"]); expect(ep.scenes[5].directions).toEqual(["camara: zoom 1.3 durante 2s"]);
    expect(ep.scenes[0].characterIds.sort()).toEqual(["c1", "c2"]); expect(ep.scenes[2].characterIds).toEqual([]);   // escena solo de narración: sin personajes inventados
    const v = (await st.assets.get(ep.videoAssetId!))!; const file = path.join(media(), v.path); const p = await ffprobe(file);
    expect([p.width, p.height, p.videoCodec, p.audioCodec]).toEqual([854, 480, "h264", "aac"]);
    expect(Math.abs(p.durationSec - ep.scenes.reduce((n, s) => n + s.durationSec, 0))).toBeLessThan(0.7);
    expect((await fs.readdir(path.join(cache(), "clips"))).length).toBe(6);
    // movimiento real: KAP entra en la escena 1 (fotogramas distintos dentro de la escena) y la cámara se mueve en una escena SIN personajes
    const t1 = ep.scenes[0].durationSec, s3 = ep.scenes[0].durationSec + ep.scenes[1].durationSec;
    expect(diff(await frame(file, 0.2, path.join(root, "a.png")), await frame(file, 2.2, path.join(root, "b.png")))).toBeGreaterThan(2);
    expect(diff(await frame(file, s3 + 1.0, path.join(root, "c.png")), await frame(file, s3 + ep.scenes[2].durationSec - 1.0, path.join(root, "d.png")))).toBeGreaterThan(0.3);
    void t1;
  }, 290_000);

  it("el escenario del lugar se respeta y un personaje sin diseño se avisa como PROVISIONAL", async () => {
    const ep = (await st.productions.get("ep1"))!; const chars = await st.characters.list(), places = await st.places.list();
    const b = await buildSceneStage(ep.scenes[0], { durationSec: ep.scenes[0].durationSec, tail: 0.7, width: 854, height: 480, index: 0 }, { production: ep, characters: chars, places, assetInfo: async () => undefined });
    expect(b.stage.set).toMatchObject({ preset: "room", timeOfDay: "night" }); expect(b.provisional).toEqual(["Mira"]);
    expect(b.stage.actors.find((a) => a.name === "KAP")!.appearance.top).toBe("#E9B949");
    const sc2 = await buildSceneStage(ep.scenes[2], { durationSec: 6, tail: 0.7, width: 854, height: 480, index: 2 }, { production: ep, characters: chars, places, assetInfo: async () => undefined });
    expect(sc2.stage.actors).toEqual([]);
  });

  it("CONTINUIDAD: cambiar la ropa de KAP re-renderiza SOLO las escenas donde sale", async () => {
    const before = new Set(await fs.readdir(path.join(cache(), "clips")));
    const kap = (await st.characters.get("c1"))!;
    const withGala = { ...kap.design!, outfits: [...kap.design!.outfits, { id: "gala", name: "Gala", top: "#7a1f2b", bottom: "#222222", shoes: "#000000", accent: "#E9B949", accessory: "none" as const }] };
    await st.characters.save({ ...kap, design: applyDesignChange(kap, withGala, "", "t") });
    const ep = (await st.productions.get("ep1"))!; await st.productions.save({ ...ep, cast: [{ characterId: "c1", outfitId: "gala", note: "Ropa de gala en el episodio 1" }] });
    await enqueue("re", { mode: "rerender", voice: "espeak", animation: "2d", shortsCount: 0 }); await finished("re");
    const fresh = (await fs.readdir(path.join(cache(), "clips"))).filter((f) => !before.has(f));
    const kapScenes = ep.scenes.filter((s) => s.characterIds.includes("c1")).length;
    expect(kapScenes).toBe(3); expect(fresh.length).toBe(kapScenes);            // solo las escenas con KAP; el resto sale de la caché
    // el personaje NO cambió de cara: mismos rasgos base
    expect((await st.characters.get("c1"))!.design!.version).toBe(1);
  }, 290_000);
});
