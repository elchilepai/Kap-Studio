import { BarChart3, Coins, PlaySquare } from "lucide-react";
import { getProviders } from "@/server/providers";
import { allProductions, label, prodOptions, youtubeStatus } from "@/server/queries";
import EntityPanel from "@/components/EntityPanel";
import { Empty, PageHeader, Progress } from "@/components/ui";
import { PIPELINE, STATUS_LABEL } from "@/domain/workflow";
import { fmtDate, fmtDuration, fmtEur } from "@/lib/format";

export default async function Analitica() {
  const { storage } = getProviders();
  const [prods, costs, jobs, reviews] = await Promise.all([allProductions(), storage.costs.list(), storage.jobs.list(), storage.reviews.list()]);
  const yt = youtubeStatus();
  const published = prods.filter((p) => p.status === "PUBLISHED");
  const done = prods.filter((p) => p.durationSec > 0 && p.kind === "episode");
  const avg = done.length ? Math.round(done.reduce((n, p) => n + p.durationSec, 0) / done.length) : 0;
  const total = costs.reduce((n, c) => n + c.amountEur, 0);
  const byProd = new Map<string, number>();
  for (const c of costs) if (c.productionId) byProd.set(c.productionId, (byProd.get(c.productionId) ?? 0) + c.amountEur);
  const approvals = reviews.filter((r) => r.decision === "approve").length;
  const max = Math.max(1, ...PIPELINE.map((s) => prods.filter((p) => p.status === s).length));
  const sortedCosts = [...costs].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader title="Analítica" sub="Métricas calculadas con los datos reales de KAP Studio" />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="stat-l">Producciones</div><div className="stat">{prods.length}</div></div>
        <div className="card"><div className="stat-l">Publicados</div><div className="stat">{published.length}</div></div>
        <div className="card"><div className="stat-l">Duración media episodio</div><div className="stat">{fmtDuration(avg)}</div></div>
        <div className="card"><div className="stat-l">Aprobaciones</div><div className="stat">{approvals}</div><p className="small muted">{reviews.length} decisiones · {jobs.filter((j) => j.state === "failed").length} trabajos fallidos</p></div>
      </div>
      <div className="cols">
        <div className="stack">
          <div className="card"><h2><BarChart3 className="i" />Producciones por etapa</h2>
            {prods.length === 0 ? <Empty text="Sin datos todavía." /> : <div className="stack">{PIPELINE.map((s) => { const n = prods.filter((p) => p.status === s).length; return <div key={s}><div className="row between small"><span>{STATUS_LABEL[s]}</span><span className="muted">{n}</span></div><Progress value={Math.round((n / max) * 100)} /></div>; })}</div>}
          </div>
          <div className="card stack"><h2><Coins className="i" />Costes de producción · {fmtEur(total)}</h2>
            <EntityPanel entity="cost" items={sortedCosts} opts={{ productionId: prodOptions(prods) }} redirectTo="/analitica" emptyText="Aún no hay costes registrados. Todo lo local es gratuito; registra aquí cualquier gasto real."
              render={(d) => <><div className="t">{String(d.concept)} · {fmtEur(Number(d.amountEur))}</div><div className="s">{fmtDate(String(d.date))}{d.productionId ? ` · ${label(prods.find((p) => p.id === d.productionId)!)}` : ""}</div></>} />
          </div>
        </div>
        <div className="stack">
          <div className="card"><h2><PlaySquare className="i" />Estadísticas de YouTube</h2>
            <span className="badge err">{yt.label}</span>
            <p className="muted small" style={{ marginTop: 10 }}>No se muestran visitas ni suscriptores porque no hay conexión con YouTube. No se inventan cifras.</p></div>
          <div className="card"><h2>Coste por producción</h2>
            {byProd.size === 0 ? <Empty text="Sin costes asignados." /> : <ul className="list">{[...byProd].map(([id, v]) => { const p = prods.find((x) => x.id === id); return <li key={id} className="item"><span className="t">{p ? label(p) : "—"}</span><b>{fmtEur(v)}</b></li>; })}</ul>}</div>
        </div>
      </div>
    </>
  );
}
