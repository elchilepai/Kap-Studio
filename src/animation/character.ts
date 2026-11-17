import type { ActorState, Appearance, Expression, Gesture } from "./types.ts";
import { clamp, lerp, shade } from "./util.ts";

export type Ctx = CanvasRenderingContext2D;
export type Pose = {
  bob: number; lean: number; headTilt: number; headDip: number; lookX: number;
  armF: [number, number]; armB: [number, number]; legF: number; legB: number; shrug: number; blink: number; mouth: number; expression: Expression;
};

/**
 * Personaje de «recortes» plano y articulado (cut-out): cada parte se dibuja con su pivote. El aspecto sale
 * SIEMPRE del diseño guardado en la biblia (Appearance), por eso es idéntico en el episodio 1 y en el 10.
 * Convención de ángulos: 0 = colgando, positivo = hacia delante (el personaje mira a +x; la reflexión se hace aparte).
 */
const rr = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  const k = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + w - k, y); c.quadraticCurveTo(x + w, y, x + w, y + k); c.lineTo(x + w, y + h - k);
  c.quadraticCurveTo(x + w, y + h, x + w - k, y + h); c.lineTo(x + k, y + h); c.quadraticCurveTo(x, y + h, x, y + h - k); c.lineTo(x, y + k); c.quadraticCurveTo(x, y, x + k, y); c.closePath();
};
const fs = (c: Ctx, fill: string, ink: string, lw: number) => { c.fillStyle = fill; c.fill(); if (lw > 0) { c.strokeStyle = ink; c.lineWidth = lw; c.lineJoin = "round"; c.stroke(); } };
const limb = (c: Ctx, x: number, y: number, a: number, len: number, w: number, col: string, ink: string, lw: number) => {
  const ex = x + Math.sin(a) * len, ey = y + Math.cos(a) * len; c.lineCap = "round";
  c.strokeStyle = ink; c.lineWidth = w + lw * 2; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke(); return [ex, ey] as const;
};

export function restPose(): Pose { return { bob: 0, lean: 0, headTilt: 0, headDip: 0, lookX: 0, armF: [0.08, 0.12], armB: [-0.08, 0.1], legF: 0, legB: 0, shrug: 0, blink: 0, mouth: 0, expression: "neutral" }; }

/** Calcula la pose a partir del estado de la línea de tiempo. Determinista (solo depende de t y del estado). */
export function poseFor(s: ActorState, t: number, seed: number): Pose {
  const p = restPose(); const off = (seed % 97) / 17;
  p.bob = Math.sin((t + off) * 2.1) * 0.006; p.headTilt = Math.sin((t + off) * 0.9) * 0.015;
  p.armF = [0.08 + Math.sin((t + off) * 1.7) * 0.03, 0.14]; p.armB = [-0.08 - Math.sin((t + off) * 1.5) * 0.03, 0.1];
  const bp = (t + off) % 3.6; p.blink = bp > 3.45 ? 1 - Math.abs(bp - 3.525) / 0.075 : 0; p.blink = clamp(p.blink, 0, 1);
  if (s.moving) {
    const k = s.moving === 2 ? 1.5 : 1, ph = s.walkPhase * Math.PI * 2 * (s.moving === 2 ? 0.8 : 1);
    p.legF = Math.sin(ph) * 0.55 * k; p.legB = -Math.sin(ph) * 0.55 * k;
    p.armF = [-Math.sin(ph) * 0.5 * k, 0.25 + 0.2 * k]; p.armB = [Math.sin(ph) * 0.5 * k, 0.2 + 0.2 * k];
    p.bob = Math.abs(Math.sin(ph)) * 0.014 * k; p.lean = 0.06 * k;
  }
  if (s.speaking) { p.mouth = s.mouth; p.headTilt += Math.sin(t * 5.3) * 0.02; p.headDip = Math.max(0, s.mouth - 0.3) * 0.006; if (!s.moving && s.gesture === "none") p.armF = [0.25 + Math.sin(t * 3.1) * 0.2, 0.9 + Math.sin(t * 4.3) * 0.25]; }
  const g = Math.sin(Math.PI * clamp(s.gestureP, 0, 1)); const gs: Gesture = s.gesture;
  if (gs === "wave") p.armF = [lerp(p.armF[0], 2.7, g), 0.2 + Math.sin(s.gestureP * Math.PI * 7) * 0.55 * g];
  else if (gs === "point") p.armF = [lerp(p.armF[0], 1.55, g), lerp(p.armF[1], 0.05, g)];
  else if (gs === "raise") { p.armF = [lerp(p.armF[0], 2.9, g), 0.1]; p.armB = [lerp(p.armB[0], -2.9, g), 0.1]; }
  else if (gs === "shrug") { p.armF = [lerp(p.armF[0], 0.9, g), lerp(p.armF[1], 1.3, g)]; p.armB = [lerp(p.armB[0], -0.9, g), lerp(p.armB[1], -1.3, g)]; p.shrug = g * 0.025; p.headTilt += g * 0.12; }
  else if (gs === "nod") p.headDip += Math.sin(s.gestureP * Math.PI * 5) * 0.018 * g;
  else if (gs === "shake") p.lookX = Math.sin(s.gestureP * Math.PI * 6) * g;
  else if (gs === "think") { p.armF = [lerp(p.armF[0], 2.2, g), lerp(p.armF[1], 2.2, g)]; p.headTilt += 0.1 * g; }
  p.expression = s.expression; return p;
}

