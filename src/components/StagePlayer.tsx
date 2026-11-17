"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { renderFrame, type Resources } from "@/animation/render";
import type { StageSpec } from "@/animation/types";

/** Carga las imágenes del escenario (URLs de /api/media) una sola vez. */
function useImages(urls: Record<string, string>) {
  const [res, setRes] = useState<Resources>({ images: {} });
  const key = JSON.stringify(urls);
  useEffect(() => {
    let alive = true; const out: Record<string, unknown> = {}; const entries = Object.entries(JSON.parse(key) as Record<string, string>);
    if (!entries.length) { setRes({ images: {} }); return; }
    Promise.all(entries.map(([id, u]) => new Promise<void>((ok) => { const im = new Image(); im.onload = () => { out[id] = im; ok(); }; im.onerror = () => ok(); im.src = u; }))).then(() => { if (alive) setRes({ images: out }); });
    return () => { alive = false; };
  }, [key]);
  return res;
}

const RES_W = 640;
function size(stage: StageSpec) { const ar = stage.width / stage.height; return ar >= 1 ? { w: RES_W, h: Math.round(RES_W / ar) } : { h: 480, w: Math.round(480 * ar) }; }

/**
 * Reproductor de la escena 2D en el navegador: usa EXACTAMENTE el mismo renderizador (src/animation) que la exportación
 * en el servidor, así que lo que se revisa aquí es lo que se exporta. Reproducir, pausar y arrastrar el tiempo.
 */
export default function StagePlayer({ stage, images = {}, autoPlay = false, label }: { stage: StageSpec; images?: Record<string, string>; autoPlay?: boolean; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null); const res = useImages(images); const { w, h } = useMemo(() => size(stage), [stage]);
  const [t, setT] = useState(0); const [playing, setPlaying] = useState(autoPlay); const tRef = useRef(0);
  const draw = (time: number) => { const c = ref.current?.getContext("2d"); if (c) renderFrame(c, stage, time, res, w, h); };
  useEffect(() => { draw(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stage, res, t, w, h]);
  useEffect(() => {
    if (!playing) return; let raf = 0, last = performance.now();
    const tick = (now: number) => { tRef.current = (tRef.current + (now - last) / 1000) % Math.max(0.1, stage.duration); last = now; setT(tRef.current); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, stage.duration]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <canvas ref={ref} width={w} height={h} aria-label={label ?? "Vista previa de la escena 2D"} style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", borderRadius: 12, background: "#000", display: "block", margin: "0 auto" }} />
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button type="button" className="btn sm" onClick={() => { tRef.current = t; setPlaying((p) => !p); }} aria-label={playing ? "Pausar" : "Reproducir"}>{playing ? <Pause className="i" /> : <Play className="i" />}</button>
        <input type="range" min={0} max={stage.duration} step={0.01} value={t} onChange={(e) => { const v = Number(e.target.value); tRef.current = v; setT(v); }} aria-label="Posición en la escena" style={{ minHeight: 0, padding: 0 }} />
        <span className="small muted" style={{ minWidth: 70, textAlign: "right" }}>{t.toFixed(1)} / {stage.duration.toFixed(1)} s</span>
      </div>
    </div>
  );
}

/** Fotogramas fijos de una escena (storyboard): inicio, mitad y final. */
export function StageFrames({ stage, images = {}, times }: { stage: StageSpec; images?: Record<string, string>; times: number[] }) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([]); const res = useImages(images); const { w, h } = useMemo(() => { const s = size(stage); return { w: Math.round(s.w / 2), h: Math.round(s.h / 2) }; }, [stage]);
  useEffect(() => { times.forEach((t, i) => { const c = refs.current[i]?.getContext("2d"); if (c) renderFrame(c, stage, t, res, w, h); }); }, [stage, res, times, w, h]);
  return <div className="row" style={{ flexWrap: "nowrap", gap: 6, overflowX: "auto" }}>{times.map((t, i) => <canvas key={i} ref={(el) => { refs.current[i] = el; }} width={w} height={h} aria-label={`Fotograma a los ${t.toFixed(1)} s`} style={{ flex: "1 1 0", minWidth: 0, maxWidth: `${100 / times.length}%`, borderRadius: 8, background: "#000" }} />)}</div>;
}
