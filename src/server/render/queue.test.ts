import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createSqliteRender } from "@/adapters/local/sqlite-render";
import { RenderQueue, type Executor } from "./queue";
import { CanceledError, RenderError } from "./ffmpeg";
import { sweepRenderTemp } from "./resources";

const roots: string[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await fs.rm(r, { recursive: true, force: true }); });

async function setup(execute: Executor, over: Partial<ConstructorParameters<typeof RenderQueue>[0]> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-q-")); roots.push(root);
  const st = createSqliteStorage(":memory:"), store = createSqliteRender(st.db);
  const q = new RenderQueue({ store, storage: st, execute, mediaDir: path.join(root, "media"), tmpRoot: path.join(root, "tmp"), concurrency: 1, timeoutMs: 60_000, minFreeMb: 0,
    pollMs: 30, heartbeatMs: 20, staleMs: 200, backoffMs: () => 10, ...over });
  const add = (id: string, max = 2) => store.enqueue({ id, kind: "slate", format: "16:9", quality: "480p", params: {}, maxAttempts: max }, Date.now());
  return { root, st, store, q, add };
}
const waitFor = async (fn: () => Promise<boolean>, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 15)); } throw new Error("timeout esperando condición"); };
const okFile = (root: string) => async (): Promise<string> => { const f = path.join(root, "out-" + Math.random() + ".mp4"); await fs.writeFile(f, "x"); return f; };

