import type { ActorSpec, ActorState, CameraState, Cue, EffectKind, Expression, FrameState, ActionPose, Gesture, StageSpec, Viseme } from "./types.ts";
import { WORLD_W } from "./types.ts";
import { clamp, ease, lerp } from "./util.ts";
import type { Ease } from "./types.ts";

type Seg = { t0: number; t1: number; x0: number; x1: number; run: boolean };
type VisEv = { t: number; on: boolean; fade: number };
type Track = {
  segs: Seg[]; vis: VisEv[]; face: { t: number; dir: 1 | -1 }[]; expr: { t: number; v: Expression }[];
  gest: { t0: number; t1: number; v: Gesture }[]; poses: { t: number; v: ActionPose }[]; speak: { t0: number; t1: number; env: number[]; vis?: Viseme[] }[]; x0: number; offscreen: boolean;
};
type CamSeg = { t0: number; t1: number; from: CameraState; to: CameraState; ease: Ease | undefined };
type Compiled = { tracks: Map<string, Track>; cam: CamSeg[]; base: CameraState; shakes: { t0: number; t1: number; amp: number }[];
  effects: { effect: EffectKind; t0: number; t1: number; k: number }[]; props: Map<string, VisEv[]> };

const cache = new WeakMap<StageSpec, Compiled>();
const BASE_CAM: CameraState = { x: WORLD_W / 2, y: 4.5, zoom: 1, rot: 0 };

function xAt(tr: Track, t: number): number {
  let x = tr.x0;
  for (const s of tr.segs) { if (t < s.t0) break; x = t >= s.t1 ? s.x1 : lerp(s.x0, s.x1, ease("inOut", (t - s.t0) / Math.max(1e-6, s.t1 - s.t0))); }
  return x;
}
function camAt(segs: CamSeg[], base: CameraState, t: number): CameraState {
  let c = base;
  for (const s of segs) { if (t < s.t0) break; const p = t >= s.t1 ? 1 : (t - s.t0) / Math.max(1e-6, s.t1 - s.t0); const e = ease(s.ease, p);
    c = { x: lerp(s.from.x, s.to.x, e), y: lerp(s.from.y, s.to.y, e), zoom: lerp(s.from.zoom, s.to.zoom, e), rot: lerp(s.from.rot, s.to.rot, e) }; }
  return c;
}
const offX = (side: "left" | "right") => (side === "left" ? -2 : WORLD_W + 2);

export function compile(stage: StageSpec): Compiled {
  const hit = cache.get(stage); if (hit) return hit;
  const tracks = new Map<string, Track>();
  for (const a of stage.actors) tracks.set(a.id, { segs: [], vis: a.presentAtStart ? [{ t: 0, on: true, fade: 0.3 }] : [], face: [], expr: [], gest: [], poses: [], speak: [], x0: a.slot, offscreen: !a.presentAtStart });
  const cues = [...stage.cues].sort((p, q) => p.t - q.t);
  const addSeg = (tr: Track, t: number, x1: number, dur: number, run: boolean) => {
    const x0 = xAt(tr, t); const d = Math.max(0.05, dur);
    tr.segs.push({ t0: t, t1: t + d, x0, x1, run });
    if (Math.abs(x1 - x0) > 0.05) tr.face.push({ t, dir: x1 > x0 ? 1 : -1 });
  };
  const camSegs: CamSeg[] = []; const shakes: Compiled["shakes"] = []; const effects: Compiled["effects"] = []; const props = new Map<string, VisEv[]>();
  for (const p of stage.props) props.set(p.id, p.visibleAtStart ? [{ t: 0, on: true, fade: 0 }] : []);

  for (const c of cues) {
    if (c.type === "camera") {
      const from = camAt(camSegs, BASE_CAM, c.t); let x = c.x ?? from.x;
      if (c.focus) { const tr = tracks.get(c.focus); if (tr) { const z = c.zoom ?? from.zoom, visW = (9 / Math.max(0.3, z)) * (stage.width / stage.height); x = xAt(tr, c.t + c.dur) + (c.lead ?? 0) * visW; } }
      camSegs.push({ t0: c.t, t1: c.t + Math.max(0.05, c.dur), from, to: { x, y: c.y ?? from.y, zoom: c.zoom ?? from.zoom, rot: c.rot ?? from.rot }, ease: c.ease });
    } else if (c.type === "shake") shakes.push({ t0: c.t, t1: c.t + c.dur, amp: c.amp });
    else if (c.type === "effect") effects.push({ effect: c.effect, t0: c.t, t1: c.t + c.dur, k: c.intensity ?? 1 });
    else if (c.type === "prop") { const l = props.get(c.id); if (l) l.push({ t: c.t, on: c.action === "show", fade: 0.3 }); }
    else {
      const tr = tracks.get(c.actor); if (!tr) continue;
      if (c.type === "enter") {
        if (c.from === "fade") { tr.x0 = c.x; tr.segs.push({ t0: 0, t1: 0, x0: c.x, x1: c.x, run: false }); tr.vis.push({ t: c.t, on: true, fade: c.dur ?? 0.5 }); }
        else { tr.vis.push({ t: c.t, on: true, fade: 0 }); tr.segs.push({ t0: c.t - 0.001, t1: c.t, x0: offX(c.from), x1: offX(c.from), run: false }); addSeg(tr, c.t, c.x, c.dur ?? 1.8, false); }
      } else if (c.type === "exit") {
        if (c.to === "fade") tr.vis.push({ t: c.t, on: false, fade: c.dur ?? 0.5 });
        else { addSeg(tr, c.t, offX(c.to), c.dur ?? 1.8, false); tr.vis.push({ t: c.t + (c.dur ?? 1.8), on: false, fade: 0 }); }
      } else if (c.type === "move") addSeg(tr, c.t, c.x, c.dur, !!c.run);
      else if (c.type === "face") tr.face.push({ t: c.t, dir: c.dir === "right" ? 1 : -1 });
      else if (c.type === "expression") tr.expr.push({ t: c.t, v: c.value });
      else if (c.type === "pose") { tr.poses.push({ t: c.t, v: c.value }); if (c.dur) tr.poses.push({ t: c.t + c.dur, v: "idle" }); }
      else if (c.type === "gesture") tr.gest.push({ t0: c.t, t1: c.t + c.dur, v: c.value });
      else if (c.type === "speak") tr.speak.push({ t0: c.t, t1: c.t + c.dur, env: c.envelope, vis: c.visemes });
    }
  }
  for (const tr of tracks.values()) { tr.segs.sort((p, q) => p.t0 - q.t0); tr.face.sort((p, q) => p.t - q.t); tr.expr.sort((p, q) => p.t - q.t); tr.poses.sort((p, q) => p.t - q.t); tr.vis.sort((p, q) => p.t - q.t); }
  const out: Compiled = { tracks, cam: camSegs, base: BASE_CAM, shakes, effects, props };
  cache.set(stage, out); return out;
}

