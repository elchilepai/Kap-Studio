import type { DatabaseSync } from "node:sqlite";
import type { RenderJob, RenderStatus } from "@/domain/render";
import type { RenderStore } from "@/ports";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? undefined : Number(v));
const str = (v: unknown) => (v == null ? undefined : String(v));

const toJob = (r: Row): RenderJob => ({
  id: String(r.id), productionId: str(r.production_id), kind: r.kind as RenderJob["kind"], format: r.format as RenderJob["format"],
  quality: r.quality as RenderJob["quality"], params: JSON.parse(String(r.params ?? "{}")), status: r.status as RenderStatus,
  progress: Number(r.progress), attempts: Number(r.attempts), maxAttempts: Number(r.max_attempts), error: str(r.error), log: str(r.log),
  outputAssetId: str(r.output_asset_id), result: r.result ? JSON.parse(String(r.result)) : undefined, createdAt: Number(r.created_at),
  startedAt: num(r.started_at), finishedAt: num(r.finished_at), notBefore: Number(r.not_before), cancelRequested: Number(r.cancel_requested) === 1,
  worker: str(r.worker), heartbeat: num(r.heartbeat),
});

export function createSqliteRender(db: DatabaseSync): RenderStore {
  const get = (id: string) => { const r = db.prepare("SELECT * FROM render_jobs WHERE id = ?").get(id) as Row | undefined; return r ? toJob(r) : undefined; };
  return {
    async enqueue(j, now) {
      db.prepare(`INSERT INTO render_jobs (id, production_id, kind, format, quality, params, status, max_attempts, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`).run(j.id, j.productionId ?? null, j.kind, j.format, j.quality, JSON.stringify(j.params), j.maxAttempts, now);
      return get(j.id)!;
    },
    async get(id) { return get(id); },
    async list(limit = 50) { return (db.prepare("SELECT * FROM render_jobs ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]).map(toJob); },

    async claimNext(worker, now) {
      // Atómico: una sola sentencia selecciona y marca; dos procesos nunca reciben el mismo trabajo.
      const r = db.prepare(`UPDATE render_jobs SET status='running', attempts=attempts+1, started_at=?, heartbeat=?, worker=?, progress=0, finished_at=NULL
        WHERE id = (SELECT id FROM render_jobs WHERE status='queued' AND not_before <= ? ORDER BY created_at LIMIT 1) RETURNING *`).get(now, now, worker, now) as Row | undefined;
      return r ? toJob(r) : undefined;
    },
    async progress(id, f, now, log) {
      db.prepare("UPDATE render_jobs SET progress = ?, heartbeat = ?, log = COALESCE(?, log) WHERE id = ? AND status = 'running'").run(Math.max(0, Math.min(1, f)), now, log ?? null, id);
    },
    async heartbeat(id, now) { db.prepare("UPDATE render_jobs SET heartbeat = ? WHERE id = ? AND status = 'running'").run(now, id); },
    async finish(id, r) {
      db.prepare(`UPDATE render_jobs SET status = ?, finished_at = ?, error = ?, output_asset_id = COALESCE(?, output_asset_id), result = ?,
        progress = CASE WHEN ? = 'done' THEN 1 ELSE progress END, worker = NULL WHERE id = ?`)
        .run(r.status, r.now, r.error ?? null, r.outputAssetId ?? null, r.result ? JSON.stringify(r.result) : null, r.status, id);
    },
    async requeue(id, notBefore, error, refund) {
      db.prepare(`UPDATE render_jobs SET status='queued', not_before=?, error=?, worker=NULL, progress=0, cancel_requested=0,
        attempts = CASE WHEN ? THEN MAX(0, attempts-1) ELSE attempts END WHERE id = ?`).run(notBefore, error ?? null, refund ? 1 : 0, id);
    },
    async requestCancel(id, now) {
      const j = get(id); if (!j) return undefined;
      if (j.status === "queued") { db.prepare("UPDATE render_jobs SET status='canceled', finished_at=?, error='Cancelado antes de empezar' WHERE id=? AND status='queued'").run(now, id); return "canceled"; }
      if (j.status === "running") { db.prepare("UPDATE render_jobs SET cancel_requested=1 WHERE id=? AND status='running'").run(id); return "running"; }
      return j.status;
    },
    async isCancelRequested(id) { const r = db.prepare("SELECT cancel_requested c FROM render_jobs WHERE id=?").get(id) as Row | undefined; return Number(r?.c) === 1; },
    async retry(id) {
      return Number(db.prepare(`UPDATE render_jobs SET status='queued', attempts=0, error=NULL, progress=0, not_before=0, cancel_requested=0,
        started_at=NULL, finished_at=NULL, worker=NULL WHERE id=? AND status IN ('failed','canceled')`).run(id).changes) > 0;
    },
    async remove(id) {
      const j = get(id); if (!j || j.status === "running") return undefined;
      db.prepare("DELETE FROM render_jobs WHERE id=?").run(id); return j;
    },
    async recoverStale(now, staleMs) {
      const stale = db.prepare("SELECT id, attempts, max_attempts FROM render_jobs WHERE status='running' AND (heartbeat IS NULL OR heartbeat < ?)").all(now - staleMs) as Row[];
      for (const r of stale) {
        if (Number(r.attempts) >= Number(r.max_attempts))
          db.prepare("UPDATE render_jobs SET status='failed', finished_at=?, error='Interrumpido (el servidor se detuvo durante el render)', worker=NULL WHERE id=?").run(now, String(r.id));
        else db.prepare("UPDATE render_jobs SET status='queued', error='Reintento tras interrupción del servidor', worker=NULL, progress=0 WHERE id=?").run(String(r.id));
      }
      return stale.length;
    },
    async countActive() {
      const rows = db.prepare("SELECT status, COUNT(*) n FROM render_jobs WHERE status IN ('queued','running') GROUP BY status").all() as Row[];
      const c = { queued: 0, running: 0 }; for (const r of rows) c[r.status as "queued" | "running"] = Number(r.n); return c;
    },
  };
}
