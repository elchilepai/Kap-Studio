import fs from "node:fs/promises";
import path from "node:path";
import type { RenderJob, RenderResult } from "@/domain/render";
import type { RenderStore, Storage } from "@/ports";
import { CanceledError, RenderError, TimeoutError } from "./ffmpeg";
import { ensureFreeSpace, jobTmpDir, moveFile, sweepRenderTemp } from "./resources";

export type ExecContext = { signal: AbortSignal; tmpDir: string; onProgress(fraction: number, log?: string): void };
export type ExecResult = { file: string } & RenderResult;
export type Executor = (job: RenderJob, ctx: ExecContext) => Promise<ExecResult>;

export type QueueDeps = {
  store: RenderStore; storage: Storage; execute: Executor; mediaDir: string; tmpRoot: string;
  concurrency: number; timeoutMs: number; minFreeMb: number;
  /** Se llama tras registrar el vídeo y antes de marcar el trabajo como completado. Sus errores no tumban el render. */
  afterSuccess?: (job: RenderJob, assetId: string) => Promise<void>;
  workerId?: string; pollMs?: number; heartbeatMs?: number; staleMs?: number; backoffMs?: (attempt: number) => number; tempTtlMs?: number;
};

class ShutdownError extends Error { constructor() { super("Servidor detenido"); } }

/**
 * Worker de renderizado dentro del proceso de la aplicación (sin bloquear la interfaz: FFmpeg corre en procesos hijos).
 * - Concurrencia limitada (por defecto 1): nunca más de N FFmpeg a la vez.
 * - Estado en SQLite: sobrevive a reinicios; los trabajos huérfanos se recuperan por latido.
 */
export class RenderQueue {
  private active = new Map<string, AbortController>();
  private pumping = false; private again = false; private stopped = false;
  private timer?: NodeJS.Timeout; private lastSweep = 0;
  readonly workerId: string;
  private d: Required<Pick<QueueDeps, "pollMs" | "heartbeatMs" | "staleMs" | "backoffMs" | "tempTtlMs">> & QueueDeps;

  constructor(deps: QueueDeps) {
    this.workerId = deps.workerId ?? `w-${process.pid}-${crypto.randomUUID().slice(0, 6)}`;
    this.d = { pollMs: 2000, heartbeatMs: 2000, staleMs: 30_000, backoffMs: (a) => Math.min(60_000, 5_000 * 2 ** (a - 1)), tempTtlMs: 6 * 3600_000, ...deps };
  }

  start() {
    if (this.timer) return this;
    this.stopped = false;
    const tick = () => { void this.maintenance().then(() => this.pump()).catch((e) => console.error("[render] ciclo:", e)); };
    this.timer = setInterval(tick, this.d.pollMs); this.timer.unref?.(); tick();
    return this;
  }

  /** Detiene el worker: aborta los FFmpeg en curso y devuelve sus trabajos a la cola sin gastar un intento. */
  async shutdown() {
    this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = undefined;
    for (const ac of this.active.values()) ac.abort(new ShutdownError());
    while (this.active.size) await new Promise((r) => setTimeout(r, 20));
  }

  kick() { void this.pump(); }
  isActive = (id: string) => this.active.has(id);
  activeCount = () => this.active.size;

  /** Cancela un trabajo: en cola → al instante; en ejecución → aborta FFmpeg (aquí o, si lo lleva otro proceso, por latido). */
  async cancel(id: string): Promise<RenderJob["status"] | undefined> {
    const st = await this.d.store.requestCancel(id, Date.now());
    const ac = this.active.get(id); if (ac && st === "running") ac.abort(new CanceledError());
    return st;
  }

  private async maintenance() {
    const now = Date.now();
    await this.d.store.recoverStale(now, this.d.staleMs);
    if (now - this.lastSweep > 10 * 60_000) { this.lastSweep = now; await sweepRenderTemp(this.d.tmpRoot, this.isActive, this.d.tempTtlMs); }
  }

  async pump(): Promise<void> {
    if (this.pumping) { this.again = true; return; }
    this.pumping = true;
    try {
      do {
        this.again = false;
        while (!this.stopped && this.active.size < this.d.concurrency) {
          const job = await this.d.store.claimNext(this.workerId, Date.now());
          if (!job) break;
          void this.run(job);
        }
      } while (this.again && !this.stopped);
    } finally { this.pumping = false; }
  }

  private async run(job: RenderJob) {
    const { store } = this.d;
    const ac = new AbortController(); this.active.set(job.id, ac);
    const tmpDir = jobTmpDir(this.d.tmpRoot, job.id);
    const hb = setInterval(async () => {
      try { await store.heartbeat(job.id, Date.now()); if (await store.isCancelRequested(job.id)) ac.abort(new CanceledError()); } catch { /* siguiente ciclo */ }
    }, this.d.heartbeatMs);
    const timeout = setTimeout(() => ac.abort(new TimeoutError(this.d.timeoutMs)), this.d.timeoutMs);
    let lastWrite = 0;
    try {
      await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 });
      await ensureFreeSpace(this.d.tmpRoot, this.d.minFreeMb);
      const out = await this.d.execute(job, {
        signal: ac.signal, tmpDir,
        onProgress: (f, log) => { const n = Date.now(); if (n - lastWrite > 400) { lastWrite = n; void store.progress(job.id, f, n, log).catch(() => {}); } },
      });
      if (ac.signal.aborted) throw ac.signal.reason ?? new CanceledError();
      const assetId = crypto.randomUUID();
      const stored = `${assetId}.mp4`;
      await moveFile(out.file, path.join(this.d.mediaDir, stored));
      await this.d.storage.assets.save({
        id: assetId, kind: "video", path: stored, origin: "generated", license: "propio", createdAt: new Date().toISOString(),
        name: `render-${job.format.replace(":", "x")}-${job.quality}.mp4`, mime: "video/mp4", size: out.sizeBytes,
        durationSec: out.durationSec, width: out.width, height: out.height, hasAudio: true,
      });
      try { await this.d.afterSuccess?.(job, assetId); } catch (e) { console.error("[render] afterSuccess:", e); }
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); // el temporal se borra ANTES de declarar el trabajo terminado
      await store.finish(job.id, { status: "done", now: Date.now(), outputAssetId: assetId, result: { durationSec: out.durationSec, width: out.width, height: out.height, sizeBytes: out.sizeBytes } });
    } catch (e) {
      const now = Date.now();
      // El MOTIVO del aborto manda sobre el tipo de error: FFmpeg rechaza con CanceledError tanto si cancela el
      // usuario como si vence el tiempo máximo o se apaga el servidor.
      const reason = ac.signal.aborted ? ac.signal.reason : undefined;
      const fail = async (msg: string, retryable: boolean) => {
        if (retryable && job.attempts < job.maxAttempts) await store.requeue(job.id, now + this.d.backoffMs(job.attempts), `Intento ${job.attempts}/${job.maxAttempts} falló: ${msg}`);
        else await store.finish(job.id, { status: "failed", now, error: msg });
      };
      if (reason instanceof ShutdownError) await store.requeue(job.id, now, "Reiniciado por detención del servidor", true);
      else if (reason instanceof TimeoutError) await fail(reason.message, true);
      else if (reason instanceof CanceledError || e instanceof CanceledError) await store.finish(job.id, { status: "canceled", now, error: "Cancelado por el usuario" });
      else await fail((e instanceof Error ? e.message : String(e)).slice(0, 1000), e instanceof RenderError && e.retryable);
    } finally {
      clearInterval(hb); clearTimeout(timeout);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      this.active.delete(job.id);
      if (!this.stopped) this.kick();
    }
  }
}