function alphaOf(ev: VisEv[], t: number): number {
  let last: VisEv | undefined; for (const e of ev) { if (e.t <= t) last = e; else break; }
  if (!last) return 0;
  const p = last.fade > 0 ? clamp((t - last.t) / last.fade, 0, 1) : 1;
  return last.on ? p : 1 - p;
}

function actorState(a: ActorSpec, tr: Track, t: number, fps: number): ActorState {
  const x = xAt(tr, t);
  let moving = 0, phase = 0;
  for (const s of tr.segs) {
    const dx = Math.abs(s.x1 - s.x0); if (dx < 0.05 || t < s.t0) continue;
    const p = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1); phase += dx * ease("inOut", p);
    if (t < s.t1) moving = s.run ? 2 : 1;
  }
  let facing = a.facing; for (const f of tr.face) { if (f.t <= t) facing = f.dir; else break; }
  let expression: Expression = "neutral"; for (const e of tr.expr) { if (e.t <= t) expression = e.v; else break; }
  let pose: ActionPose = "idle", poseT = 99; for (const e of tr.poses) { if (e.t <= t) { pose = e.v; poseT = t - e.t; } else break; }
  let gesture: Gesture = "none", gp = 0; for (const g of tr.gest) if (t >= g.t0 && t < g.t1) { gesture = g.v; gp = (t - g.t0) / (g.t1 - g.t0); }
  let mouth = 0, speaking = false, viseme: Viseme = "rest";
  for (const s of tr.speak) if (t >= s.t0 && t < s.t1) {
    const k = Math.min(s.env.length - 1, Math.floor((t - s.t0) * fps)); speaking = true; mouth = s.env[k] ?? 0;
    viseme = s.vis?.[k] ?? (mouth < 0.1 ? "rest" : mouth < 0.3 ? "I" : mouth < 0.6 ? "E" : "A");   // sin pista fonética: solo la amplitud decide la forma
  }
  const alpha = alphaOf(tr.vis, t);
  return { id: a.id, x, y: 0, facing, visible: alpha > 0.001, alpha, moving, walkPhase: phase * 1.15, expression, gesture, gestureP: gp, mouth, viseme, speaking, pose, poseP: clamp(poseT / 0.3, 0, 1) };
}

/** Estado COMPLETO de la escena en el instante t. Función pura y determinista (mismo t ⇒ mismo resultado). */
export function evaluate(stage: StageSpec, t: number): FrameState {
  const c = compile(stage); const tt = clamp(t, 0, stage.duration);
  let sx = 0, sy = 0;
  for (const s of c.shakes) if (tt >= s.t0 && tt < s.t1) { const k = 1 - (tt - s.t0) / (s.t1 - s.t0); sx += Math.sin(tt * 61.3) * s.amp * k; sy += Math.cos(tt * 47.9) * s.amp * k * 0.7; }
  return {
    t: tt, camera: camAt(c.cam, c.base, tt), shakeX: sx, shakeY: sy,
    actors: stage.actors.map((a) => actorState(a, c.tracks.get(a.id)!, tt, stage.fps)),
    props: stage.props.map((p) => ({ id: p.id, alpha: alphaOf(c.props.get(p.id) ?? [], tt) })),
    effects: c.effects.filter((e) => tt >= e.t0 && tt < e.t1).map((e) => ({ effect: e.effect, intensity: e.k, p: (tt - e.t0) / (e.t1 - e.t0) })),
  };
}
export type { Cue };
