import Link from "next/link";
import { Download, FileVideo, PackageCheck } from "lucide-react";
import type { Production } from "@/domain/types";
import { RENDER_STATUS_LABEL } from "@/domain/render";
import { getProviders } from "@/server/providers";
import { exportFinal } from "@/server/studio-actions";
import { canExport, exportDimensions } from "@/server/studio/export";
import SubmitButton from "./SubmitButton";
import { fmtBytes, fmtDuration } from "@/lib/format";

/**
 * Exportación definitiva: solo disponible tras la aprobación manual. Lista el vídeo revisado, las exportaciones hechas
 * (con su formato y resolución reales) y los subtítulos; todo con nombre limpio y como descarga directa.
 */
export default async function ExportCard({ p }: { p: Production }) {
  const { storage, render } = getProviders();
  const fmt = p.kind === "short" ? "9:16" : "16:9";
  const ok = canExport(p.status);
  const [jobs, assets] = await Promise.all([render.list(300), storage.assets.list()]);
  const mine = jobs.filter((j) => j.kind === "export" && j.productionId === p.id);
  const subs = ["srt", "vtt"].filter((e) => assets.some((a) => a.kind === "subtitle" && a.name === `subs-${p.id}.${e}`));
  const shorts = p.kind === "episode" ? (await storage.productions.list()).filter((x) => x.kind === "short" && x.parentId === p.id && canExport(x.status)).length : 0;
  const video = p.videoAssetId ? await storage.assets.get(p.videoAssetId) : undefined;

  return (
    <div className="card stack" id="exportar">
      <h2><PackageCheck className="i" />Exportación final · {fmt}</h2>
      {!ok ? (
        <p className="small muted">La exportación se activa cuando apruebas el {p.kind === "episode" ? "episodio" : "Short"} en <Link href="/aprobacion" className="kap">Aprobación</Link>. Antes, revisa el vídeo de la ficha: es la vista previa.</p>
      ) : (<>
        <form action={exportFinal} className="row" style={{ alignItems: "flex-end" }}>
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="_redirect" value="/render" /><input type="hidden" name="_errorTo" value={`/${p.kind === "episode" ? "episodios" : "shorts"}/${p.id}`} />
          <div className="field"><label htmlFor="ex-q">Resolución</label><select id="ex-q" name="quality" defaultValue="1080p"><option value="720p">720p</option><option value="1080p">1080p (final)</option></select></div>
          <SubmitButton className="btn primary"><FileVideo className="i" />Exportar{shorts ? ` (+ ${shorts} Short${shorts > 1 ? "s" : ""} aprobado${shorts > 1 ? "s" : ""})` : ""}</SubmitButton>
        </form>
        <p className="small muted">Se vuelve a renderizar con las escenas aprobadas y la misma voz y música de la revisión. Reutiliza la caché: a la misma resolución que la revisión apenas tarda. No cambia el estado ni el vídeo aprobado.</p>
        <ul className="list">
          {video && <li className="item"><span className="t">Vídeo revisado · {video.width}×{video.height} · {fmtDuration(Math.round(video.durationSec ?? 0))} · {fmtBytes(video.size)}</span><a className="btn sm" href={`/api/download/${p.id}?f=video`}><Download className="i" />Descargar</a></li>}
          {mine.map((j) => { const d = exportDimensions(j.format, j.quality); return (
            <li key={j.id} className="item"><span className="t">Exportación {d.width}×{d.height} · {RENDER_STATUS_LABEL[j.status]}{j.status === "running" ? ` ${Math.round(j.progress * 100)}%` : ""}{j.result ? ` · ${fmtDuration(Math.round(j.result.durationSec))} · ${fmtBytes(j.result.sizeBytes)}` : ""}</span>
              {j.status === "done" ? <a className="btn sm primary" href={`/api/download/${p.id}?f=export&job=${j.id}`}><Download className="i" />Descargar</a> : j.error ? <span className="small" style={{ color: "var(--err)" }}>{j.error}</span> : null}</li>); })}
          {subs.map((e) => <li key={e} className="item"><span className="t">Subtítulos .{e}</span><a className="btn sm" href={`/api/download/${p.id}?f=${e}`}><Download className="i" />Descargar</a></li>)}
        </ul>
      </>)}
    </div>
  );
}
