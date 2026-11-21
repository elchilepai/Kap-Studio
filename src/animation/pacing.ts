/**
 * RITMO (módulo puro): detección de AIRE MUERTO. Una pausa dramática tiene función (mirada, reacción, cámara que se acerca, sonido, otro personaje…);
 * un tramo de varios segundos sin diálogo, acción, reacción, cambio visual, cámara ni sonido es un vídeo sin nada ocurriendo.
 */
import type { Cue, SoundCue, StageSpec } from "./types.ts";
import { evaluate } from "./timeline.ts";
export type Span = { t0: number; t1: number };

/** Intervalos en los que ocurre ALGO visible o audible (el vaivén de respiración no cuenta). */
export function activitySpans(cues: Cue[], sounds: SoundCue[] = []): Span[] {
  const out: Span[] = [];
  for (const c of cues) {
    if (c.type === "speak") out.push({ t0: c.t, t1: c.t + c.dur });
    else if (c.type === "move") out.push({ t0: c.t, t1: c.t + c.dur });
    else if (c.type === "enter" || c.type === "exit") out.push({ t0: c.t, t1: c.t + (c.dur ?? 1.8) });
    else if (c.type === "pose") out.push({ t0: c.t, t1: c.t + (c.dur ?? 0.5) });
    else if (c.type === "gesture") out.push({ t0: c.t, t1: c.t + c.dur });
    else if (c.type === "expression") out.push({ t0: c.t, t1: c.t + 0.6 });
    else if (c.type === "face") out.push({ t0: c.t, t1: c.t + 0.4 });
    else if (c.type === "prop") out.push({ t0: c.t, t1: c.t + 0.5 });
    else if (c.type === "shake") out.push({ t0: c.t, t1: c.t + c.dur });
    else if (c.type === "camera" && (c.dur >= 0.3 || c.focus) && !(c.ease === "linear" && c.dur > 4.5)) out.push({ t0: c.t, t1: c.t + c.dur });   // un movimiento de cámara con intención (no la deriva lineal de fondo) también es cambio visual
    else if (c.type === "effect" && c.dur <= 5) out.push({ t0: c.t, t1: c.t + c.dur });
  }
  for (const s of sounds) out.push({ t0: s.t, t1: s.t + Math.min(s.dur ?? 0.6, 1.5) });
  return out.sort((a, b) => a.t0 - b.t0);
}
/** Tramos de más de `min` segundos (por defecto 3) en los que no ocurre nada. */
export function deadAir(cues: Cue[], duration: number, o: { min?: number; sounds?: SoundCue[]; from?: number } = {}): Span[] {
  const min = o.min ?? 3, gaps: Span[] = []; let t = o.from ?? 0;
  for (const s of activitySpans(cues, o.sounds)) { if (s.t0 - t >= min) gaps.push({ t0: t, t1: s.t0 }); t = Math.max(t, s.t1); }
  if (duration - t >= min) gaps.push({ t0: t, t1: duration });
  return gaps;
}

/** ¿La escena CAMBIA? Compara el principio y el final: posición, expresión, objetos visibles, cámara o quién está en escena. Una escena que termina igual que empezó no ha contado nada. */
export function sceneChanges(stage: StageSpec, from = 0.4, to = Math.max(0.5, stage.duration - 0.6)): boolean {
  const a = evaluate(stage, from), b = evaluate(stage, to);
  if (a.actors.some((x, i) => Math.abs(x.x - b.actors[i].x) > 0.3 || x.expression !== b.actors[i].expression || x.facing !== b.actors[i].facing || x.visible !== b.actors[i].visible)) return true;
  if (a.props.some((p, i) => Math.abs(p.alpha - b.props[i].alpha) > 0.5)) return true;
  return Math.abs(a.camera.zoom - b.camera.zoom) > 0.08 || Math.abs(a.camera.x - b.camera.x) > 0.5;
}
