import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Lock, Play, Plus, Repeat2, Subtitles, Trash2 } from "lucide-react";
import { getProviders } from "@/server/providers";
import { label } from "@/server/queries";
import { linesToText } from "@/server/studio/script";
import { espeakProvider } from "@/server/studio/voice";
import { addScene, deleteScene, moveScene, previewScene, recompose, saveScene, saveSubtitleStyle } from "@/server/studio-actions";
import SubmitButton from "./SubmitButton";
import { Empty, Notice, PageHeader } from "./ui";
import { fmtDuration } from "@/lib/format";

const SRC: Record<string, string> = { manual: "elegida a mano", directive: "según [imagen:]", memory: "memoria del lugar", library: "biblioteca", character: "personaje", card: "tarjeta KAP" };
const TRANSITIONS: [string, string][] = [["fade", "Fundido"], ["fadeblack", "Fundido a negro"], ["dissolve", "Disolución"], ["slideleft", "Deslizar ←"], ["slideright", "Deslizar →"], ["wipeleft", "Cortinilla"], ["circleopen", "Círculo"], ["cut", "Corte"]];

/** Editor de escenas: herramienta SECUNDARIA para revisar y corregir lo que el pipeline ha generado. */
export default async function SceneEditor({ id, kind, error }: { id: string; kind: "episode" | "short"; error?: string }) {
  const { storage, render } = getProviders();
  const p = await storage.productions.get(id);
  if (!p || p.kind !== kind) notFound();
  const [assets, jobs, settings, tts] = await Promise.all([storage.assets.list(), render.list(80), storage.settings.get("settings"), espeakProvider().available()]);
  const visuals = assets.filter((a) => (a.kind === "image" || a.kind === "video") && !["music", "narration", "sfx"].includes(a.role ?? ""));
  const voices = assets.filter((a) => a.kind === "audio" && a.role !== "music");
  const sfx = assets.filter((a) => a.kind === "audio" && a.role !== "narration");
  const music = assets.filter((a) => a.role === "music" || (a.kind === "audio" && !["narration", "sfx"].includes(a.role ?? "")));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const base = kind === "episode" ? `/episodios/${p.id}` : `/shorts/${p.id}`;
  const here = `${base}/escenas`;
  const mine = jobs.filter((j) => j.productionId === p.id);
  const preview = mine.find((j) => j.kind === "preview");
  const total = p.scenes.reduce((n, s) => n + s.durationSec, 0);
  const st = settings ?? { subtitlesEnabled: true, subtitleScale: 1, subtitlePosition: "bottom" as const };
  const hidden = <><input type="hidden" name="id" value={p.id} /><input type="hidden" name="_redirect" value={here} /></>;

  return (
    <>
      <p className="small"><Link href={base} className="muted">← {label(p)}</Link></p>
      <PageHeader title="Editor de escenas" sub={`${p.scenes.length} escenas · ${fmtDuration(Math.round(total))} · herramienta de revisión`}>
        <form action={addScene}>{hidden}<SubmitButton className="btn sm"><Plus className="i" />Añadir escena</SubmitButton></form>
      </PageHeader>
      {error && <Notice kind="err">{error}</Notice>}
      <Notice><span>El vídeo se <b>genera automáticamente</b> desde la ficha del episodio. Aquí solo corriges lo generado: al guardar una escena queda <Lock className="i" size={13} style={{ verticalAlign: -2 }} /> bloqueada y el pipeline no la sobrescribe. Al volver a componer solo se renderizan las escenas modificadas.</span></Notice>

      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card stack"><h2><Repeat2 className="i" />Volver a componer</h2>
          <form action={recompose} className="stack">{hidden}
            <div className="form">
              <div className="field"><label htmlFor="rq">Resolución</label><select id="rq" name="quality" defaultValue="720p"><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></div>
              <div className="field"><label htmlFor="rv">Narración</label><select id="rv" name="voice" defaultValue="none"><option value="none">Sin voz / audios subidos</option><option value="espeak" disabled={!tts}>{tts ? "Voz local eSpeak" : "Voz local no instalada"}</option></select></div>
              <div className="field"><label htmlFor="rm">Música</label><select id="rm" name="musicAssetId" defaultValue={p.musicAssetId ?? ""}><option value="">— Sin música —</option>{music.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            </div>
            <div className="row"><SubmitButton className="btn primary" >Volver a componer</SubmitButton></div>
          </form></div>
        <div className="card stack"><h2><Subtitles className="i" />Estilo de subtítulos</h2>
          <form action={saveSubtitleStyle} className="stack"><input type="hidden" name="_redirect" value={here} />
            <label className="row small"><input type="checkbox" name="enabled" defaultChecked={st.subtitlesEnabled} style={{ width: 20, minHeight: 20 }} />Mostrar subtítulos en el vídeo</label>
            <div className="form">
              <div className="field"><label htmlFor="ss">Tamaño (×)</label><input id="ss" name="scale" type="number" step="0.1" min="0.6" max="1.8" defaultValue={st.subtitleScale} inputMode="decimal" /></div>
              <div className="field"><label htmlFor="sp">Posición</label><select id="sp" name="position" defaultValue={st.subtitlePosition}><option value="bottom">Abajo</option><option value="center">Centro</option><option value="top">Arriba</option></select></div>
            </div>
            <p className="small muted">Tipografía Inter en negrita, texto blanco con contorno oscuro y nombre del personaje en amarillo KAP.</p>
            <div className="row"><SubmitButton className="btn sm">Guardar estilo</SubmitButton></div></form></div>
      </div>

      {preview && (preview.status === "queued" || preview.status === "running") && <Notice>Generando vista previa… {preview.log ?? ""} <Link href="/render" className="kap">Ver cola</Link></Notice>}
      {preview?.status === "done" && preview.outputAssetId && <div className="card stack" style={{ marginBottom: 16 }}><h2><Play className="i" />Última vista previa de escena</h2><video controls playsInline preload="metadata" src={`/api/media/${preview.outputAssetId}`} style={{ maxHeight: "50vh" }} /></div>}
      {preview?.status === "failed" && <Notice kind="err">La vista previa falló: {preview.error}</Notice>}

      {p.scenes.length === 0 ? <Empty text="No hay escenas. Pulsa «Solo analizar el guion» o «Generar episodio» en la ficha." /> : (
        <div className="stack">
          {p.scenes.map((s, i) => {
            const v = s.visualAssetId ? byId.get(s.visualAssetId) : undefined;
            return (
              <details className="acc" key={s.id}>
                <summary>
                  <div className="thumb" style={{ width: 64, aspectRatio: "16/10", flex: "none" }}>{v?.kind === "image" ? <img src={`/api/media/${v.id}`} alt="" loading="lazy" /> : <span className="small">KAP</span>}</div>
                  <span style={{ minWidth: 0, flex: 1 }}><div className="t" style={{ fontWeight: 600 }}>{i + 1}. {s.title || "Sin título"} {s.locked && <Lock className="i" size={13} style={{ verticalAlign: -2, color: "var(--kap)" }} />}</div>
                    <div className="s small muted">{s.durationSec.toFixed(1)} s{s.durationSource === "estimated" ? " (est.)" : s.durationSource === "audio" ? " (audio)" : ""} · {SRC[s.visualSource ?? "card"]}</div></span>
                </summary>
                <div className="body stack">
                  <form action={saveScene} className="stack">{hidden}<input type="hidden" name="sceneId" value={s.id} />
                    <div className="form">
                      <div className="field"><label htmlFor={`t${s.id}`}>Título</label><input id={`t${s.id}`} name="title" defaultValue={s.title} /></div>
                      <div className="field"><label htmlFor={`l${s.id}`}>Lugar</label><input id={`l${s.id}`} name="location" defaultValue={s.location} /></div>
                      <div className="field wide"><label htmlFor={`x${s.id}`}>Texto (una línea por intervención; «NOMBRE: texto» para diálogos)</label><textarea id={`x${s.id}`} name="text" defaultValue={linesToText(s.lines)} style={{ minHeight: 110 }} /></div>
                      <div className="field"><label htmlFor={`d${s.id}`}>Duración (s)</label><input id={`d${s.id}`} name="durationSec" type="number" step="any" min="2" max="120" defaultValue={s.durationSec} inputMode="decimal" /></div>
                      <div className="field"><label htmlFor={`tr${s.id}`}>Transición de entrada</label><select id={`tr${s.id}`} name="transition" defaultValue={s.transition}>{TRANSITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                      <div className="field"><label htmlFor={`m${s.id}`}>Movimiento</label><select id={`m${s.id}`} name="motion" defaultValue={s.motion}><option value="kenburns">Zoom suave</option><option value="static">Estático</option></select></div>
                      <div className="field"><label htmlFor={`v${s.id}`}>Imagen / clip de fondo</label><select id={`v${s.id}`} name="visualAssetId" defaultValue={s.visualAssetId ?? ""}><option value="">Tarjeta KAP (sin recurso)</option>{visuals.map((a) => <option key={a.id} value={a.id}>{a.name}{a.kind === "video" ? " (vídeo)" : ""}</option>)}</select></div>
                      <div className="field"><label htmlFor={`n${s.id}`}>Narración (audio subido)</label><select id={`n${s.id}`} name="narrationAssetId" defaultValue={s.narrationAssetId ?? ""}><option value="">— Ninguna / voz local —</option>{voices.map((a) => <option key={a.id} value={a.id}>{a.name}{a.durationSec ? ` · ${a.durationSec.toFixed(1)} s` : ""}</option>)}</select></div>
                      <div className="field"><label htmlFor={`f${s.id}`}>Efecto de sonido</label><select id={`f${s.id}`} name="sfxAssetId" defaultValue={s.sfxAssetId ?? ""}><option value="">— Ninguno —</option>{sfx.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                    </div>
                    <div className="row"><SubmitButton className="btn primary sm">Guardar escena</SubmitButton></div>
                  </form>
                  <div className="row">
                    <form action={previewScene}>{hidden}<input type="hidden" name="sceneId" value={s.id} /><input type="hidden" name="voice" value={tts ? "espeak" : "none"} /><SubmitButton className="btn sm"><Play className="i" />Previsualizar escena</SubmitButton></form>
                    <form action={moveScene}>{hidden}<input type="hidden" name="sceneId" value={s.id} /><input type="hidden" name="dir" value="up" /><SubmitButton className="btn sm" ><ArrowUp className="i" />Subir</SubmitButton></form>
                    <form action={moveScene}>{hidden}<input type="hidden" name="sceneId" value={s.id} /><input type="hidden" name="dir" value="down" /><SubmitButton className="btn sm"><ArrowDown className="i" />Bajar</SubmitButton></form>
                    <form action={deleteScene}>{hidden}<input type="hidden" name="sceneId" value={s.id} /><SubmitButton className="btn sm danger" confirm="¿Eliminar esta escena?"><Trash2 className="i" />Eliminar</SubmitButton></form>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