describe("cola de renderizado", () => {
  it("completa un trabajo, registra el asset y limpia el temporal", async () => {
    let tmpSeen = "";
    const t = await setup(async (job, ctx) => { tmpSeen = ctx.tmpDir; ctx.onProgress(0.5); const f = path.join(ctx.tmpDir, "o.mp4"); await fs.writeFile(f, "video"); return { file: f, durationSec: 5, width: 854, height: 480, sizeBytes: 5 }; });
    await t.add("a"); t.q.start();
    await waitFor(async () => (await t.store.get("a"))?.status === "done");
    const j = (await t.store.get("a"))!;
    expect(j.progress).toBe(1); expect(j.attempts).toBe(1); expect(j.result?.width).toBe(854);
    const asset = await t.st.assets.get(j.outputAssetId!); expect(asset?.origin).toBe("generated"); expect(asset?.durationSec).toBe(5);
    await fs.access(path.join(t.root, "media", asset!.path));
    await expect(fs.access(tmpSeen)).rejects.toThrow(); // temporal eliminado
    await t.q.shutdown();
  });

  it("respeta la concurrencia: nunca más de N a la vez, y procesa todos", async () => {
    let cur = 0, max = 0, done = 0;
    const t = await setup(async (_j, ctx) => { cur++; max = Math.max(max, cur); await new Promise((r) => setTimeout(r, 80)); cur--; done++; const f = path.join(ctx.tmpDir, "o.mp4"); await fs.writeFile(f, "v"); return { file: f, durationSec: 1, width: 2, height: 2, sizeBytes: 1 }; }, { concurrency: 2 });
    for (const id of ["a", "b", "c", "d", "e"]) await t.add(id);
    t.q.start(); await waitFor(async () => done === 5);
    expect(max).toBe(2);
    await t.q.shutdown();
  });

  it("cancela un trabajo EN EJECUCIÓN (aborta el ejecutor) y uno EN COLA", async () => {
    let aborted = false;
    const t = await setup(async (_j, ctx) => new Promise((_res, rej) => { ctx.signal.addEventListener("abort", () => { aborted = true; rej(new CanceledError()); }); }));
    await t.add("run"); await t.add("wait"); t.q.start();
    await waitFor(async () => (await t.store.get("run"))?.status === "running");
    expect(await t.q.cancel("wait")).toBe("canceled");
    expect((await t.store.get("wait"))?.status).toBe("canceled");
    expect(await t.q.cancel("run")).toBe("running");
    await waitFor(async () => (await t.store.get("run"))?.status === "canceled");
    expect(aborted).toBe(true);
    await t.q.shutdown();
  });

  it("cancelación por latido (la pide otro proceso vía base de datos)", async () => {
    const t = await setup(async (_j, ctx) => new Promise((_r, rej) => { ctx.signal.addEventListener("abort", () => rej(new CanceledError())); }));
    await t.add("x"); t.q.start(); await waitFor(async () => (await t.store.get("x"))?.status === "running");
    await t.store.requestCancel("x", Date.now());           // sin pasar por q.cancel()
    await waitFor(async () => (await t.store.get("x"))?.status === "canceled");
    await t.q.shutdown();
  });

  it("reintenta fallos transitorios hasta el máximo y luego falla con el motivo", async () => {
    let n = 0;
    const t = await setup(async () => { n++; throw new RenderError("memoria agotada", true); });
    await t.add("r", 3); t.q.start();
    await waitFor(async () => (await t.store.get("r"))?.status === "failed");
    expect(n).toBe(3); const j = (await t.store.get("r"))!; expect(j.attempts).toBe(3); expect(j.error).toContain("memoria agotada");
    await t.q.shutdown();
  });

  it("conserva el motivo del intento fallido mientras corre el siguiente y lo borra al completar", async () => {
    let n = 0, seen: string | undefined;
    const t = await setup(async (job, ctx) => {
      n++; if (n === 1) throw new RenderError("memoria agotada", true);
      seen = (await t.store.get(job.id))?.error;                 // el 2º intento ya está «running»
      const f = path.join(ctx.tmpDir, "o.mp4"); await fs.writeFile(f, "v"); return { file: f, durationSec: 1, width: 2, height: 2, sizeBytes: 1 };
    });
    await t.add("k", 2); t.q.start(); await waitFor(async () => (await t.store.get("k"))?.status === "done");
    expect(seen).toMatch(/Intento 1\/2 falló: memoria agotada/);
    expect((await t.store.get("k"))?.error).toBeUndefined();
    await t.q.shutdown();
  });

  it("un fallo determinista NO se reintenta", async () => {
    let n = 0; const t = await setup(async () => { n++; throw new RenderError("No such file", false); });
    await t.add("d", 5); t.q.start(); await waitFor(async () => (await t.store.get("d"))?.status === "failed");
    expect(n).toBe(1); await t.q.shutdown();
  });

  it("un error inesperado (no RenderError) falla sin reintentar", async () => {
    let n = 0; const t = await setup(async () => { n++; throw new TypeError("bug"); });
    await t.add("b", 4); t.q.start(); await waitFor(async () => (await t.store.get("b"))?.status === "failed"); expect(n).toBe(1); await t.q.shutdown();
  });

  it("tiempo máximo: aborta y reintenta/falla", async () => {
    const t = await setup(async (_j, ctx) => new Promise((_r, rej) => { ctx.signal.addEventListener("abort", () => rej(new CanceledError())); }), { timeoutMs: 60 });
    await t.add("t", 1); t.q.start(); await waitFor(async () => (await t.store.get("t"))?.status === "failed");
    expect((await t.store.get("t"))?.error).toMatch(/Tiempo máximo/);
    await t.q.shutdown();
  });

  it("reintento manual de un trabajo fallido/cancelado", async () => {
    let fail = true;
    const t = await setup(async (_j, ctx) => { if (fail) throw new RenderError("x", false); const f = path.join(ctx.tmpDir, "o.mp4"); await fs.writeFile(f, "v"); return { file: f, durationSec: 1, width: 2, height: 2, sizeBytes: 1 }; });
    await t.add("m"); t.q.start(); await waitFor(async () => (await t.store.get("m"))?.status === "failed");
    fail = false; expect(await t.store.retry("m")).toBe(true); t.q.kick();
    await waitFor(async () => (await t.store.get("m"))?.status === "done");
    expect(await t.store.retry("m")).toBe(false); // no se puede reintentar uno completado
    await t.q.shutdown();
  });

  it("recupera trabajos huérfanos de un proceso caído (sin latido) y los reejecuta", async () => {
    const t = await setup(async (_j, ctx) => { const f = path.join(ctx.tmpDir, "o.mp4"); await fs.writeFile(f, "v"); return { file: f, durationSec: 1, width: 2, height: 2, sizeBytes: 1 }; });
    await t.add("orf"); const claimed = await t.store.claimNext("proceso-muerto", Date.now() - 10_000);
    expect(claimed?.status).toBe("running");
    t.q.start(); await waitFor(async () => (await t.store.get("orf"))?.status === "done");
    // y si ya agotó intentos → falla (no bucle infinito)
    await t.add("agot", 1); await t.store.claimNext("muerto2", Date.now() - 10_000);
    expect(await t.store.recoverStale(Date.now(), 100)).toBe(1);
    expect((await t.store.get("agot"))?.status).toBe("failed");
    await t.q.shutdown();
  });

  it("claimNext es atómico: dos 'procesos' nunca reciben el mismo trabajo", async () => {
    const t = await setup(async () => { throw new Error("no se usa"); });
    await t.add("u1"); await t.add("u2");
    const r = await Promise.all([t.store.claimNext("A", Date.now()), t.store.claimNext("B", Date.now()), t.store.claimNext("C", Date.now())]);
    expect(r.filter(Boolean).map((j) => j!.id).sort()).toEqual(["u1", "u2"]);
  });

  it("shutdown devuelve el trabajo a la cola SIN gastar un intento", async () => {
    const t = await setup(async (_j, ctx) => new Promise((_r, rej) => { ctx.signal.addEventListener("abort", () => rej(ctx.signal.reason)); }));
    await t.add("s"); t.q.start(); await waitFor(async () => (await t.store.get("s"))?.status === "running");
    await t.q.shutdown();
    const j = (await t.store.get("s"))!; expect(j.status).toBe("queued"); expect(j.attempts).toBe(0);
  });

  it("falla pronto si no hay espacio en disco", async () => {
    const t = await setup(async () => { throw new Error("no debería ejecutarse"); }, { minFreeMb: 1e12 });
    await t.add("disk"); t.q.start(); await waitFor(async () => (await t.store.get("disk"))?.status === "failed");
    expect((await t.store.get("disk"))?.error).toMatch(/Espacio en disco insuficiente/); await t.q.shutdown();
  });

  it("no se puede eliminar un trabajo en ejecución", async () => {
    const t = await setup(async (_j, ctx) => new Promise((_r, rej) => { ctx.signal.addEventListener("abort", () => rej(new CanceledError())); }));
    await t.add("e"); t.q.start(); await waitFor(async () => (await t.store.get("e"))?.status === "running");
    expect(await t.store.remove("e")).toBeUndefined(); await t.q.cancel("e"); await waitFor(async () => (await t.store.get("e"))?.status === "canceled");
    expect((await t.store.remove("e"))?.id).toBe("e"); await t.q.shutdown();
  });
});

describe("limpieza de temporales", () => {
  it("borra carpetas huérfanas antiguas y respeta las activas y las recientes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-s-")); roots.push(root);
    for (const n of ["render-viejo", "render-activo", "render-nuevo", "otra-cosa"]) await fs.mkdir(path.join(root, n));
    const old = new Date(Date.now() - 10 * 3600_000);
    for (const n of ["render-viejo", "render-activo", "otra-cosa"]) await fs.utimes(path.join(root, n), old, old);
    expect(await sweepRenderTemp(root, (id) => id === "activo", 3600_000)).toBe(1);
    expect((await fs.readdir(root)).sort()).toEqual(["otra-cosa", "render-activo", "render-nuevo"]);
  });
});
