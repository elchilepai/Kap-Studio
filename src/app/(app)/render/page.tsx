import { CheckCircle2, Cpu, PlayCircle, XCircle } from "lucide-react";
import { getProviders } from "@/server/providers";
import { env } from "@/server/env";
import { getCapabilities } from "@/server/render/ffmpeg";
import { getRenderQueue } from "@/server/render";
import { allProductions, label } from "@/server/queries";
import { PageHeader, Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { enqueueRender } from "@/server/render-actions";
import RenderQueuePanel from "./RenderQueuePanel";
import { describeCapabilities } from "@/server/studio/capabilities";

export const metadata = { title: "Renderizador" };

const Cap = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span className={`badge ${ok ? "ok" : "err"}`}>{ok ? <CheckCircle2 className="i" size={12} /> : <XCircle className="i" size={12} />}{children}</span>
);

export default async function RenderPage() {
  getRenderQueue();
  const { render } = getProviders();
  const [cap, prods, jobs, counts, rows] = await Promise.all([getCapabilities(), allProductions(), render.list(60), render.countActive(), describeCapabilities()]);
  const AREA: Record<string, string> = { guion: "Guion", voz: "Voz", imagen: "Imagen", musica: "Música", video: "Vídeo" };
  const e = env();
  return (
    <>
      <PageHeader title="Renderizador" sub="Motor FFmpeg local · MP4 H.264 + AAC · cola persistente" />
      {!cap.ok && <Notice kind="err">El motor no está disponible: {cap.problems.join("; ")}</Notice>}
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card stack"><h2><Cpu className="i" />Motor</h2>
          <div className="row"><Cap ok={!!cap.version}>FFmpeg {cap.version ?? "no encontrado"}</Cap><Cap ok={cap.h264}>H.264</Cap><Cap ok={cap.aac}>AAC</Cap>
            <Cap ok={cap.filters.subtitles}>Subtítulos</Cap><Cap ok={cap.filters.xfade}>Transiciones</Cap><Cap ok={cap.filters.amix}>Mezcla de audio</Cap></div>
          <p className="small muted">Fuente: {cap.font ?? "ninguna"} · Concurrencia: {e.KAP_RENDER_CONCURRENCY} · Tiempo máx.: {e.KAP_RENDER_TIMEOUT_MIN} min · Reintentos: {e.KAP_RENDER_MAX_ATTEMPTS}</p>
          {cap.problems.length > 0 && <ul className="small" style={{ color: "var(--err)", margin: 0, paddingLeft: 18 }}>{cap.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
        <div className="card stack"><h2><PlayCircle className="i" />Nuevo render</h2>
          <p className="small muted">Prueba del motor con una tarjeta de título. Para producir un episodio completo usa «Generar episodio» en su ficha.</p>
          <form action={enqueueRender} className="stack">
            <div className="form">
              <div className="field"><label htmlFor="rf">Formato</label><select id="rf" name="format" defaultValue="16:9"><option value="16:9">16:9 · YouTube</option><option value="9:16">9:16 · Shorts / TikTok</option></select></div>
              <div className="field"><label htmlFor="rq">Resolución</label><select id="rq" name="quality" defaultValue="720p"><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></div>
              <div className="field"><label htmlFor="rd">Duración (s)</label><input id="rd" name="durationSec" type="number" min={1} max={120} defaultValue={8} inputMode="numeric" /></div>
              <div className="field"><label htmlFor="rp">Producción</label><select id="rp" name="productionId" defaultValue=""><option value="">— Ninguna (prueba) —</option>{prods.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</select></div>
            </div>
            <div className="row"><SubmitButton className="btn primary">Añadir a la cola</SubmitButton></div>
          </form>
        </div>
      </div>
      <details className="acc" style={{ marginBottom: 16 }}>
        <summary><Cpu className="i kap" />Capacidades de producción automática: qué está conectado y qué no</summary>
        <div className="body"><ul className="list">{rows.map((r) => (
          <li key={r.area + r.id} className="item"><div style={{ minWidth: 0 }}><div className="t">{AREA[r.area]} · {r.label}</div><div className="s">{r.detail}</div></div>
            <span className={`badge ${r.available ? "ok" : ""}`}>{r.available ? (r.free ? "Disponible · gratis" : "Disponible") : "No conectado"}</span></li>))}</ul>
          <p className="small muted" style={{ marginTop: 10 }}>Lo marcado «No conectado» no se simula: el pipeline funciona con lo disponible y deja los puertos listos para conectar proveedores gratuitos de IA, voz o imagen.</p></div>
      </details>
      <h2>Cola de trabajos</h2>
      <RenderQueuePanel initial={{ now: Date.now(), counts, jobs: jobs.map((j) => ({ ...j, params: undefined, worker: undefined, productionLabel: prods.find((p) => p.id === j.productionId) ? label(prods.find((p) => p.id === j.productionId)!) : undefined })) as never }} />
    </>
  );
}
