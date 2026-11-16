import { FileAudio, FileImage, FileText, FileVideo, Trash2, Upload } from "lucide-react";
import { getProviders } from "@/server/providers";
import { Empty, Notice, PageHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { deleteAsset } from "@/server/actions";
import { fmtBytes, fmtDate } from "@/lib/format";
import Link from "next/link";

const TYPES = [["all", "Todo"], ["video", "Vídeo"], ["image", "Imágenes"], ["audio", "Audio"], ["subtitle", "Subtítulos"]] as const;
const ICON = { video: FileVideo, image: FileImage, audio: FileAudio, music: FileAudio, subtitle: FileText };

export default async function Biblioteca({ searchParams }: { searchParams: Promise<{ tipo?: string; error?: string; ok?: string }> }) {
  const q = await searchParams;
  const { storage } = getProviders();
  const [assets, prods] = await Promise.all([storage.assets.list(), storage.productions.list()]);
  const used = new Set(prods.map((p) => p.videoAssetId));
  const list = assets.filter((a) => !q.tipo || q.tipo === "all" || a.kind === q.tipo).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = assets.reduce((n, a) => n + a.size, 0);
  return (
    <>
      <PageHeader title="Biblioteca" sub={`${assets.length} archivos · ${fmtBytes(total)}`} />
      {q.error && <Notice kind="err">{q.error}</Notice>}
      {q.ok && <Notice kind="ok">Archivo subido.</Notice>}
      <details className="acc" style={{ marginBottom: 16 }}>
        <summary><Upload className="i kap" />Subir archivo</summary>
        <div className="body"><form action="/api/upload" method="post" encType="multipart/form-data" className="stack">
          <input type="hidden" name="redirect" value="/biblioteca" />
          <div className="form">
            <div className="field"><label htmlFor="f">Archivo (vídeo, imagen, audio, .srt/.vtt)</label><input id="f" type="file" name="file" required accept="video/*,image/*,audio/*,.srt,.vtt" /></div>
            <div className="field"><label htmlFor="l">Licencia / origen</label><input id="l" name="license" defaultValue="propio" /></div>
          </div>
          <div className="row"><SubmitButton className="btn primary">Subir</SubmitButton></div>
        </form></div>
      </details>
      <div className="tabs">{TYPES.map(([k, l]) => <Link key={k} href={`/biblioteca?tipo=${k}`} className={`tab${(q.tipo ?? "all") === k ? " active" : ""}`}>{l}</Link>)}</div>
      {list.length === 0 ? <Empty text="La biblioteca está vacía." /> : (
        <div className="grid">{list.map((a) => { const Icon = ICON[a.kind]; return (
          <div key={a.id} className="card stack media">
            <div className="thumb">{a.kind === "image" ? <img src={`/api/media/${a.id}`} alt={a.name} loading="lazy" /> : a.kind === "video" ? <video src={`/api/media/${a.id}#t=0.1`} preload="metadata" playsInline controls /> : a.kind === "audio" ? <audio controls src={`/api/media/${a.id}`} /> : <Icon className="i" />}</div>
            <div><div className="t" style={{ overflowWrap: "anywhere", fontWeight: 600 }}>{a.name || a.path}</div>
              <div className="small muted">{a.kind} · {fmtBytes(a.size)} · {fmtDate(a.createdAt)} · {a.license}{used.has(a.id) ? " · en uso" : ""}</div></div>
            <form action={deleteAsset.bind(null, a.id)}><SubmitButton className="btn danger sm" confirm="¿Eliminar este archivo?"><Trash2 className="i" />Eliminar</SubmitButton></form>
          </div>); })}</div>
      )}
    </>
  );
}
