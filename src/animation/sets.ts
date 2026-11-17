import type { Ctx } from "./character.ts";
import type { PropSpec, SetSpec, TimeOfDay } from "./types.ts";
import { GROUND_Y, WORLD_H, WORLD_W } from "./types.ts";
import { rng, shade, mix } from "./util.ts";

const PAL: Record<TimeOfDay, { s0: string; s1: string; far: string; mid: string; near: string; ground: string; light: string }> = {
  day: { s0: "#74b9e8", s1: "#dcf2ff", far: "#a9bfdc", mid: "#8aa5c8", near: "#6c88ae", ground: "#6f8d62", light: "#fff4c2" },
  dusk: { s0: "#2f2b63", s1: "#e98a63", far: "#6a527f", mid: "#4a3b70", near: "#33294f", ground: "#2e2745", light: "#ffcf8a" },
  night: { s0: "#0a0f1e", s1: "#1d2a4a", far: "#1b2644", mid: "#141d36", near: "#0e1528", ground: "#0b101e", light: "#E9B949" },
};
export type View = { l: number; r: number; t: number; b: number; cx: number };

function sky(c: Ctx, p: (typeof PAL)["day"], v: View) {
  const g = c.createLinearGradient(0, v.t, 0, GROUND_Y + 0.5); g.addColorStop(0, p.s0); g.addColorStop(1, p.s1); c.fillStyle = g; c.fillRect(v.l - 1, v.t - 1, v.r - v.l + 2, v.b - v.t + 2);
}
function stars(c: Ctx, seed: number, v: View, tod: TimeOfDay) {
  if (tod === "day") return; const r = rng(seed); c.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 70; i++) { const x = -2 + r() * (WORLD_W + 4), y = r() * 4.2, s = 0.012 + r() * 0.03; if (x < v.l - 1 || x > v.r + 1) continue; c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill(); }
}
function ground(c: Ctx, p: (typeof PAL)["day"], v: View, extra?: string) {
  const g = c.createLinearGradient(0, GROUND_Y, 0, v.b); g.addColorStop(0, extra ?? p.ground); g.addColorStop(1, shade(extra ?? p.ground, -0.35)); c.fillStyle = g; c.fillRect(v.l - 1, GROUND_Y, v.r - v.l + 2, v.b - GROUND_Y + 1);
  c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 0.04; c.beginPath(); c.moveTo(v.l - 1, GROUND_Y); c.lineTo(v.r + 1, GROUND_Y); c.stroke();
}
function skyline(c: Ctx, seed: number, color: string, base: number, hMin: number, hMax: number, v: View, windows: string | null, shift: number) {
  const r = rng(seed); let x = -3; c.fillStyle = color;
  while (x < WORLD_W + 3) { const w = 0.7 + r() * 1.3, h = hMin + r() * (hMax - hMin), X = x + shift;
    if (X + w > v.l - 1 && X < v.r + 1) { c.fillRect(X, base - h, w, h);
      if (windows) { c.fillStyle = windows; for (let yy = base - h + 0.25; yy < base - 0.3; yy += 0.45) for (let xx = X + 0.15; xx < X + w - 0.2; xx += 0.35) if (r() > 0.6) c.fillRect(xx, yy, 0.14, 0.2); c.fillStyle = color; } else { for (let k = 0; k < 6; k++) r(); } }
    else for (let k = 0; k < 40; k++) r();
    x += w + 0.05 + r() * 0.2; }
}
function tree(c: Ctx, x: number, base: number, h: number, col: string, ink: string) {
  c.fillStyle = shade(col, -0.45); c.fillRect(x - 0.09 * h, base - h * 0.55, 0.18 * h, h * 0.55);
  for (const [dx, dy, r] of [[0, -0.75, 0.38], [-0.26, -0.58, 0.28], [0.26, -0.58, 0.28]] as const) { c.beginPath(); c.arc(x + dx * h, base + dy * h, r * h, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
  void ink;
}

/** Dibuja el escenario con paralaje: las capas lejanas se desplazan menos que la cámara. */
export function drawSet(c: Ctx, set: SetSpec, v: View, t: number, images: Record<string, unknown>) {
  const p = PAL[set.timeOfDay]; const par = (k: number) => (v.cx - WORLD_W / 2) * k;
  if (set.preset === "image" && set.imageId && images[set.imageId]) {
    const img = images[set.imageId] as { width: number; height: number }; const ar = img.width / img.height; const w = Math.max(WORLD_W + 3, WORLD_H * ar * 1.1), h = w / ar;
    c.drawImage(img as never, WORLD_W / 2 - w / 2 + par(0.5), WORLD_H / 2 - h / 2, w, h); return;
  }
  sky(c, p, v); stars(c, set.seed, v, set.timeOfDay);
  if (set.timeOfDay === "night" && set.preset !== "room") { c.fillStyle = "#f3efd8"; c.beginPath(); c.arc(12.4 + par(0.8), 1.6, 0.55, 0, Math.PI * 2); c.fill(); c.fillStyle = p.s0; c.beginPath(); c.arc(12.65 + par(0.8), 1.5, 0.5, 0, Math.PI * 2); c.fill(); }
  const win = set.timeOfDay === "day" ? null : p.light;
  switch (set.preset) {
    case "city": skyline(c, set.seed, p.far, GROUND_Y, 2.2, 4.6, v, null, par(0.8)); skyline(c, set.seed + 1, p.mid, GROUND_Y, 1.8, 4, v, win, par(0.45)); skyline(c, set.seed + 2, p.near, GROUND_Y + 0.15, 1.2, 3, v, win, par(0.1)); ground(c, p, v);
      c.strokeStyle = "rgba(255,255,255,0.18)"; c.setLineDash([0.6, 0.6]); c.lineWidth = 0.06; c.beginPath(); c.moveTo(v.l - 1, 8.2); c.lineTo(v.r + 1, 8.2); c.stroke(); c.setLineDash([]); break;
    case "street": skyline(c, set.seed, p.far, GROUND_Y, 2.6, 5, v, null, par(0.7)); skyline(c, set.seed + 3, p.near, GROUND_Y, 3, 5.4, v, win, par(0.15)); ground(c, p, v, shade(p.ground, 0.05));
      for (const x of [3, 9.5, 15]) { c.fillStyle = "#10131a"; c.fillRect(x + par(0.05) - 0.04, 3.4, 0.08, GROUND_Y - 3.4); c.beginPath(); c.arc(x + par(0.05), 3.4, 0.2, 0, Math.PI * 2); c.fillStyle = p.light; c.fill();
        const g = c.createRadialGradient(x + par(0.05), 3.4, 0.1, x + par(0.05), 3.4, 2.2); g.addColorStop(0, set.timeOfDay === "day" ? "rgba(255,244,194,0.1)" : "rgba(255,207,138,0.35)"); g.addColorStop(1, "rgba(255,207,138,0)"); c.fillStyle = g; c.fillRect(x - 3, 1.2, 6, 5); } break;
    case "forest": { c.fillStyle = p.far; c.beginPath(); c.moveTo(v.l - 1, GROUND_Y); for (let x = v.l - 1; x <= v.r + 1; x += 0.5) c.lineTo(x, GROUND_Y - 1.4 - Math.sin((x + par(0.8)) * 0.6 + set.seed) * 0.8); c.lineTo(v.r + 1, GROUND_Y); c.fill();
      const r = rng(set.seed); for (let i = 0; i < 12; i++) tree(c, -2 + i * 1.6 + r() * 0.6 + par(0.45), GROUND_Y, 2.6 + r() * 1.2, p.mid, "#000");
      ground(c, p, v); for (let i = 0; i < 6; i++) tree(c, -2 + i * 3.4 + r() * 1.2 + par(0.05), GROUND_Y + 0.6, 4.6 + r() * 1.4, p.near, "#000"); break; }
    case "rooftop": skyline(c, set.seed, p.far, GROUND_Y + 0.3, 2.4, 4.8, v, null, par(0.8)); skyline(c, set.seed + 1, p.mid, GROUND_Y + 0.5, 1.8, 3.6, v, win, par(0.5)); ground(c, p, v, shade(p.near, 0.05));
      c.fillStyle = shade(p.near, -0.2); c.fillRect(v.l - 1, GROUND_Y - 0.5, v.r - v.l + 2, 0.5); for (const x of [3.2, 12.4]) { c.fillRect(x, 3.6, 0.07, 3); c.fillRect(x - 0.5, 4.1, 1.07, 0.06); } break;
    case "room": { const w = c.createLinearGradient(0, 0, 0, GROUND_Y); w.addColorStop(0, mix(p.near, "#000000", 0.2)); w.addColorStop(1, shade(p.near, 0.08)); c.fillStyle = w; c.fillRect(v.l - 1, v.t - 1, v.r - v.l + 2, GROUND_Y - v.t + 1);
      ground(c, p, v, "#3a2f33"); c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 0.03; for (let x = v.l - 1; x < v.r + 1; x += 1.3) { c.beginPath(); c.moveTo(x, GROUND_Y); c.lineTo(x * 1.6 - 5, v.b); c.stroke(); }
      const wx = 9.4 + par(0.2); c.fillStyle = "#e8e0c8"; c.fillRect(wx - 0.1, 1.5, 3.1, 3.1); c.fillStyle = p.s1; c.fillRect(wx, 1.6, 2.9, 2.9); c.fillStyle = "#e8e0c8"; c.fillRect(wx + 1.4, 1.6, 0.1, 2.9); c.fillRect(wx, 3, 2.9, 0.1);
      if (set.timeOfDay !== "day") { c.fillStyle = "rgba(243,239,216,0.07)"; c.beginPath(); c.moveTo(wx, 4.5); c.lineTo(wx + 2.9, 4.5); c.lineTo(wx + 1.2, v.b); c.lineTo(wx - 2.6, v.b); c.closePath(); c.fill(); }
      c.fillStyle = shade(p.near, -0.3); c.fillRect(1.2 + par(0.1), 2.3, 2.6, 0.12); c.fillRect(1.2 + par(0.1), 3.3, 2.6, 0.12); c.fillStyle = p.light; c.fillRect(1.5 + par(0.1), 1.95, 0.4, 0.35); c.fillStyle = shade(p.far, 0.1); c.fillRect(2.3 + par(0.1), 2.9, 0.5, 0.4); break; }
    default: { ground(c, p, v, shade(p.ground, 0.0)); const r = rng(set.seed); for (let i = 0; i < 9; i++) { const x = r() * WORLD_W + par(0.3 * r()), y = 1 + r() * 5, s = 0.6 + r() * 1.6; const g = c.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, `rgba(233,185,73,${0.1 + r() * 0.12})`); g.addColorStop(1, "rgba(233,185,73,0)"); c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2); } }
  }
}

