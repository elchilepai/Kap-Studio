"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock, Download, Film, Loader, Play, RotateCcw, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ui";
import { cancelRender, deleteRender, retryRender } from "@/server/render-actions";
import { RENDER_STATUS_LABEL, type RenderJob } from "@/domain/render";

type Job = Omit<RenderJob, "params" | "worker"> & { productionLabel?: string };
type Payload = { now: number; counts: { queued: number; running: number }; jobs: Job[] };

const fmtDur = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
const KIND: Record<string, string> = { slate: "Tarjeta de prueba", episode: "Episodio", short: "Short", preview: "Vista previa de escena" };

export default function RenderQueuePanel({ initial }: { initial: Payload }) {
  const [data, setData] = useState<Payload>(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);              // diferencia reloj servidor/cliente
  const [tick, setTick] = useState(0);
  const active = data.counts.queued + data.counts.running > 0;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/render/jobs", { cache: "no-store" });
        if (r.status === 401) { window.location.href = "/login"; return; }
        if (r.ok) { const j: Payload = await r.json(); if (alive) { setData(j); setOffset(j.now - Date.now()); } }
      } catch { /* red caída: se reintenta */ }
      if (alive) timer.current = setTimeout(poll, active ? 1000 : 4000);
    };
    timer.current = setTimeout(poll, 600);
    return () => { alive = false; clearTimeout(timer.current); };
  }, [active]);
  useEffect(() => { if (!active) return; const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, [active]);
  void tick;
  const now = Date.now() + offset;

  if (data.jobs.length === 0) return <div className="empty"><Film className="i" /><p>No hay trabajos de renderizado. Encola uno con el formulario.</p></div>;
  return (
    <ul className="list" style={{ gap: 12 }}>
      {data.jobs.map((j) => {
        const pct = Math.round(j.progress * 100);
        const elapsed = j.startedAt ? (j.finishedAt ?? now) - j.startedAt : 0;
        const eta = j.status === "running" && j.progress > 0.03 ? (elapsed / j.progress) * (1 - j.progress) : null;
        const badge = j.status === "done" ? "ok" : j.status === "failed" ? "err" : j.status === "running" ? "info" : j.status === "canceled" ? "" : "kap";
        const waiting = j.status === "queued" && j.notBefore > now;
        return (
          <li key={j.id} className="card stack" style={{ padding: 16 }}>
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <div className="t" style={{ fontWeight: 600 }}>{KIND[j.kind] ?? j.kind} · {j.format} · {j.quality}</div>
                <div className="small muted">{j.productionLabel ?? "Sin producción"} · intento {Math.max(j.attempts, j.status === "queued" ? j.attempts : 1)}/{j.maxAttempts}</div>
              </div>
              <span className={`badge ${badge}`}>
                {j.status === "running" && <Loader className="i" size={12} />}{j.status === "done" && <CheckCircle2 className="i" size={12} />}
                {j.status === "failed" && <AlertTriangle className="i" size={12} />}{j.status === "queued" && <Clock className="i" size={12} />}
                {waiting ? `Reintento en ${fmtDur(j.notBefore - now)}` : RENDER_STATUS_LABEL[j.status]}
              </span>
            </div>

            {(j.status === "running" || j.status === "queued" || j.status === "done") && (
              <div>
                <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                <div className="row between small muted" style={{ marginTop: 6 }}>
                  <span>{j.status === "queued" ? "Esperando turno…" : j.status === "running" && j.log ? `${j.log} · ${pct}%` : `${pct}%`}</span>
                  <span>{j.status === "running" ? `${fmtDur(elapsed)}${eta !== null ? ` · quedan ≈ ${fmtDur(eta)}` : ""}` : j.status === "done" && j.result ? `${j.result.width}×${j.result.height} · ${j.result.durationSec.toFixed(1)} s · ${(j.result.sizeBytes / 1048576).toFixed(1)} MB` : ""}</span>
                </div>
              </div>
            )}
            {j.error && <div className={`notice ${j.status === "failed" ? "err" : ""}`} role="alert" style={{ marginBottom: 0 }}><AlertTriangle className="i" /><span style={{ overflowWrap: "anywhere" }}>{j.error}</span></div>}

            {preview === j.id && j.outputAssetId && <video controls playsInline autoPlay preload="metadata" src={`/api/media/${j.outputAssetId}`} style={{ maxHeight: "60vh" }} />}

            <div className="row">
              {j.status === "done" && j.outputAssetId && (<>
                <button type="button" className="btn sm primary" onClick={() => setPreview(preview === j.id ? null : j.id)}><Play className="i" />{preview === j.id ? "Cerrar vista previa" : "Previsualizar"}</button>
                <a className="btn sm" href={`/api/media/${j.outputAssetId}`} download={`kap-${j.format.replace(":", "x")}-${j.quality}.mp4`}><Download className="i" />Descargar</a>
              </>)}
              {(j.status === "queued" || j.status === "running") && <ActionForm action={cancelRender} fields={{ id: j.id }} className="btn sm danger" confirm="¿Cancelar este render?"><Ban className="i" />Cancelar</ActionForm>}
              {(j.status === "failed" || j.status === "canceled") && <ActionForm action={retryRender} fields={{ id: j.id }} className="btn sm primary"><RotateCcw className="i" />Reintentar</ActionForm>}
              {j.status !== "running" && <ActionForm action={deleteRender} fields={{ id: j.id }} className="btn sm danger" confirm="¿Eliminar este trabajo y su vídeo?"><Trash2 className="i" />Eliminar</ActionForm>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
