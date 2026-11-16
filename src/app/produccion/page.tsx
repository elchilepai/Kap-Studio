import Link from "next/link";
import { ArrowLeft, ArrowRight, Ban, Check, Play, RotateCcw, X } from "lucide-react";
import { getProviders } from "@/server/providers";
import { allProductions, label } from "@/server/queries";
import { ActionForm, Empty, PageHeader, Pipeline, Progress, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { PIPELINE, STATUS_LABEL, allowedNext, isOpen, progressOf } from "@/domain/workflow";
import { finishJob, startJob, transitionForm } from "@/server/actions";
import type { Job, Production, ProductionStatus } from "@/domain/types";

// Las etapas REVIEW→APPROVED y SCHEDULED→PUBLISHED se gestionan en Aprobación y Publicación.
const MANAGED_ELSEWHERE: ProductionStatus[] = ["REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED"];

function Card({ p, jobs }: { p: Production; jobs: Job[] }) {
  const running = jobs.find((j) => j.state === "running");
  const failed = jobs.filter((j) => j.state === "failed" && !j.acknowledged);
  const here = PIPELINE.indexOf(p.status);
  const moves = allowedNext(p.status);
  const elsewhere = MANAGED_ELSEWHERE.includes(p.status);
  const blocked = (to: ProductionStatus) => to === "REVIEW" && !p.videoAssetId ? "Falta adjuntar un vídeo" : undefined;
  return (
    <div className="card stack" id={p.id}>
      <div className="row between"><Link href={p.kind === "short" ? `/shorts/${p.id}` : `/episodios/${p.id}`}><h3>{label(p)}</h3></Link><StatusBadge status={p.status} /></div>
      <Pipeline status={p.status} /><Progress value={progressOf(p.status)} />

      {running ? (
        <div className="card sub stack">
          <div className="row between"><span className="small"><b>Tarea en curso:</b> {running.kind}</span><span className="badge info">en curso</span></div>
          <form action={finishJob} className="stack">
            <input type="hidden" name="jobId" value={running.id} />
            <div className="field"><label htmlFor={`m-${running.id}`}>Nota (opcional; obligatoria si falla)</label><input id={`m-${running.id}`} name="message" /></div>
            <div className="row">
              <SubmitButton className="btn ok sm"><Check className="i" />Completar</SubmitButton>
              <button className="btn danger sm" name="outcome" value="failed" type="submit"><X className="i" />Marcar fallo</button>
            </div>
          </form>
        </div>
      ) : !elsewhere && p.status !== "REJECTED" && (
        <div><ActionForm action={startJob} fields={{ id: p.id }} className="btn sm"><Play className="i" />Iniciar tarea de {STATUS_LABEL[p.status].toLowerCase()}</ActionForm></div>
      )}
      {failed.map((j) => <p key={j.id} className="small" style={{ color: "var(--err)" }}>⚠ {j.kind}: {j.log.at(-1)?.slice(25)}</p>)}

      <div className="row">
        {elsewhere && p.status === "REVIEW" && <Link className="btn primary sm" href={`/aprobacion#${p.id}`}>Revisar en Centro de aprobación</Link>}
        {elsewhere && p.status !== "REVIEW" && <Link className="btn sm" href="/publicacion">Gestionar en Publicación</Link>}
        {!elsewhere && moves.map((to) => {
          const back = PIPELINE.indexOf(to) >= 0 && PIPELINE.indexOf(to) < here;
          const reason = blocked(to);
          if (to === "REJECTED") return <ActionForm key={to} action={transitionForm} fields={{ id: p.id, to }} className="btn danger sm" confirm="¿Descartar esta producción?"><Ban className="i" />Descartar</ActionForm>;
          if (to === "IDEA") return <ActionForm key={to} action={transitionForm} fields={{ id: p.id, to }} className="btn sm"><RotateCcw className="i" />Reabrir</ActionForm>;
          return reason ? <span key={to} className="small muted">{reason} → <Link className="kap" href={p.kind === "short" ? `/shorts/${p.id}` : `/episodios/${p.id}`}>subir</Link></span>
            : <ActionForm key={to} action={transitionForm} fields={{ id: p.id, to }} className={`btn sm${back ? "" : " primary"}`}>
              {back ? <><ArrowLeft className="i" />Volver a {STATUS_LABEL[to]}</> : <>Avanzar a {STATUS_LABEL[to]}<ArrowRight className="i" /></>}</ActionForm>;
        })}
      </div>
    </div>
  );
}

export default async function Produccion() {
  const { storage } = getProviders();
  const [prods, jobs] = await Promise.all([allProductions(), storage.jobs.list()]);
  const open = prods.filter((p) => isOpen(p.status)), closed = prods.filter((p) => !isOpen(p.status));
  const byProd = (id: string) => jobs.filter((j) => j.productionId === id);
  return (
    <>
      <PageHeader title="Producción" sub="Fases de fabricación de cada vídeo y su progreso" />
      {open.length === 0 ? <Empty text="No hay producciones abiertas. Crea un episodio o un Short para empezar."><Link href="/episodios?nuevo=1" className="btn primary sm">Nuevo episodio</Link></Empty>
        : <div className="grid">{open.map((p) => <Card key={p.id} p={p} jobs={byProd(p.id)} />)}</div>}
      {closed.length > 0 && (<><h2 style={{ marginTop: 28 }}>Cerradas</h2><div className="grid">{closed.map((p) => <Card key={p.id} p={p} jobs={byProd(p.id)} />)}</div></>)}
    </>
  );
}
