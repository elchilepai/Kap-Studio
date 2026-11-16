import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, Coins, Factory, Film, Loader, PlayCircle, Smartphone, PlaySquare } from "lucide-react";
import { getProviders } from "@/server/providers";
import { allProductions, label, youtubeStatus } from "@/server/queries";
import { PageHeader, Empty, Pipeline, Progress, StatusBadge, ProdLink, ActionForm } from "@/components/ui";
import { PIPELINE, STATUS_LABEL, isOpen, progressOf } from "@/domain/workflow";
import { fmtDate, fmtEur, today, weekDays } from "@/lib/format";
import { ackJob } from "@/server/actions";

export default async function Dashboard() {
  const { storage } = getProviders();
  const [prods, jobs, costs] = await Promise.all([allProductions(), storage.jobs.list(), storage.costs.list()]);
  const open = prods.filter((p) => isOpen(p.status));
  const eps = open.filter((p) => p.kind === "episode");
  const current = eps[0], next = eps[1];
  const pendingShorts = open.filter((p) => p.kind === "short");
  const review = prods.filter((p) => p.status === "REVIEW");
  const running = jobs.filter((j) => j.state === "running");
  const errors = jobs.filter((j) => j.state === "failed" && !j.acknowledged);
  const days = weekDays(), td = today();
  const month = td.slice(0, 7);
  const costTotal = costs.reduce((a, c) => a + c.amountEur, 0);
  const costMonth = costs.filter((c) => c.date.startsWith(month)).reduce((a, c) => a + c.amountEur, 0);
  const yt = youtubeStatus();
  const byId = new Map(prods.map((p) => [p.id, p]));
  const dayName = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });

  return (
    <>
      <PageHeader title="Dashboard" sub="Canal KAP · publicación semanal · modo aprobación">
        <Link href="/episodios?nuevo=1" className="btn primary"><Film className="i" />Nuevo episodio</Link>
      </PageHeader>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Link href="/aprobacion" className="card"><div className="stat-l"><CheckCircle2 className="i" />Pendientes de aprobación</div><div className="stat">{review.length}</div></Link>
        <Link href="/produccion" className="card"><div className="stat-l"><Loader className="i" />Trabajos en ejecución</div><div className="stat">{running.length}</div></Link>
        <Link href="/shorts" className="card"><div className="stat-l"><Smartphone className="i" />Shorts pendientes</div><div className="stat">{pendingShorts.length}</div></Link>
        <Link href="/analitica" className="card"><div className="stat-l"><Coins className="i" />Coste este mes</div><div className="stat">{fmtEur(costMonth)}</div><p className="muted small">Total: {fmtEur(costTotal)}</p></Link>
      </div>

      <div className="cols">
        <div className="stack">
          <div className="card">
            <h2><PlayCircle className="i" />Episodio actual</h2>
            {current ? (
              <div className="stack">
                <div className="row between"><Link href={`/episodios/${current.id}`}><h3>{label(current)}</h3></Link><StatusBadge status={current.status} /></div>
                {current.synopsis && <p className="muted small">{current.synopsis}</p>}
                <Pipeline status={current.status} /><Progress value={progressOf(current.status)} />
              </div>
            ) : <Empty text="No hay ningún episodio en producción."><Link href="/episodios?nuevo=1" className="btn primary sm">Crear episodio</Link></Empty>}
          </div>

          <div className="card">
            <h2><Film className="i" />Próximo episodio</h2>
            {next ? <Link href={`/episodios/${next.id}`} className="item"><div><div className="t">{label(next)}</div><div className="s">Prevista: {fmtDate(next.plannedDate)}</div></div><StatusBadge status={next.status} /></Link>
              : <Empty text="Todavía no hay un siguiente episodio planificado." />}
          </div>

          <div className="card">
            <h2><CalendarDays className="i" />Calendario semanal</h2>
            <div className="week">
              {days.map((d) => (
                <div key={d} className={`day${d === td ? " today" : ""}`}>
                  <div className="d">{dayName(d)}</div>
                  {prods.filter((p) => p.plannedDate === d).map((p) => <ProdLink key={p.id} p={p}><span style={{ display: "block" }} className="cal">{p.kind === "short" ? "Short" : "Ep."} {p.number}: {p.title}</span></ProdLink>)}
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>Las fechas se fijan en cada producción (fecha de publicación prevista).</p>
          </div>

          <div className="card">
            <h2><Factory className="i" />Estado de producción</h2>
            {open.length === 0 ? <Empty text="Sin producciones abiertas." /> : (
              <div className="stack">
                {PIPELINE.map((s) => ({ s, n: open.filter((p) => p.status === s).length })).filter((x) => x.n > 0).map(({ s, n }) => (
                  <div key={s}><div className="row between small"><span>{STATUS_LABEL[s]}</span><span className="muted">{n}</span></div><Progress value={Math.round((n / open.length) * 100)} /></div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2><PlaySquare className="i" />YouTube</h2>
            <span className={`badge ${yt.connected ? "ok" : "err"}`}>{yt.label}</span>
            <p className="muted small" style={{ marginTop: 10 }}>{yt.detail}</p>
          </div>

          <div className="card">
            <h2><CheckCircle2 className="i" />Por aprobar</h2>
            {review.length === 0 ? <Empty text="Nada pendiente de revisión." /> : (
              <ul className="list">{review.map((p) => <li key={p.id}><Link href={`/aprobacion#${p.id}`} className="item"><span className="t">{label(p)}</span><span className="badge kap">Revisar</span></Link></li>)}</ul>
            )}
          </div>

          <div className="card">
            <h2><Loader className="i" />Trabajos en ejecución</h2>
            {running.length === 0 ? <Empty text="No hay trabajos en curso." /> : (
              <ul className="list">{running.map((j) => <li key={j.id}><Link href="/produccion" className="item"><div><div className="t">{j.kind}</div><div className="s">{j.productionId && byId.get(j.productionId) ? label(byId.get(j.productionId)!) : "—"}</div></div><span className="badge info">en curso</span></Link></li>)}</ul>
            )}
          </div>

          <div className="card">
            <h2><AlertTriangle className="i" />Errores de automatización</h2>
            {errors.length === 0 ? <Empty text="Sin errores." /> : (
              <ul className="list">{errors.map((j) => (
                <li key={j.id} className="item"><div style={{ minWidth: 0 }}><div className="t">{j.kind}</div><div className="s">{j.log.at(-1)?.slice(25)}</div></div>
                  <ActionForm action={ackJob} fields={{ jobId: j.id }} className="btn sm">Descartar</ActionForm></li>))}</ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
