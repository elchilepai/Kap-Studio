import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, Plus, Trash2, Upload } from "lucide-react";
import { getProviders } from "@/server/providers";
import { allProductions, episodes, label } from "@/server/queries";
import { EntityForm } from "./EntityPanel";
import SubmitButton from "./SubmitButton";
import { Notice, PageHeader, Pipeline, StatusBadge, Empty } from "./ui";
import { deleteEntity, setParent } from "@/server/actions";
import { fmtBytes, fmtDate, fmtDuration } from "@/lib/format";

export default async function ProductionDetail({ id, kind, error }: { id: string; kind: "episode" | "short"; error?: string }) {
  const { storage } = getProviders();
  const p = await storage.productions.get(id);
  if (!p || p.kind !== kind) notFound();
  const all = await allProductions();
  const related = all.filter((x) => x.parentId === p.id);
  const parent = p.parentId ? all.find((x) => x.id === p.parentId) : undefined;
  const video = p.videoAssetId ? await storage.assets.get(p.videoAssetId) : undefined;
  const base = kind === "episode" ? "/episodios" : "/shorts";
  const here = `${base}/${p.id}`;
  const eps = await episodes();
  const nextShort = Math.max(0, ...all.filter((x) => x.kind === "short").map((s) => s.number)) + 1;

  return (
    <>
      <p className="small"><Link href={base} className="muted">← {kind === "episode" ? "Episodios" : "Shorts"}</Link></p>
      <PageHeader title={label(p)} sub={`Temporada ${p.season} · ${fmtDuration(p.durationSec)} · producido ${fmtDate(p.producedAt)}`}>
        <StatusBadge status={p.status} />
        <a className="btn sm" href={`/api/export/${p.id}`}><Download className="i" />Paquete</a>
      </PageHeader>
      {error && <Notice kind="err">{error}</Notice>}
      <div className="card" style={{ marginBottom: 16 }}>
        <Pipeline status={p.status} />
        <p className="small muted" style={{ marginTop: 10 }}>Las etapas se gestionan en <Link href="/produccion" className="kap">Producción</Link>.</p>
      </div>

      <div className="cols">
        <div className="stack">
          <div className="card"><h2>Datos</h2>
            <EntityForm entity="production" doc={p as never} hidden={{ _kind: kind }} redirectTo={here} />
            {kind === "short" && (
              <form action={setParent} className="stack" style={{ marginTop: 16 }}>
                <input type="hidden" name="id" value={p.id} />
                <div className="field"><label htmlFor="parentId">Episodio asociado</label>
                  <select id="parentId" name="parentId" defaultValue={p.parentId ?? ""}><option value="">— Ninguno —</option>{eps.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}</select></div>
                <div className="row"><SubmitButton className="btn sm">Cambiar episodio asociado</SubmitButton></div>
              </form>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card stack"><h2>Vídeo</h2>
            {video ? (<>
              <video controls playsInline preload="metadata" src={`/api/media/${video.id}`} />
              <p className="small muted">{video.name} · {fmtBytes(video.size)}</p>
            </>) : <Empty text="Aún no hay vídeo adjunto. Se necesita para enviar a revisión." />}
            <form action="/api/upload" method="post" encType="multipart/form-data" className="stack">
              <input type="hidden" name="redirect" value={here} /><input type="hidden" name="attachTo" value={p.id} />
              <div className="field"><label htmlFor="file">{video ? "Reemplazar vídeo" : "Subir vídeo"}</label><input id="file" type="file" name="file" accept="video/*" required /></div>
              <div className="row"><SubmitButton className="btn primary"><Upload className="i" />Subir y adjuntar</SubmitButton></div>
            </form>
          </div>

          {kind === "episode" && (
            <div className="card stack"><h2>Shorts asociados</h2>
              {related.length === 0 ? <Empty text="Este episodio aún no tiene Shorts." /> :
                <ul className="list">{related.map((s) => <li key={s.id}><Link href={`/shorts/${s.id}`} className="item"><span className="t">{label(s)}</span><StatusBadge status={s.status} /></Link></li>)}</ul>}
              <details className="acc"><summary><Plus className="i kap" />Crear Short de este episodio<ChevronRight className="i chev" /></summary>
                <div className="body"><EntityForm entity="production" doc={{ id: "", season: p.season, number: nextShort, durationSec: 45 } as never} hidden={{ _kind: "short", parentId: p.id }} redirectTo={here} submit="Crear Short" /></div></details>
            </div>
          )}
          {parent && <div className="card"><h2>Episodio</h2><Link className="item" href={`/episodios/${parent.id}`}><span className="t">{label(parent)}</span><StatusBadge status={parent.status} /></Link></div>}

          <form action={deleteEntity.bind(null, "production", p.id, base)}>
            <SubmitButton className="btn danger" confirm="¿Eliminar definitivamente esta producción y su vídeo?"><Trash2 className="i" />Eliminar</SubmitButton>
          </form>
        </div>
      </div>
    </>
  );
}