export function drawProp(c: Ctx, pr: PropSpec, alpha: number, ink: string, accent: string) {
  c.save(); c.globalAlpha *= alpha; c.translate(pr.x, pr.y); c.scale(pr.scale, pr.scale); c.lineWidth = 0.05; c.strokeStyle = ink; c.lineJoin = "round";
  const fl = (col: string) => { c.fillStyle = col; c.fill(); c.stroke(); };
  switch (pr.kind) {
    case "box": c.beginPath(); c.rect(-0.45, -0.7, 0.9, 0.7); fl("#8a6a45"); c.beginPath(); c.moveTo(-0.45, -0.45); c.lineTo(0.45, -0.45); c.stroke(); break;
    case "lantern": c.beginPath(); c.rect(-0.18, -0.55, 0.36, 0.5); fl(accent); c.beginPath(); c.moveTo(-0.14, -0.55); c.quadraticCurveTo(0, -0.95, 0.14, -0.55); c.stroke(); { const g = c.createRadialGradient(0, -0.3, 0.05, 0, -0.3, 1.3); g.addColorStop(0, "rgba(233,185,73,0.45)"); g.addColorStop(1, "rgba(233,185,73,0)"); c.fillStyle = g; c.fillRect(-1.4, -1.6, 2.8, 2.8); } break;
    case "door": c.beginPath(); c.rect(-0.5, -1.7, 1, 1.7); fl("#5a4636"); c.beginPath(); c.arc(0.3, -0.85, 0.05, 0, Math.PI * 2); c.fillStyle = accent; c.fill(); break;
    case "sign": c.beginPath(); c.rect(-0.04, -1.1, 0.08, 1.1); fl("#4a3a2c"); c.beginPath(); c.rect(-0.55, -1.5, 1.1, 0.5); fl("#d8c9a3"); break;
    case "star": c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 0.2 : 0.45; c.lineTo(Math.cos(a) * r, Math.sin(a) * r - 0.5); } c.closePath(); fl(accent); break;
    case "moon": c.beginPath(); c.arc(0, -0.5, 0.45, 0, Math.PI * 2); fl("#f3efd8"); break;
    case "tree": c.beginPath(); c.rect(-0.1, -0.7, 0.2, 0.7); fl("#5a4636"); c.beginPath(); c.arc(0, -1.1, 0.55, 0, Math.PI * 2); fl("#4d7a55"); break;
    default: c.beginPath(); c.rect(-0.03, -1.9, 0.06, 1.9); fl("#2b2f3a"); c.beginPath(); c.arc(0, -1.9, 0.2, 0, Math.PI * 2); fl(accent);
  }
  c.restore();
}
