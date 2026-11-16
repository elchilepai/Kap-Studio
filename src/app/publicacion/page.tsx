import Link from "next/link";
import { CalendarCheck, Download, ExternalLink, Undo2 } from "lucide-react";
import { allProductions, label, youtubeStatus } from "@/server/queries";
import { ActionForm, Empty, Notice, PageHeader, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { publishForm, schedule, transitionForm } from "@/server/actions";
import { fmtDate } from "@/lib/format";

export default async function Publicacion() {
  const prods = await allProductions();
  const approved = prods.filter((p) => p.status === "APPROVED");
  const scheduled = prods.filter((p) => p.status === "SCHEDULED").sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? ""));
  const published = prods.filter((p) => p.status === "PUBLISHED").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const yt = youtubeStatus();
  return (
    <>
      <PageHeader title="Publicación" sub="Programa vídeos aprobados y regístralos como publicados" />
      <Notice><span><b>YouTube: {yt.label}.</b> {yt.detail} Descarga el paquete de cada vídeo, súbelo a YouTube Studio y regístralo aquí.</span></Notice>

      <h2>Aprobados · listos para programar</h2>
      {approved.length === 0 ? <Empty text="No hay vídeos aprobados pendientes de programar." /> : (
        <div className="grid">{approved.map((p) => (
          <div key={p.id} className="card stack"><div className="row between"><Link href={p.kind === "short" ? `/shorts/${p.id}` : `/episodios/${p.id}`}><h3>{label(p)}</h3></Link><StatusBadge status={p.status} /></div>
            <form action={schedule} className="stack"><input type="hidden" name="id" value={p.id} />
              <div className="field"><label htmlFor={`d-${p.id}`}>Fecha de publicación</label><input id={`d-${p.id}`} type="date" name="plannedDate" defaultValue={p.plannedDate} required /></div>
              <div className="row"><SubmitButton className="btn primary"><CalendarCheck className="i" />Programar</SubmitButton><a className="btn" href={`/api/export/${p.id}`}><Download className="i" />Paquete</a></div></form></div>))}</div>
      )}

      <h2 style={{ marginTop: 28 }}>Programados</h2>
      {scheduled.length === 0 ? <Empty text="Nada programado." /> : (
        <div className="grid">{scheduled.map((p) => (
          <div key={p.id} className="card stack"><div className="row between"><h3>{label(p)}</h3><span className="badge kap">{fmtDate(p.plannedDate)}</span></div>
            <form action={publishForm} className="stack"><input type="hidden" name="id" value={p.id} />
              <div className="field"><label htmlFor={`u-${p.id}`}>URL del vídeo en YouTube (opcional)</label><input id={`u-${p.id}`} type="url" name="url" placeholder="https://youtu.be/…" /></div>
              <div className="row"><SubmitButton className="btn ok">Marcar como publicado</SubmitButton><a className="btn" href={`/api/export/${p.id}`}><Download className="i" />Paquete</a>
              </div></form>
            <ActionForm action={transitionForm} fields={{ id: p.id, to: "REVIEW" }} className="btn sm"><Undo2 className="i" />Devolver a revisión</ActionForm></div>))}</div>
      )}

      <h2 style={{ marginTop: 28 }}>Publicados</h2>
      {published.length === 0 ? <Empty text="Todavía no hay vídeos publicados." /> : (
        <ul className="list">{published.map((p) => <li key={p.id} className="item"><div><div className="t">{label(p)}</div><div className="s">{fmtDate(p.publishedAt)}</div></div>
          {p.publishedUrl ? <a className="btn sm" href={p.publishedUrl} target="_blank" rel="noreferrer"><ExternalLink className="i" />Ver</a> : <span className="badge ok">Publicado</span>}</li>)}</ul>
      )}
    </>
  );
}
