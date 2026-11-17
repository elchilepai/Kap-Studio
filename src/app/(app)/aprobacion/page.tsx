import Link from "next/link";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { getProviders } from "@/server/providers";
import { allProductions, label } from "@/server/queries";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDuration } from "@/lib/format";
import { transitionForm } from "@/server/actions";
import SubmitButton from "@/components/SubmitButton";
import { memoryStatus } from "@/server/memory/service";
import { FindingsList } from "@/components/MemoryCard";

const DEC = { approve: ["Aprobado", "ok"], reject: ["Rechazado", "err"], changes: ["Cambios solicitados", "kap"] } as const;

export default async function Aprobacion() {
  const { storage } = getProviders();
  const [prods, reviews] = await Promise.all([allProductions(), storage.reviews.list()]);
  const queue = prods.filter((p) => p.status === "REVIEW");
  const videos = new Map((await Promise.all(queue.map(async (p) => [p.id, p.videoAssetId ? await storage.assets.get(p.videoAssetId) : undefined] as const))));
  const mem = new Map(await Promise.all(queue.filter((p) => p.kind === "episode").map(async (p) => [p.id, await memoryStatus(storage, p.id)] as const)));
  const byId = new Map(prods.map((p) => [p.id, p]));
  const history = reviews.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)).slice(0, 15);
  return (
    <>
      <PageHeader title="Centro de aprobación" sub="Nada se publica sin tu aprobación" />
      {queue.length === 0 ? <Empty text="No hay vídeos pendientes de revisión. Los vídeos llegan aquí al enviarlos a revisión desde Producción." /> : (
        <div className="grid">
          {queue.map((p) => {
            const v = videos.get(p.id);
            return (
              <div key={p.id} id={p.id} className="card stack">
                <div className="row between"><Link href={p.kind === "short" ? `/shorts/${p.id}` : `/episodios/${p.id}`}><h3>{label(p)}</h3></Link><StatusBadge status={p.status} /></div>
                {v ? <video controls playsInline preload="metadata" src={`/api/media/${v.id}`} /> : <p className="muted">Vídeo no disponible.</p>}
                <p className="small muted">⏱ {fmtDuration(p.durationSec)} · {fmtDate(p.producedAt)}</p>
                {p.synopsis && <p className="small">{p.synopsis}</p>}
                {(() => { const m = mem.get(p.id); if (!m) return null; const e = m.findings.filter((f) => f.severity === "error"), w = m.findings.filter((f) => f.severity === "warning"), n = m.findings.filter((f) => f.severity === "info");
                  return (<div className="card sub stack" style={{ gap: 6 }}><div className="row between"><b className="small">Continuidad</b><span className="row" style={{ gap: 6 }}>{e.length > 0 && <span className="badge err">{e.length} crítico(s)</span>}{w.length > 0 && <span className="badge kap">{w.length} aviso(s)</span>}{n.length > 0 && <span className="badge info">{n.length} nuevo(s)</span>}{!m.findings.length && <span className="badge ok">sin hallazgos</span>}</span></div>
                    <FindingsList findings={[...e, ...w].slice(0, 4)} /><div className="small"><Link href={`/episodios/${p.id}#memoria`} className="kap">Revisar cambios de memoria y continuidad →</Link> <span className="muted">· al aprobar podrás confirmarlos en el canon</span></div></div>); })()}
                <form action={transitionForm} className="stack">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="field"><label htmlFor={`n-${p.id}`}>Comentarios de revisión</label><textarea id={`n-${p.id}`} name="note" style={{ minHeight: 70 }} /></div>
                  <div className="row">
                    <SubmitButton className="btn ok" name="to" value="APPROVED" confirm={(mem.get(p.id)?.findings.filter((f) => f.severity === "error").length ?? 0) > 0 ? `Hay ${mem.get(p.id)!.findings.filter((f) => f.severity === "error").length} error(es) crítico(s) de continuidad en este episodio. ¿Aprobar de todos modos?` : undefined}><Check className="i" />Aprobar</SubmitButton>
                    <SubmitButton className="btn" name="to" value="SCRIPTING"><MessageSquareWarning className="i" />Pedir cambios</SubmitButton>
                    <SubmitButton className="btn danger" name="to" value="REJECTED" confirm="¿Rechazar este vídeo?"><X className="i" />Rechazar</SubmitButton>
                  </div>
                </form>
              </div>
            );
          })}
        </div>
      )}
      <h2 style={{ marginTop: 28 }}>Historial de decisiones</h2>
      {history.length === 0 ? <Empty text="Todavía no hay decisiones." /> : (
        <ul className="list">{history.map((r) => { const p = byId.get(r.productionId); const [t, k] = DEC[r.decision]; return (
          <li key={r.id} className="item"><div><div className="t">{p ? label(p) : "Producción eliminada"}</div>{r.note && <div className="s">{r.note}</div>}<div className="s">{fmtDate(r.decidedAt)}</div></div><span className={`badge ${k}`}>{t}</span></li>); })}</ul>
      )}
    </>
  );
}
