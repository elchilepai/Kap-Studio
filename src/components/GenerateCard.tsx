import Link from "next/link";
import { AlertTriangle, ListChecks, Sparkles, Wand2 } from "lucide-react";
import type { Production } from "@/domain/types";
import { getProviders } from "@/server/providers";
import { espeakProvider } from "@/server/studio/voice";
import { parseBrief } from "@/server/studio/brief";
import { generateEpisode, analyzeScript } from "@/server/studio-actions";
import SubmitButton from "./SubmitButton";
import { Notice } from "./ui";
import { RENDER_STATUS_LABEL } from "@/domain/render";
import { fmtDuration } from "@/lib/format";

const SRC: Record<string, string> = { manual: "elegida a mano", directive: "según [imagen:]", memory: "memoria del lugar", library: "biblioteca", character: "personaje", card: "tarjeta KAP" };

/** Producción automática: petición + un botón. Todo lo demás lo hace el pipeline; el editor de escenas es solo para corregir. */
export default async function GenerateCard({ p }: { p: Production }) {
  const { storage, render } = getProviders();
  const [assets, jobs, tts, styleDoc] = await Promise.all([storage.assets.list(), render.list(80), espeakProvider().available(), storage.style.get("style")]);
  const music = assets.filter((a) => a.role === "music" || (a.kind === "audio" && !["narration", "sfx"].includes(a.role ?? "")));
  const mine = jobs.filter((j) => j.productionId === p.id && (j.kind === "episode" || j.kind === "short"));
  const last = mine[0];
  const hints = parseBrief(p.brief);
  const bySrc = p.scenes.reduce<Record<string, number>>((m, s) => { const k = s.visualSource ?? "card"; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const total = p.scenes.reduce((n, s) => n + s.durationSec, 0), est = p.scenes.filter((s) => s.durationSource === "estimated").length;
  const shorts = (await storage.productions.list()).filter((x) => x.parentId === p.id);
  const busy = last && (last.status === "queued" || last.status === "running");

  return (
    <div className="card stack" id="generar">
      <h2><Sparkles className="i" />Producción automática</h2>
      {!p.script.trim() ? (
        <Notice kind="err"><AlertTriangle className="i" /><span>Este episodio no tiene guion. Escríbelo o pégalo en «Datos» (la redacción automática con IA no está conectada todavía).</span></Notice>
      ) : (
        <p className="small muted">Escribe una petición, elige el episodio y pulsa <b style={{ color: "var(--text)" }}>Generar</b>. KAP Studio analiza el guion, divide las escenas, asigna recursos, prepara voz y subtítulos, compone el vídeo y deriva los Shorts. <b style={{ color: "var(--text)" }}>Tú apruebas al final.</b></p>
      )}

      <form action={generateEpisode} className="stack">
        <input type="hidden" name="id" value={p.id} /><input type="hidden" name="_redirect" value="/render" /><input type="hidden" name="_errorTo" value={`/episodios/${p.id}`} />
        <div className="field wide"><label htmlFor="brief">Petición (opcional)</label>
          <textarea id="brief" name="brief" defaultValue={p.brief} style={{ minHeight: 72 }} placeholder="Ej.: episodio de 5 minutos, 3 shorts, tono oscuro" />
          {hints.recognized.length > 0 && <div className="small muted">Reconocido: {hints.recognized.join(" · ")}. El resto del texto se guarda, pero no se interpreta hasta conectar un proveedor de IA.</div>}
        </div>
        <div className="form">
          <div className="field"><label htmlFor="g-a">Estilo visual</label><select id="g-a" name="animation" defaultValue={styleDoc?.defaultMode === "still" ? "still" : "2d"}><option value="2d">Animación 2D (personajes, cámara, escenarios)</option><option value="still">Imágenes fijas con zoom</option></select></div>
          <div className="field"><label htmlFor="g-q">Resolución</label><select id="g-q" name="quality" defaultValue="720p"><option value="480p">480p (borrador rápido)</option><option value="720p">720p</option><option value="1080p">1080p (final)</option></select></div>
          <div className="field"><label htmlFor="g-v">Narración</label><select id="g-v" name="voice" defaultValue="none"><option value="none">Sin voz (solo subtítulos / audios subidos)</option><option value="espeak" disabled={!tts}>{tts ? "Voz local eSpeak (básica)" : "Voz local — no instalada"}</option></select></div>
          <div className="field"><label htmlFor="g-s">Shorts a derivar</label><input id="g-s" name="shortsCount" type="number" min={0} max={6} placeholder={String(hints.shortsCount ?? 3)} inputMode="numeric" /></div>
          <div className="field"><label htmlFor="g-m">Música</label><select id="g-m" name="musicAssetId" defaultValue={p.musicAssetId ?? ""}><option value="">— Sin música —</option>{music.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.license}</option>)}</select></div>
        </div>
        <div className="row">
          <SubmitButton className="btn primary" confirm={p.scenes.some((s) => s.locked) ? "Hay escenas corregidas a mano: se conservarán las que mantengan su título. ¿Generar de nuevo?" : undefined}><Wand2 className="i" />{busy ? "Generar de nuevo" : "Generar episodio"}</SubmitButton>
        </div>
      </form>

      <div className="row">
        <form action={analyzeScript}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="_errorTo" value={`/episodios/${p.id}`} /><SubmitButton className="btn sm"><ListChecks className="i" />Solo analizar el guion</SubmitButton></form>
        {p.scenes.length > 0 && <Link href={`/episodios/${p.id}/escenas`} className="btn sm">Revisar / corregir escenas ({p.scenes.length})</Link>}
      </div>

      {last && (
        <div className="card sub"><div className="row between"><span className="small"><b>Última generación</b></span>
          <span className={`badge ${last.status === "done" ? "ok" : last.status === "failed" ? "err" : last.status === "running" ? "info" : "kap"}`}>{RENDER_STATUS_LABEL[last.status]}{last.status === "running" ? ` ${Math.round(last.progress * 100)}%` : ""}</span></div>
          {last.log && last.status === "running" && <div className="small muted" style={{ marginTop: 6 }}>{last.log}</div>}
          {last.error && <div className="small" style={{ marginTop: 6, color: last.status === "failed" ? "var(--err)" : "var(--muted)", overflowWrap: "anywhere" }}>{last.error}</div>}
          <div className="small" style={{ marginTop: 6 }}><Link href="/render" className="kap">Ver cola de renderizado →</Link></div></div>
      )}

      {p.scenes.length > 0 && (
        <div className="card sub small stack" style={{ gap: 6 }}>
          <div><b>Plan actual:</b> {p.scenes.length} escenas · {fmtDuration(Math.round(total))}{est ? ` (${est} duraciones estimadas; se ajustan al audio real)` : ""}{hints.targetSec ? ` · objetivo ${fmtDuration(hints.targetSec)}` : ""}</div>
          <div className="muted">Visuales: {Object.entries(bySrc).map(([k, n]) => `${n} ${SRC[k] ?? k}`).join(" · ")}</div>
          {shorts.length > 0 && <div className="muted">Shorts: {shorts.map((s) => s.title.split("·").pop()?.trim()).join(", ")} ({shorts.filter((s) => s.videoAssetId).length}/{shorts.length} listos)</div>}
        </div>
      )}
    </div>
  );
}