export function drawCharacter(c: Ctx, a: Appearance, pose: Pose, o: { ink: string; line: number; facing: 1 | -1; shadow: boolean; alpha: number }) {
  const hh = 3.0 * a.height, b = a.build, lw = o.line; const ink = o.ink;
  c.save(); c.globalAlpha *= o.alpha; c.scale(o.facing, 1);
  if (o.shadow) { c.fillStyle = "rgba(0,0,0,0.28)"; c.beginPath(); c.ellipse(0, 0.03, hh * 0.2, hh * 0.035, 0, 0, Math.PI * 2); c.fill(); }
  c.translate(0, -pose.bob * hh); c.rotate(pose.lean);
  const hipY = -0.46 * hh, shY = -0.8 * hh, W = 0.15 * hh * b;
  const skin = a.skin, skinD = shade(a.skin, -0.12), pants = a.bottom, top = a.top;

  // brazo trasero y mochila (detrás del torso)
  if (a.accessory === "backpack") { rr(c, -W * 1.75, shY + 0.02 * hh, W * 0.95, 0.27 * hh, 0.04 * hh); fs(c, shade(a.accent, -0.15), ink, lw); }
  const shB = [-W * 0.92, shY + 0.035 * hh] as const, shF = [W * 0.92, shY + 0.035 * hh] as const;
  const arm = (sh: readonly [number, number], ang: [number, number], back: boolean) => {
    const sleeve = back ? shade(top, -0.18) : top, w = 0.068 * hh;
    const [ex, ey] = limb(c, sh[0], sh[1] - pose.shrug * hh, ang[0], 0.18 * hh, w, sleeve, ink, lw);
    const [hx, hy] = limb(c, ex, ey, ang[0] + ang[1], 0.165 * hh, w * 0.92, back ? skinD : skin, ink, lw);
    c.beginPath(); c.arc(hx, hy, w * 0.62, 0, Math.PI * 2); fs(c, back ? skinD : skin, ink, lw);
  };
  arm(shB, pose.armB, true);
  // piernas
  const leg = (xo: number, ang: number, col: string) => {
    const hx = xo, hy = hipY + 0.02 * hh, w = 0.082 * hh * b;
    const [kx, ky] = limb(c, hx, hy, ang * 0.9, 0.225 * hh, w, col, ink, lw);
    const [fx, fy] = limb(c, kx, ky, ang * 0.9 - Math.max(0, -ang) * 0.9, 0.215 * hh, w * 0.95, col, ink, lw);
    c.beginPath(); c.ellipse(fx + 0.025 * hh, fy + 0.005 * hh, 0.062 * hh, 0.03 * hh, 0, 0, Math.PI * 2); fs(c, a.shoes, ink, lw);
  };
  leg(-W * 0.42, pose.legB, shade(pants, -0.2)); leg(W * 0.42, pose.legF, pants);
  // torso
  c.beginPath(); c.moveTo(-W, shY); c.quadraticCurveTo(-W * 1.08, (shY + hipY) / 2, -W * 0.92, hipY + 0.04 * hh); c.lineTo(W * 0.92, hipY + 0.04 * hh);
  c.quadraticCurveTo(W * 1.08, (shY + hipY) / 2, W, shY); c.quadraticCurveTo(0, shY - 0.03 * hh, -W, shY); c.closePath(); fs(c, top, ink, lw);
  c.beginPath(); c.rect(-W * 0.92, hipY - 0.045 * hh, W * 1.84, 0.045 * hh + 0.04 * hh); fs(c, shade(pants, -0.05), ink, lw);  // cintura
  c.fillStyle = a.accent; c.fillRect(-W * 0.9, shY + 0.16 * hh, W * 1.8, 0.035 * hh);                                           // franja de color
  arm(shF, pose.armF, false);
  if (a.accessory === "scarf") { rr(c, -W * 0.7, shY - 0.025 * hh, W * 1.4, 0.05 * hh, 0.025 * hh); fs(c, a.accent, ink, lw); rr(c, W * 0.15, shY, 0.045 * hh, 0.15 * hh, 0.02 * hh); fs(c, a.accent, ink, lw); }

  // cuello + cabeza
  const rH = 0.118 * hh, hx = 0, hy = shY - rH * 1.02 + pose.headDip * hh;
  c.fillStyle = skinD; c.fillRect(-0.03 * hh, shY - 0.045 * hh, 0.06 * hh, 0.06 * hh);
  c.save(); c.translate(0, shY - 0.02 * hh); c.rotate(pose.headTilt); c.translate(0, -(shY - 0.02 * hh));
  // pelo trasero
  if (a.hairStyle === "long") { rr(c, -rH * 1.5, hy - rH * 0.8, rH * 1.55, rH * 2.9, rH * 0.75); fs(c, shade(a.hairColor, -0.1), ink, lw); }  // melena caída hacia atrás
  if (a.hairStyle === "bun") { c.beginPath(); c.arc(0, hy - rH * 1.2, rH * 0.42, 0, Math.PI * 2); fs(c, a.hairColor, ink, lw); }
  if (a.accessory === "hat") { /* el sombrero va delante */ }
  c.beginPath(); c.ellipse(hx, hy, rH * 1.02, rH * 1.08, 0, 0, Math.PI * 2); fs(c, skin, ink, lw);
  c.beginPath(); c.ellipse(rH * 1.0, hy + rH * 0.05, rH * 0.16, rH * 0.2, 0, 0, Math.PI * 2); fs(c, skin, ink, lw * 0.8);   // oreja
  // pelo delantero
  const hair = a.hairColor;
  if (a.hairStyle !== "bald" && a.hairStyle !== "cap") {
    c.beginPath(); c.moveTo(-rH * 1.04, hy - rH * 0.1); c.quadraticCurveTo(-rH * 1.1, hy - rH * 1.2, 0, hy - rH * 1.18); c.quadraticCurveTo(rH * 1.15, hy - rH * 1.1, rH * 1.04, hy - rH * 0.15);
    c.quadraticCurveTo(rH * 0.5, hy - rH * 0.62, -rH * 0.2, hy - rH * 0.5); c.quadraticCurveTo(-rH * 0.8, hy - rH * 0.45, -rH * 1.04, hy - rH * 0.1); c.closePath(); fs(c, hair, ink, lw);
  }
  if (a.hairStyle === "spiky") for (let i = 0; i < 5; i++) { const x0 = -rH * 0.85 + i * rH * 0.42; c.beginPath(); c.moveTo(x0, hy - rH * 1.05); c.lineTo(x0 + rH * 0.2, hy - rH * (1.65 + (i % 2) * 0.25)); c.lineTo(x0 + rH * 0.45, hy - rH * 1.05); c.closePath(); fs(c, hair, ink, lw); }
  // cara
  const ex = 0.46 * rH, ey = hy + rH * 0.02, look = pose.lookX * rH * 0.12 + rH * 0.12;
  const e = pose.expression, open = e === "surprised" ? 1.25 : e === "happy" ? 0.55 : e === "angry" ? 0.7 : 1, bl = 1 - pose.blink * 0.92;
  for (const sx of [-1, 1]) {
    const x = sx * ex + rH * 0.12;
    if (e === "happy" && !pose.blink) { c.strokeStyle = ink; c.lineWidth = lw * 1.6; c.lineCap = "round"; c.beginPath(); c.arc(x, ey + rH * 0.05, rH * 0.2, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); }
    else {
      c.beginPath(); c.ellipse(x, ey, rH * 0.2, rH * 0.26 * open * bl, 0, 0, Math.PI * 2); fs(c, "#ffffff", ink, lw * 0.7);
      if (bl > 0.25) { c.beginPath(); c.arc(x + look, ey + rH * 0.02, rH * 0.13 * Math.min(1, bl + 0.2), 0, Math.PI * 2); c.fillStyle = a.eyeColor; c.fill(); c.beginPath(); c.arc(x + look, ey + rH * 0.02, rH * 0.065, 0, Math.PI * 2); c.fillStyle = "#101216"; c.fill(); c.beginPath(); c.arc(x + look + rH * 0.04, ey - rH * 0.04, rH * 0.032, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); }
    }
    // cejas
    const raise = e === "surprised" ? -0.2 : e === "happy" ? -0.1 : e === "angry" ? 0.1 : -0.03; const tilt = (e === "angry" ? 0.42 : e === "sad" || e === "worried" ? -0.4 : e === "thinking" && sx > 0 ? -0.25 : 0) * -sx;
    c.save(); c.translate(x, ey - rH * (0.44 - raise)); c.rotate(tilt); c.strokeStyle = shade(hair === "none" ? "#3a2b22" : hair, -0.3); c.lineWidth = lw * 2.1; c.lineCap = "round"; c.beginPath(); c.moveTo(-rH * 0.2, 0); c.lineTo(rH * 0.2, 0); c.stroke(); c.restore();
  }
  if (a.accessory === "glasses") { c.strokeStyle = ink; c.lineWidth = lw * 1.3; for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * ex + rH * 0.12, ey, rH * 0.3, 0, Math.PI * 2); c.stroke(); } c.beginPath(); c.moveTo(-ex + rH * 0.42, ey); c.lineTo(ex - rH * 0.18, ey); c.stroke(); }
  // nariz y boca
  c.strokeStyle = shade(skin, -0.28); c.lineWidth = lw * 0.9; c.lineCap = "round"; c.beginPath(); c.moveTo(rH * 0.18, hy + rH * 0.12); c.quadraticCurveTo(rH * 0.34, hy + rH * 0.3, rH * 0.14, hy + rH * 0.34); c.stroke();
  const mx = rH * 0.12, my = hy + rH * 0.62;
  if (pose.mouth > 0.08) { c.beginPath(); c.ellipse(mx, my, rH * (0.2 + pose.mouth * 0.12), rH * (0.05 + pose.mouth * 0.28), 0, 0, Math.PI * 2); fs(c, "#5a1f2b", ink, lw * 0.8); if (pose.mouth > 0.45) { c.beginPath(); c.ellipse(mx, my + rH * 0.12, rH * 0.14, rH * 0.07, 0, 0, Math.PI); c.fillStyle = "#c45a6a"; c.fill(); } }
  else { c.strokeStyle = ink; c.lineWidth = lw * 1.4; c.lineCap = "round"; c.beginPath();
    if (e === "happy") c.arc(mx, my - rH * 0.12, rH * 0.28, Math.PI * 0.1, Math.PI * 0.9);
    else if (e === "sad" || e === "worried") c.arc(mx, my + rH * 0.28, rH * 0.22, Math.PI * 1.15, Math.PI * 1.85);
    else if (e === "surprised") { c.ellipse(mx, my, rH * 0.12, rH * 0.17, 0, 0, Math.PI * 2); }
    else if (e === "thinking") { c.moveTo(mx - rH * 0.16, my + rH * 0.03); c.lineTo(mx + rH * 0.2, my - rH * 0.05); }
    else { c.moveTo(mx - rH * 0.2, my); c.lineTo(mx + rH * 0.2, my); }
    c.stroke(); }
  if (a.hairStyle === "cap" || a.accessory === "hat") {
    const col = a.hairStyle === "cap" ? a.accent : shade(a.accent, -0.1);
    c.beginPath(); c.moveTo(-rH * 1.06, hy - rH * 0.2); c.quadraticCurveTo(-rH * 1.0, hy - rH * 1.45, 0, hy - rH * 1.42); c.quadraticCurveTo(rH * 1.1, hy - rH * 1.35, rH * 1.06, hy - rH * 0.2); c.closePath(); fs(c, col, ink, lw);
    c.beginPath(); c.ellipse(rH * 0.95, hy - rH * 0.22, rH * 0.7, rH * 0.14, 0, 0, Math.PI * 2); fs(c, shade(col, -0.18), ink, lw);
  }
  c.restore(); c.restore();
}
