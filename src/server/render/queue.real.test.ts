import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createSqliteRender } from "@/adapters/local/sqlite-render";
import { RenderQueue } from "./queue";
import { createExecutor } from "./executor";
import { ffprobe, runningFfmpegProcesses } from "./ffmpeg";

const roots: string[] = [];
let queues: RenderQueue[] = [];
afterEach(async () => { for (const q of queues.splice(0)) await q.shutdown(); for (const r of roots.splice(0)) await fs.rm(r, { recursive: true, force: true }); });

async function setup(over: Partial<ConstructorParameters<typeof RenderQueue>[0]> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-rq-")); roots.push(root);
  const st = createSqliteStorage(":memory:"), store = createSqliteRender(st.db);
  const q = new RenderQueue({ store, storage: st, execute: createExecutor(st, { threads: 2, concurrency: 1 }), mediaDir: path.join(root, "media"), tmpRoot: path.join(root, "tmp"),
    concurrency: 1, timeoutMs: 120_000, minFreeMb: 0, pollMs: 50, heartbeatMs: 50, ...over });
  queues.push(q);
  const add = (id: string, o: { kind?: "slate" | "episode"; format?: "16:9" | "9:16"; quality?: "480p" | "720p" | "1080p"; params?: Record<string, unknown>; productionId?: string; max?: number } = {}) =>
    store.enqueue({ id, kind: o.kind ?? "slate", format: o.format ?? "16:9", quality: o.quality ?? "480p", params: o.params ?? { durationSec: 3 }, productionId: o.productionId, maxAttempts: o.max ?? 1 }, Date.now());
  return { root, st, store, q, add };
}
const waitFor = async (fn: () => Promise<boolean>, ms = 30_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 25)); } throw new Error("timeout esperando condición"); };
const status = (t: Awaited<ReturnType<typeof setup>>, id: string) => t.store.get(id).then((j) => j?.status);

describe("cola + FFmpeg real (de principio a fin)", () => {
  it("renderiza 16:9 y 9:16 con la cola, registra assets reales y limpia temporales", async () => {
    const t = await setup(); const seen: number[] = [];
    await t.st.productions.save({ id: "p1", kind: "episode", number: 1, season: 1, title: "El despertar", status: "ASSETS", synopsis: "", script: "", scenes: [], assetIds: [], durationSec: 0, createdAt: "x", updatedAt: "x" } as never);
    await t.add("h", { productionId: "p1", format: "16:9" }); await t.add("v", { productionId: "p1", format: "9:16" });
    t.q.start();
    const poll = setInterval(async () => { const j = await t.store.get("h"); if (j?.status === "running") seen.push(j.progress); }, 30);
    await waitFor(async () => (await status(t, "h")) === "done" && (await status(t, "v")) === "done");
    clearInterval(poll);
    for (const [id, w, h] of [["h", 854, 480], ["v", 480, 854]] as const) {
      const j = (await t.store.get(id))!; const a = (await t.st.assets.get(j.outputAssetId!))!;
      const p = await ffprobe(path.join(t.root, "media", a.path));
      expect([p.width, p.height, p.videoCodec, p.audioCodec]).toEqual([w, h, "h264", "aac"]);
      expect(j.progress).toBe(1); expect(j.result?.sizeBytes).toBeGreaterThan(1000);
    }
    expect(await fs.readdir(path.join(t.root, "tmp"))).toEqual([]);
    expect(runningFfmpegProcesses()).toBe(0);
  }, 60_000);

  it("con concurrencia 1 nunca hay más de un FFmpeg a la vez", async () => {
    const t = await setup(); let max = 0;
    for (const id of ["a", "b", "c"]) await t.add(id, { params: { durationSec: 2 } });
    t.q.start(); const poll = setInterval(() => { max = Math.max(max, runningFfmpegProcesses()); }, 10);
    await waitFor(async () => (await status(t, "a")) === "done" && (await status(t, "b")) === "done" && (await status(t, "c")) === "done");
    clearInterval(poll); expect(max).toBe(1);
  }, 60_000);

  it("CANCELAR un render real en curso: para FFmpeg, borra temporales y no deja salida", async () => {
    const t = await setup();
    await t.add("long", { quality: "1080p", params: { durationSec: 600 } }); t.q.start();
    await waitFor(async () => { const j = await t.store.get("long"); return j?.status === "running" && j.progress > 0; });
    expect(runningFfmpegProcesses()).toBe(1);
    await t.q.cancel("long");
    await waitFor(async () => (await status(t, "long")) === "canceled");
    expect(runningFfmpegProcesses()).toBe(0);
    expect(await fs.readdir(path.join(t.root, "tmp"))).toEqual([]);
    expect(await fs.readdir(path.join(t.root, "media")).catch(() => [])).toEqual([]);
    expect((await t.st.assets.list()).length).toBe(0);
  }, 60_000);

  it("TIEMPO MÁXIMO real: mata FFmpeg y el trabajo falla con el motivo", async () => {
    const t = await setup({ timeoutMs: 1500 });
    await t.add("slow", { quality: "1080p", params: { durationSec: 600 }, max: 1 }); t.q.start();
    await waitFor(async () => (await status(t, "slow")) === "failed");
    expect((await t.store.get("slow"))?.error).toMatch(/Tiempo máximo/);
    expect(runningFfmpegProcesses()).toBe(0);
  }, 60_000);

  it("producción inexistente → falla sin reintentar", async () => {
    const t = await setup(); await t.add("x", { productionId: "no-existe", max: 3 }); t.q.start();
    await waitFor(async () => (await status(t, "x")) === "failed");
    const j = (await t.store.get("x"))!; expect(j.attempts).toBe(1); expect(j.error).toMatch(/ya no existe/);
  }, 20_000);

  it("tipos aún no implementados fallan con un mensaje claro", async () => {
    const t = await setup(); await t.add("ep", { kind: "episode" }); t.q.start();
    await waitFor(async () => (await status(t, "ep")) === "failed");
    expect((await t.store.get("ep"))?.error).toMatch(/subfase B/);
  }, 20_000);
});
