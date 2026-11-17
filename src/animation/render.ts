import type { Ctx } from "./character.ts";
import { drawCharacter, poseFor } from "./character.ts";
import { drawForeground, drawProp, drawSet } from "./sets.ts";
import { evaluate } from "./timeline.ts";
import type { FrameState, Grade, StageSpec } from "./types.ts";
import { GROUND_Y, WORLD_H, WORLD_W } from "./types.ts";
import { clamp, hash32, rng } from "./util.ts";

export type Resources = { images: Record<string, unknown> };

/** Ventana de cámara sobre el mundo según formato: en 9:16 recorta una columna y sigue la acción. */
export function viewFor(stage: StageSpec, aspect: number, st: FrameState) {
  const visH = WORLD_H / Math.max(0.3, st.camera.zoom), visW = visH * aspect;
  const margin = 1.2;
  const cx = visW >= WORLD_W + 2 * margin ? WORLD_W / 2 : clamp(st.camera.x, visW / 2 - margin, WORLD_W - visW / 2 + margin);
  const cy = visH >= WORLD_H ? WORLD_H / 2 : clamp(st.camera.y, visH / 2, WORLD_H - visH / 2);
  return { visH, visW, cx, cy };
}

const GRADE: Record<Grade, string | null> = { none: null, dusk: "rgba(255,140,80,0.10)", night: "rgba(20,30,80,0.26)", warm: "rgba(255,190,100,0.10)", cold: "rgba(80,140,255,0.10)", dark: "rgba(0,0,0,0.34)" };

/** Dibuja UN fotograma. Mismo código en navegador (previsualización/editor) y en Node/Skia (exportación). */
export function renderFrame(c: Ctx, stage: StageSpec, t: number, res: Resources, W: number, H: number) {
  const st = evaluate(stage, t); const v = viewFor(stage, W / H, st); const s = H / v.visH;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = "#111318"; c.fillRect(0, 0, W, H);
  c.translate(W / 2, H / 2); c.scale(s, s); c.rotate(st.camera.rot); c.translate(-(v.cx + st.shakeX), -(v.cy + st.shakeY));
  const view = { l: v.cx - v.visW / 2 - 1, r: v.cx + v.visW / 2 + 1, t: v.cy - v.visH / 2 - 1, b: v.cy + v.visH / 2 + 1, cx: v.cx };
  drawSet(c, stage.set, view, t, res.images, stage.style.ink);
  const accent = stage.set.accent ?? "#E9B949";
  stage.props.forEach((p) => { const a = st.props.find((x) => x.id === p.id)?.alpha ?? 0; if (a > 0.001) drawProp(c, p, a, stage.style.ink, accent); });
  const order = stage.actors.map((a, i) => ({ a, s: st.actors[i] })).filter((x) => x.s.visible).sort((p, q) => p.s.x - q.s.x);
  for (const { a, s: as } of order) {
    c.save(); c.translate(as.x, GROUND_Y + 0.55); // los pies pisan el suelo con un poco de profundidad
    drawCharacter(c, a.appearance, poseFor(as, t, hash32(a.id)), { ink: stage.style.ink, line: stage.style.line, facing: as.facing, shadow: stage.style.shadow, alpha: as.alpha }, res.images);
    c.restore();
  }
  drawForeground(c, stage.set, view, res.images, stage.style.ink);   // primer plano: delante de los personajes, se desplaza más que la cámara
  c.restore();
  // efectos y gradación en espacio de pantalla
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  for (const e of st.effects) drawEffect(c, e.effect, e.intensity, e.p, t, W, H, stage.seed);
  const g = GRADE[stage.set.timeOfDay === "night" && stage.style.grade === "none" ? "night" : stage.style.grade];
  if (g) { c.fillStyle = g; c.fillRect(0, 0, W, H); }
  if (stage.style.vignette > 0) { const r = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); r.addColorStop(0, "rgba(0,0,0,0)"); r.addColorStop(1, `rgba(0,0,0,${stage.style.vignette})`); c.fillStyle = r; c.fillRect(0, 0, W, H); }
  if ((stage.style.bars ?? 0) > 0) { const bh = Math.round(H * (stage.style.bars ?? 0)); c.fillStyle = "#000"; c.fillRect(0, 0, W, bh); c.fillRect(0, H - bh, W, bh); }   // barras cinematográficas
  c.restore();
}

function drawEffect(c: Ctx, kind: string, k: number, p: number, t: number, W: number, H: number, seed: number) {
  const fade = Math.min(1, p * 8, (1 - p) * 8);
  if (kind === "rain") { const r = rng(seed + 11); c.strokeStyle = `rgba(190,210,255,${0.35 * fade})`; c.lineWidth = Math.max(1, W / 900); c.beginPath();
    for (let i = 0; i < 160 * k; i++) { const x0 = r() * W * 1.2, sp = 0.6 + r() * 0.7, y0 = ((r() + t * sp) % 1) * (H + 80) - 40, x = x0 - y0 * 0.18; c.moveTo(x, y0); c.lineTo(x - 7, y0 + 24); } c.stroke(); }
  else if (kind === "snow") { const r = rng(seed + 5); c.fillStyle = `rgba(255,255,255,${0.8 * fade})`; for (let i = 0; i < 110 * k; i++) { const sp = 0.08 + r() * 0.12, x = (r() * W + Math.sin(t * 0.8 + i) * 18) % W, y = ((r() + t * sp) % 1) * H; c.beginPath(); c.arc(x, y, 1.5 + r() * 2.2, 0, Math.PI * 2); c.fill(); } }
  else if (kind === "dust") { const r = rng(seed + 7); c.fillStyle = `rgba(233,185,73,${0.35 * fade})`; for (let i = 0; i < 40 * k; i++) { const x = (r() * W + t * 14 * (0.3 + r())) % W, y = (r() * H + Math.sin(t + i) * 12 + H) % H; c.beginPath(); c.arc(x, y, 1 + r() * 1.6, 0, Math.PI * 2); c.fill(); } }
  else if (kind === "fog") { const g = c.createLinearGradient(0, H * 0.35, 0, H); g.addColorStop(0, "rgba(200,210,225,0)"); g.addColorStop(1, `rgba(200,210,225,${0.42 * k * fade})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  else if (kind === "flash") { c.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - p * 3) * 0.9 * k})`; c.fillRect(0, 0, W, H); }
  else if (kind === "darken") { c.fillStyle = `rgba(0,0,0,${0.55 * k * fade})`; c.fillRect(0, 0, W, H); }
}
