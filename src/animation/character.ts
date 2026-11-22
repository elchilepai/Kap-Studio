import type { ActionExpression, ActionPose, ActorState, Appearance, Gesture, Viseme, Ctx } from "./types.ts";
import { clamp, lerp, shade } from "./util.ts";
import { drawLayered } from "./rig.ts";
export type { Ctx };

export type HandShape = "relaxed" | "open" | "fist" | "point";
export type Pose = {
  bob: number; lean: number; headTilt: number; headDip: number; lookX: number;
  armF: [number, number]; armB: [number, number]; handF: HandShape; handB: HandShape; legF: number; legB: number;
  shrug: number; blink: number; mouth: number; viseme: Viseme; expression: ActionExpression;
};

/**
 * PERSONAJE 2D ARTICULADO («recortes»). Hay dos implementaciones con el MISMO modelo de pose:
 *  · paramétrica (vector): el aspecto sale del diseño guardado → idéntico en cualquier episodio;
 *  · por capas (PNG propios): ver rig.ts.
 * Convención de ángulos: 0 = colgando, positivo = hacia delante; la reflexión (mirar a la izquierda) se hace aparte.
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

export function restPose(): Pose { return { bob: 0, lean: 0, headTilt: 0, headDip: 0, lookX: 0, armF: [0.08, 0.12], armB: [-0.08, 0.1], handF: "relaxed", handB: "relaxed", legF: 0, legB: 0, shrug: 0, blink: 0, mouth: 0, viseme: "rest", expression: "neutral" }; }

/** Catálogo de poses estáticas (objetivo de cada una). Se mezclan con suavidad desde la pose anterior. */
export const POSE_CATALOG: Record<ActionPose, Partial<Pose>> = {
  idle: {},
  arms_crossed: { armF: [0.3, -1.85], armB: [-0.3, 1.85], handF: "fist", handB: "fist", headTilt: 0.03 },   // los antebrazos cruzan el pecho
  hands_hips: { armF: [0.85, -1.5], armB: [-0.85, 1.5], handF: "fist", handB: "fist" },
  pointing: { armF: [1.55, 0.05], handF: "point" },
  thinking: { armF: [2.2, 2.2], handF: "fist", headTilt: 0.1, lookX: 0.6 },
  facepalm: { armF: [2.5, 1.2], handF: "open", headDip: 0.012, headTilt: 0.12 },
  cheer: { armF: [2.9, 0.1], armB: [-2.9, 0.1], handF: "open", handB: "open" },
  shrug: { armF: [0.9, 1.3], armB: [-0.9, -1.3], handF: "open", handB: "open", shrug: 0.025, headTilt: 0.12 },
  crouch: { lean: 0.5, bob: -0.04, armF: [0.9, 0.5], armB: [0.7, 0.5], handF: "open", handB: "open", legF: 0.35, legB: -0.2, headTilt: 0.1 },   // se agacha / recoge / planta
  reach: { lean: 0.22, armF: [1.6, 0.2], armB: [0.5, 0.3], handF: "open", legF: 0.15 },   // alcanza / agarra / abre / empuja
  throw: { lean: -0.12, armF: [2.6, 0.3], armB: [-0.5, 0.2], handF: "fist", legF: 0.2, legB: -0.15 },   // lanza
  settle: { bob: -0.012, lean: -0.03, armF: [0.18, 0.25], armB: [-0.18, 0.2] },   // al llegar: pequeño asentamiento (rodillas que ceden un poco)
  listen: { lean: -0.06, headTilt: 0.1, lookX: 0.5, headDip: -0.01, armF: [0.12, 0.2], armB: [-0.1, 0.15] },   // escucha: se queda quieto, la cabeza se levanta y gira
  shrink: { lean: -0.1, bob: -0.02, armF: [0.35, 0.9], armB: [-0.35, 0.9], handF: "fist", handB: "fist", shrug: 0.03, headDip: 0.01, headTilt: 0.08 },   // se encoge
  droop: { lean: 0.08, headDip: 0.014, headTilt: 0.06, armF: [0.05, 0.1], armB: [-0.05, 0.1], bob: -0.014 },   // baja la mirada / se desinfla
  tense: { lean: 0.05, armF: [0.6, 1.5], armB: [-0.6, 1.5], handF: "fist", handB: "fist", shrug: 0.012 },   // aprieta lo que tiene / se tensa
  recoil: { lean: -0.25, armF: [0.6, 0.9], armB: [-0.6, 0.9], handF: "open", handB: "open", legF: -0.2, legB: 0.2, headTilt: -0.08 },   // retrocede
};
/** Animaciones disponibles para un personaje paramétrico (un rig por capas declara las suyas). */
export const ANIMATIONS = ["idle", "walk", "run", "talk", "wave", "point", "shrug", "nod", "shake", "think", "raise", ...Object.keys(POSE_CATALOG).filter((k) => k !== "idle")] as const;
export const availableAnimations = (a: Appearance): string[] => (a.rig?.kind === "layered" ? a.rig.animations ?? ["idle", "walk", "talk"] : [...new Set(ANIMATIONS)]);

const visemeOf = (m: number): Viseme => (m < 0.1 ? "rest" : m < 0.3 ? "I" : m < 0.6 ? "E" : "A");

/** Pose a partir del estado de la línea de tiempo. Determinista: solo depende de t y del estado. */
export function poseFor(s: ActorState, t: number, seed: number): Pose {
  const p = restPose(); const off = (seed % 97) / 17;
  p.bob = Math.sin((t + off) * 2.1) * 0.006; p.headTilt = Math.sin((t + off) * 0.9) * 0.015;
  p.armF = [0.08 + Math.sin((t + off) * 1.7) * 0.03, 0.14]; p.armB = [-0.08 - Math.sin((t + off) * 1.5) * 0.03, 0.1];
  const bp = (t + off) % 3.6; p.blink = clamp(bp > 3.45 ? 1 - Math.abs(bp - 3.525) / 0.075 : 0, 0, 1);
  const applyPose = (name: ActionPose, k: number) => { const tgt = POSE_CATALOG[name]; const mix = (a: [number, number], b?: [number, number]): [number, number] => (b ? [lerp(a[0], b[0], k), lerp(a[1], b[1], k)] : a);
    p.armF = mix(p.armF, tgt.armF); p.armB = mix(p.armB, tgt.armB); p.headTilt += (tgt.headTilt ?? 0) * k; p.headDip += (tgt.headDip ?? 0) * k; p.lookX = (tgt.lookX ?? 0) * k; p.shrug = (tgt.shrug ?? 0) * k; if (k > 0.5) { p.handF = tgt.handF ?? p.handF; p.handB = tgt.handB ?? p.handB; }
    p.lean += (tgt.lean ?? 0) * k; p.bob += (tgt.bob ?? 0) * k; p.legF += (tgt.legF ?? 0) * k; p.legB += (tgt.legB ?? 0) * k; };
  if (s.pose2 && s.pose2P) applyPose(s.pose2, s.pose2P);   // flow: la pose que se va (peso decreciente) y después la que entra
  if (s.pose !== "idle") applyPose(s.pose, s.poseP);
  if (s.moving) {
    const k = s.moving === 2 ? 1.5 : 1, ph = s.walkPhase * Math.PI * 2 * (s.moving === 2 ? 0.8 : 1), w = 0.35 + 0.65 * s.speed;   // el paso y el braceo crecen con la velocidad: peso al arrancar y al frenar
    p.legF = Math.sin(ph) * 0.55 * k * w; p.legB = -Math.sin(ph) * 0.55 * k * w;
    p.armF = [-Math.sin(ph) * 0.5 * k * w, 0.25 + 0.2 * k]; p.armB = [Math.sin(ph) * 0.5 * k * w, 0.2 + 0.2 * k];
    p.bob = Math.abs(Math.sin(ph)) * 0.014 * k * w; p.lean = (0.025 + 0.07 * s.speed) * k; if (s.moving === 2) { p.handF = "fist"; p.handB = "fist"; }
    if (s.moveP !== undefined) {   // flow (Shorts): sin saltos al arrancar ni al parar; se inclina hacia atrás un instante (anticipación), acelera inclinado hacia delante y se endereza al frenar
      const g = clamp(s.speed * 1.7, 0, 1), anti = Math.max(0, 1 - s.moveP / 0.14), brake = Math.max(0, (s.moveP - 0.82) / 0.18);
      p.legF = Math.sin(ph) * 0.55 * k * g; p.legB = -Math.sin(ph) * 0.55 * k * g; p.armF = [-Math.sin(ph) * 0.5 * k * g, 0.12 + 0.33 * k * g]; p.armB = [Math.sin(ph) * 0.5 * k * g, 0.1 + 0.3 * k * g];
      p.bob = Math.abs(Math.sin(ph)) * 0.014 * k * g; p.lean = 0.085 * k * s.speed - 0.05 * anti - 0.03 * brake; p.headDip = 0.004 * g; }
  }
  if (s.speaking) { p.mouth = s.mouth; p.viseme = s.viseme; p.headTilt += Math.sin(t * 5.3) * 0.02; p.headDip = Math.max(p.headDip, Math.max(0, s.mouth - 0.3) * 0.006);
    if (!s.moving && s.gesture === "none" && s.pose === "idle") { p.armF = [0.25 + Math.sin(t * 3.1) * 0.2, 0.9 + Math.sin(t * 4.3) * 0.25]; p.handF = "open"; } }
  const g = Math.sin(Math.PI * clamp(s.gestureP, 0, 1)); const gs: Gesture = s.gesture;
  if (gs === "wave") { p.armF = [lerp(p.armF[0], 2.7, g), 0.2 + Math.sin(s.gestureP * Math.PI * 7) * 0.55 * g]; p.handF = "open"; }
  else if (gs === "point") { p.armF = [lerp(p.armF[0], 1.55, g), lerp(p.armF[1], 0.05, g)]; p.handF = "point"; }
  else if (gs === "raise") { p.armF = [lerp(p.armF[0], 2.9, g), 0.1]; p.armB = [lerp(p.armB[0], -2.9, g), 0.1]; p.handF = p.handB = "open"; }
  else if (gs === "shrug") { p.armF = [lerp(p.armF[0], 0.9, g), lerp(p.armF[1], 1.3, g)]; p.armB = [lerp(p.armB[0], -0.9, g), lerp(p.armB[1], -1.3, g)]; p.shrug = g * 0.025; p.headTilt += g * 0.12; p.handF = p.handB = "open"; }
  else if (gs === "nod") p.headDip += Math.sin(s.gestureP * Math.PI * 5) * 0.018 * g;
  else if (gs === "shake") p.lookX = Math.sin(s.gestureP * Math.PI * 6) * g;
  else if (gs === "think") { p.armF = [lerp(p.armF[0], 2.2, g), lerp(p.armF[1], 2.2, g)]; p.headTilt += 0.1 * g; p.handF = "fist"; }
  p.expression = s.expression; if (!s.speaking) p.viseme = visemeOf(0); return p;
}

function hand(c: Ctx, x: number, y: number, ang: number, shape: HandShape, w: number, col: string, ink: string, lw: number) {
  c.save(); c.translate(x, y); c.rotate(-ang);
  const r = w * 0.62;
  if (shape === "fist") { c.beginPath(); c.arc(0, r * 0.3, r * 0.95, 0, Math.PI * 2); fs(c, col, ink, lw); c.strokeStyle = shade(col, -0.3); c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(-r * 0.4, r * 0.6); c.lineTo(r * 0.4, r * 0.6); c.stroke(); }
  else {
    c.beginPath(); c.ellipse(0, r * 0.5, r * 0.85, r * 1.05, 0, 0, Math.PI * 2); fs(c, col, ink, lw);
    c.beginPath(); c.ellipse(-r * 0.85, r * 0.35, r * 0.34, r * 0.55, 0.5, 0, Math.PI * 2); fs(c, col, ink, lw);                // pulgar
    if (shape === "point") { c.lineCap = "round"; c.strokeStyle = ink; c.lineWidth = w * 0.3 + lw * 2; c.beginPath(); c.moveTo(r * 0.3, r * 0.9); c.lineTo(r * 0.3, r * 2.1); c.stroke(); c.strokeStyle = col; c.lineWidth = w * 0.3; c.beginPath(); c.moveTo(r * 0.3, r * 0.9); c.lineTo(r * 0.3, r * 2.1); c.stroke(); }
    else if (shape === "open") for (const dx of [-0.35, 0.15, 0.6]) { c.lineCap = "round"; c.strokeStyle = ink; c.lineWidth = w * 0.26 + lw * 2; c.beginPath(); c.moveTo(r * dx, r * 1.1); c.lineTo(r * dx * 1.2, r * 1.9); c.stroke(); c.strokeStyle = col; c.lineWidth = w * 0.26; c.beginPath(); c.moveTo(r * dx, r * 1.1); c.lineTo(r * dx * 1.2, r * 1.9); c.stroke(); }
  }
  c.restore();
}

function mouth(c: Ctx, v: Viseme, open: number, e: ActionExpression, rH: number, mx: number, my: number, ink: string, lw: number) {
  const o = clamp(open, 0, 1);
  const ell = (rx: number, ry: number, fill = "#5a1f2b") => { c.beginPath(); c.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2); fs(c, fill, ink, lw * 0.8); };
  const tongue = (dy: number) => { c.beginPath(); c.ellipse(mx, my + dy, rH * 0.14, rH * 0.07, 0, 0, Math.PI); c.fillStyle = "#c45a6a"; c.fill(); };
  switch (v) {
    case "A": ell(rH * (0.2 + o * 0.1), rH * (0.1 + o * 0.28)); if (o > 0.45) tongue(rH * 0.1); return;
    case "E": ell(rH * (0.28 + o * 0.06), rH * (0.06 + o * 0.14)); return;
    case "I": ell(rH * 0.3, rH * (0.035 + o * 0.08)); c.strokeStyle = "#ffffff"; c.lineWidth = lw * 0.9; c.beginPath(); c.moveTo(mx - rH * 0.22, my - rH * 0.02); c.lineTo(mx + rH * 0.22, my - rH * 0.02); c.stroke(); return;
    case "O": ell(rH * (0.12 + o * 0.06), rH * (0.12 + o * 0.12)); return;
    case "U": ell(rH * 0.1, rH * (0.09 + o * 0.05)); return;
    case "WQ": ell(rH * 0.09, rH * 0.09); c.strokeStyle = ink; c.lineWidth = lw * 0.7; c.beginPath(); c.arc(mx, my, rH * 0.15, 0, Math.PI * 2); c.stroke(); return;
    case "FV": c.strokeStyle = ink; c.lineWidth = lw * 1.4; c.lineCap = "round"; c.beginPath(); c.moveTo(mx - rH * 0.2, my); c.lineTo(mx + rH * 0.2, my); c.stroke(); rr(c, mx - rH * 0.12, my - rH * 0.01, rH * 0.24, rH * 0.07, rH * 0.02); fs(c, "#ffffff", ink, lw * 0.5); return;
    case "MBP": c.strokeStyle = ink; c.lineWidth = lw * 2.2; c.lineCap = "round"; c.beginPath(); c.moveTo(mx - rH * 0.2, my); c.lineTo(mx + rH * 0.2, my); c.stroke(); return;
    case "L": ell(rH * 0.2, rH * (0.07 + o * 0.1)); tongue(-rH * 0.01); return;
    default: break;
  }
  c.strokeStyle = ink; c.lineWidth = lw * 1.4; c.lineCap = "round"; c.beginPath();
  if (e === "happy") c.arc(mx, my - rH * 0.12, rH * 0.28, Math.PI * 0.1, Math.PI * 0.9);
  else if (e === "sad" || e === "worried") c.arc(mx, my + rH * 0.28, rH * 0.22, Math.PI * 1.15, Math.PI * 1.85);
  else if (e === "surprised") c.ellipse(mx, my, rH * 0.12, rH * 0.17, 0, 0, Math.PI * 2);
  else if (e === "thinking") { c.moveTo(mx - rH * 0.16, my + rH * 0.03); c.lineTo(mx + rH * 0.2, my - rH * 0.05); }
  else if (e === "angry") { c.moveTo(mx - rH * 0.2, my + rH * 0.04); c.lineTo(mx + rH * 0.2, my - rH * 0.02); }
  else { c.moveTo(mx - rH * 0.2, my); c.lineTo(mx + rH * 0.2, my); }
  c.stroke();
}

/** Parámetros de la cara stickman por expresión de ACTING (ojos, cejas, boca): sencillas pero legibles. Las expresiones de siempre conservan su aspecto. */
const STICK_FACE: Partial<Record<ActionExpression, { eye?: number; down?: number; tilt?: number; tiltL?: number; tiltR?: number; raise?: number; raiseR?: number; mouth?: "o" | "wave" | "zig" | "smile" | "flat"; blush?: boolean; closed?: boolean; lid?: boolean }>> = {
  scared: { eye: 0.22, tilt: -0.5, raise: 0.22, mouth: "o" }, embarrassed: { eye: 0.12, down: 0.14, tilt: -0.25, mouth: "wave", blush: true },
  confused: { tiltL: 0.35, tiltR: -0.1, raiseR: 0.2, mouth: "wave" }, curious: { eye: 0.16, raiseR: 0.22, tiltR: -0.2, mouth: "smile" },
  relieved: { closed: true, tilt: -0.15, mouth: "smile" }, uncomfortable: { tilt: -0.2, down: 0.05, mouth: "zig" }, bored: { lid: true, eye: 0.12, mouth: "flat" },
};
const BODY_W = { slim: 0.86, regular: 1, broad: 1.2 } as const;

/** Luminancia aproximada (0..1) de un color #rrggbb: el trazo del stickman se aclara si es demasiado oscuro para verse sobre el fondo. */
const luma = (hex: string) => { const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

/**
 * STICKMAN 2D (estilo por defecto): cabeza redonda y cuerpo y extremidades de trazo. Usa EXACTAMENTE la misma pose que el personaje
 * completo (mismos brazos, piernas, inclinación, expresión y visemas), así que toda la animación existente sirve sin cambios.
 * El color del trazo sale de la ropa del personaje para distinguirlos; la gorra/sombrero se conserva como seña de identidad.
 */
function drawStickman(c: Ctx, a: Appearance, pose: Pose, o: { ink: string; line: number; facing: 1 | -1; shadow: boolean; alpha: number }) {
  // protección defensiva: un diseño incompleto nunca debe romper el render (valores por defecto válidos, sin cambiar el aspecto de los diseños completos)
  const top = typeof a.top === "string" && /^#[0-9a-fA-F]{6}$/.test(a.top) ? a.top : "#E9B949", skin = a.skin ?? "#f1c9a5", accent = a.accent ?? "#ffffff", height = a.height ?? 1, build = a.build ?? 1;
  const hh = 3.0 * height, ink = o.ink, lw = o.line, sw = 0.058 * hh * Math.min(1.15, build);   // cabeza grande y trazo algo más grueso: la cara se lee a 480p
  const col = luma(top) < 0.4 ? shade(top, 0.55) : top;
  c.save(); c.globalAlpha *= o.alpha; c.scale(o.facing, 1);
  if (o.shadow) { c.fillStyle = "rgba(0,0,0,0.28)"; c.beginPath(); c.ellipse(0, 0.03, hh * 0.17, hh * 0.03, 0, 0, Math.PI * 2); c.fill(); }
  c.translate(0, -pose.bob * hh); c.rotate(pose.lean);
  const hipY = -0.40 * hh, shY = -0.68 * hh - pose.shrug * hh * 0.5, rH = 0.15 * hh;
  const seg = (x: number, y: number, ang: number, len: number) => limb(c, x, y, ang, len, sw, col, ink, lw);
  // brazos y piernas: dos tramos con el mismo reparto de ángulos que el personaje completo
  const arm = (ang: [number, number], shape: HandShape) => { const [ex, ey] = seg(0, shY + 0.03 * hh, ang[0], 0.17 * hh); const [hx, hy] = seg(ex, ey, ang[0] + ang[1], 0.16 * hh);
    c.beginPath(); c.arc(hx, hy, sw * (shape === "fist" ? 0.95 : 0.7), 0, Math.PI * 2); fs(c, col, ink, lw); };
  const leg = (ang: number) => { const [kx, ky] = seg(0, hipY, ang * 0.9, 0.20 * hh); const [fx, fy] = seg(kx, ky, ang * 0.9 - Math.max(0, -ang) * 0.9, 0.20 * hh);
    c.strokeStyle = ink; c.lineWidth = sw + lw * 2; c.lineCap = "round"; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 0.07 * hh, fy); c.stroke(); c.strokeStyle = col; c.lineWidth = sw; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 0.07 * hh, fy); c.stroke(); };
  c.save(); c.globalAlpha *= 0.82; arm(pose.armB, pose.handB); leg(pose.legB); c.restore();   // brazo y pierna traseros algo más tenues: dan profundidad sin ensuciar
  c.strokeStyle = ink; c.lineWidth = sw + lw * 2; c.lineCap = "round"; c.beginPath(); c.moveTo(0, hipY); c.lineTo(0, shY); c.stroke(); c.strokeStyle = col; c.lineWidth = sw; c.beginPath(); c.moveTo(0, hipY); c.lineTo(0, shY); c.stroke();
  leg(pose.legF); arm(pose.armF, pose.handF);
  // cabeza
  const hy = shY - rH * 1.12 + pose.headDip * hh; c.save(); c.translate(0, shY); c.rotate(pose.headTilt); c.translate(0, -shY);
  c.beginPath(); c.arc(0, hy, rH, 0, Math.PI * 2); fs(c, skin, ink, lw * 1.3);
  if (a.hairStyle === "cap" || a.accessory === "hat") { const hc = a.hairStyle === "cap" ? accent : shade(accent, -0.1); c.beginPath(); c.arc(0, hy - rH * 0.1, rH * 1.04, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); fs(c, hc, ink, lw); c.beginPath(); c.ellipse(rH * 0.85, hy - rH * 0.12, rH * 0.62, rH * 0.13, 0, 0, Math.PI * 2); fs(c, shade(hc, -0.18), ink, lw); }
  const e = pose.expression, ey = hy + rH * 0.02, look = pose.lookX * rH * 0.12 + rH * 0.14, bl = 1 - pose.blink * 0.9, F = STICK_FACE[e] ?? {};
  for (const sx of [-1, 1]) { const x = sx * rH * 0.42 + rH * 0.12, er = rH * (F.eye ?? (e === "surprised" ? 0.2 : 0.14)) * (0.5 + bl * 0.5);
    if (((e === "happy" || F.closed) && !pose.blink) || bl < 0.2) { c.strokeStyle = ink; c.lineWidth = lw * 1.6; c.lineCap = "round"; c.beginPath(); c.arc(x, ey + rH * 0.04, rH * 0.17, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); }
    else { c.beginPath(); c.arc(x + look * 0.6, ey + (F.down ?? 0) * rH, er, 0, Math.PI * 2); c.fillStyle = ink; c.fill();
      if (F.lid) { c.strokeStyle = ink; c.lineWidth = lw * 1.8; c.lineCap = "round"; c.beginPath(); c.moveTo(x - er * 1.6, ey - er * 0.2); c.lineTo(x + er * 1.6, ey - er * 0.2); c.stroke(); } }
    const base = e === "angry" ? 0.45 : e === "sad" || e === "worried" ? -0.4 : 0, tilt = ((sx < 0 ? F.tiltL : F.tiltR) ?? F.tilt ?? base) * -sx, raise = (F.raise ?? 0) + (sx > 0 ? F.raiseR ?? 0 : 0);
    if (tilt || raise) { c.save(); c.translate(x, ey - rH * (0.36 + raise)); c.rotate(tilt); c.strokeStyle = ink; c.lineWidth = lw * 1.8; c.lineCap = "round"; c.beginPath(); c.moveTo(-rH * 0.2, 0); c.lineTo(rH * 0.2, 0); c.stroke(); c.restore(); }
    if (F.blush) { c.fillStyle = "rgba(232,131,107,0.55)"; c.beginPath(); c.arc(x + sx * rH * 0.1, ey + rH * 0.42, rH * 0.13, 0, Math.PI * 2); c.fill(); } }
  const mx = rH * 0.12, my = hy + rH * 0.55, speaking = pose.viseme !== "rest" || pose.mouth > 0.12;
  if (F.mouth && !speaking) {   // boca de las expresiones de acting (cuando habla manda el visema)
    c.strokeStyle = ink; c.lineWidth = lw * 1.5; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
    if (F.mouth === "o") { c.ellipse(mx, my, rH * 0.12, rH * 0.17, 0, 0, Math.PI * 2); c.fillStyle = "#5a1f2b"; c.fill(); }
    else if (F.mouth === "wave") { c.moveTo(mx - rH * 0.3, my); c.bezierCurveTo(mx - rH * 0.15, my - rH * 0.12, mx - rH * 0.05, my + rH * 0.12, mx + rH * 0.1, my); c.bezierCurveTo(mx + rH * 0.2, my - rH * 0.1, mx + rH * 0.28, my + rH * 0.08, mx + rH * 0.32, my); }
    else if (F.mouth === "zig") { for (let k = 0; k <= 4; k++) { const px = mx - rH * 0.3 + k * rH * 0.15, py = my + (k % 2 ? rH * 0.07 : -rH * 0.07); if (k) c.lineTo(px, py); else c.moveTo(px, py); } }
    else if (F.mouth === "smile") c.arc(mx, my - rH * 0.12, rH * 0.2, Math.PI * 0.15, Math.PI * 0.85);
    else { c.moveTo(mx - rH * 0.22, my); c.lineTo(mx + rH * 0.22, my); }
    c.stroke();
  } else mouth(c, pose.viseme, pose.mouth, e, rH * 1.25, mx, my, ink, lw);
  c.restore(); c.restore();
}

export function drawCharacter(c: Ctx, a: Appearance, pose: Pose, o: { ink: string; line: number; facing: 1 | -1; shadow: boolean; alpha: number }, images?: Record<string, unknown>) {
  if (a.rig?.kind === "layered") { drawLayered(c, a, a.rig, pose, o, images ?? {}); return; }
  if (a.look !== "cutout") { drawStickman(c, a, pose, o); return; }   // por defecto: stickman 2D (el diseño completo anterior se conserva con look: "cutout")
  const hh = 3.0 * a.height, b = a.build * BODY_W[a.body ?? "regular"], lw = o.line; const ink = o.ink;
  c.save(); c.globalAlpha *= o.alpha; c.scale(o.facing, 1);
  if (o.shadow) { c.fillStyle = "rgba(0,0,0,0.28)"; c.beginPath(); c.ellipse(0, 0.03, hh * 0.2, hh * 0.035, 0, 0, Math.PI * 2); c.fill(); }
  c.translate(0, -pose.bob * hh); c.rotate(pose.lean);
  const hipY = -0.46 * hh, shY = -0.8 * hh, W = 0.15 * hh * b;
  const skin = a.skin, skinD = shade(a.skin, -0.12), pants = a.bottom, top = a.top;

  if (a.accessory === "cape") { c.beginPath(); c.moveTo(-W * 0.9, shY); c.quadraticCurveTo(-W * 2.4, (shY + hipY) / 2, -W * 2.0, hipY + 0.15 * hh); c.lineTo(-W * 0.5, hipY + 0.02 * hh); c.closePath(); fs(c, shade(a.accent, -0.2), ink, lw); }
  if (a.accessory === "backpack") { rr(c, -W * 1.75, shY + 0.02 * hh, W * 0.95, 0.27 * hh, 0.04 * hh); fs(c, shade(a.accent, -0.15), ink, lw); }
  const shB = [-W * 0.92, shY + 0.035 * hh] as const, shF = [W * 0.92, shY + 0.035 * hh] as const;
  const arm = (sh: readonly [number, number], ang: [number, number], back: boolean, shape: HandShape) => {
    const sleeve = back ? shade(top, -0.18) : top, w = 0.068 * hh;
    const [ex, ey] = limb(c, sh[0], sh[1] - pose.shrug * hh, ang[0], 0.18 * hh, w, sleeve, ink, lw);
    const [hx, hy] = limb(c, ex, ey, ang[0] + ang[1], 0.165 * hh, w * 0.92, back ? skinD : skin, ink, lw);
    hand(c, hx, hy, ang[0] + ang[1], shape, w, back ? skinD : skin, ink, lw);
  };
  arm(shB, pose.armB, true, pose.handB);
  const leg = (xo: number, ang: number, col: string) => {
    const hx = xo, hy = hipY + 0.02 * hh, w = 0.082 * hh * Math.min(1.2, b);
    const [kx, ky] = limb(c, hx, hy, ang * 0.9, 0.225 * hh, w, col, ink, lw);
    const [fx, fy] = limb(c, kx, ky, ang * 0.9 - Math.max(0, -ang) * 0.9, 0.215 * hh, w * 0.95, col, ink, lw);
    c.beginPath(); c.ellipse(fx + 0.025 * hh, fy + 0.005 * hh, 0.062 * hh, 0.03 * hh, 0, 0, Math.PI * 2); fs(c, a.shoes, ink, lw);
  };
  leg(-W * 0.42, pose.legB, shade(pants, -0.2)); leg(W * 0.42, pose.legF, pants);
  c.beginPath(); c.moveTo(-W, shY); c.quadraticCurveTo(-W * 1.08, (shY + hipY) / 2, -W * 0.92, hipY + 0.04 * hh); c.lineTo(W * 0.92, hipY + 0.04 * hh);
  c.quadraticCurveTo(W * 1.08, (shY + hipY) / 2, W, shY); c.quadraticCurveTo(0, shY - 0.03 * hh, -W, shY); c.closePath(); fs(c, top, ink, lw);
  c.beginPath(); c.rect(-W * 0.92, hipY - 0.045 * hh, W * 1.84, 0.085 * hh); fs(c, shade(pants, -0.05), ink, lw);
  c.fillStyle = a.accent; c.fillRect(-W * 0.9, shY + 0.16 * hh, W * 1.8, 0.035 * hh);
  if (a.accessory === "tie") { c.beginPath(); c.moveTo(-0.02 * hh, shY); c.lineTo(0.02 * hh, shY); c.lineTo(0.03 * hh, shY + 0.22 * hh); c.lineTo(0, shY + 0.25 * hh); c.lineTo(-0.03 * hh, shY + 0.22 * hh); c.closePath(); fs(c, a.accent, ink, lw * 0.8); }
  arm(shF, pose.armF, false, pose.handF);
  if (a.accessory === "scarf") { rr(c, -W * 0.7, shY - 0.025 * hh, W * 1.4, 0.05 * hh, 0.025 * hh); fs(c, a.accent, ink, lw); rr(c, W * 0.15, shY, 0.045 * hh, 0.15 * hh, 0.02 * hh); fs(c, a.accent, ink, lw); }

  const rH = 0.118 * hh, hx = 0, hy = shY - rH * 1.02 + pose.headDip * hh;
  c.fillStyle = skinD; c.fillRect(-0.03 * hh, shY - 0.05 * hh, 0.06 * hh, 0.07 * hh);
  c.save(); c.translate(0, shY - 0.02 * hh); c.rotate(pose.headTilt); c.translate(0, -(shY - 0.02 * hh));
  if (a.hairStyle === "long") { rr(c, -rH * 1.5, hy - rH * 0.8, rH * 1.55, rH * 2.9, rH * 0.75); fs(c, shade(a.hairColor, -0.1), ink, lw); }
  if (a.hairStyle === "ponytail") { c.beginPath(); c.moveTo(-rH * 0.9, hy - rH * 0.4); c.quadraticCurveTo(-rH * 2.1, hy - rH * 0.2, -rH * 1.7, hy + rH * 1.5); c.quadraticCurveTo(-rH * 1.2, hy + rH * 0.4, -rH * 0.7, hy + rH * 0.2); c.closePath(); fs(c, shade(a.hairColor, -0.1), ink, lw); }
  if (a.hairStyle === "bun") { c.beginPath(); c.arc(0, hy - rH * 1.2, rH * 0.42, 0, Math.PI * 2); fs(c, a.hairColor, ink, lw); }
  if (a.hairStyle === "curly") for (let i = 0; i < 7; i++) { const an = Math.PI * (1.05 + i * 0.15); c.beginPath(); c.arc(Math.cos(an) * rH * 1.0, hy + Math.sin(an) * rH * 1.0 - rH * 0.05, rH * 0.4, 0, Math.PI * 2); fs(c, shade(a.hairColor, i % 2 ? 0 : -0.1), ink, lw); }
  c.beginPath(); c.ellipse(hx, hy, rH * 1.02, rH * 1.08, 0, 0, Math.PI * 2); fs(c, skin, ink, lw);
  c.beginPath(); c.ellipse(rH * 1.0, hy + rH * 0.05, rH * 0.16, rH * 0.2, 0, 0, Math.PI * 2); fs(c, skin, ink, lw * 0.8);
  const hair = a.hairColor;
  if (a.hairStyle !== "bald" && a.hairStyle !== "cap") {
    c.beginPath(); c.moveTo(-rH * 1.04, hy - rH * 0.1); c.quadraticCurveTo(-rH * 1.1, hy - rH * 1.2, 0, hy - rH * 1.18); c.quadraticCurveTo(rH * 1.15, hy - rH * 1.1, rH * 1.04, hy - rH * 0.15);
    c.quadraticCurveTo(rH * 0.5, hy - rH * 0.62, -rH * 0.2, hy - rH * 0.5); c.quadraticCurveTo(-rH * 0.8, hy - rH * 0.45, -rH * 1.04, hy - rH * 0.1); c.closePath(); fs(c, hair, ink, lw);
  }
  if (a.hairStyle === "spiky") for (let i = 0; i < 5; i++) { const x0 = -rH * 0.85 + i * rH * 0.42; c.beginPath(); c.moveTo(x0, hy - rH * 1.05); c.lineTo(x0 + rH * 0.2, hy - rH * (1.65 + (i % 2) * 0.25)); c.lineTo(x0 + rH * 0.45, hy - rH * 1.05); c.closePath(); fs(c, hair, ink, lw); }
  const ex = 0.46 * rH, ey = hy + rH * 0.02, look = pose.lookX * rH * 0.12 + rH * 0.12;
  const e = pose.expression, es = a.eyeStyle === "big" ? 1.25 : a.eyeStyle === "narrow" ? 0.7 : 1, open = (e === "surprised" ? 1.25 : e === "happy" ? 0.55 : e === "angry" ? 0.7 : 1) * es, bl = 1 - pose.blink * 0.92;
  for (const sx of [-1, 1]) {
    const x = sx * ex + rH * 0.12;
    if (e === "happy" && !pose.blink) { c.strokeStyle = ink; c.lineWidth = lw * 1.6; c.lineCap = "round"; c.beginPath(); c.arc(x, ey + rH * 0.05, rH * 0.2, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); }
    else {
      c.beginPath(); c.ellipse(x, ey, rH * 0.2 * (es > 1 ? 1.08 : 1), rH * 0.26 * open * bl, 0, 0, Math.PI * 2); fs(c, "#ffffff", ink, lw * 0.7);
      if (bl > 0.25) { c.beginPath(); c.arc(x + look, ey + rH * 0.02, rH * 0.13 * Math.min(1, bl + 0.2) * Math.min(1.1, es), 0, Math.PI * 2); c.fillStyle = a.eyeColor; c.fill(); c.beginPath(); c.arc(x + look, ey + rH * 0.02, rH * 0.065, 0, Math.PI * 2); c.fillStyle = "#101216"; c.fill(); c.beginPath(); c.arc(x + look + rH * 0.04, ey - rH * 0.04, rH * 0.032, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); }
    }
    const raise = e === "surprised" ? -0.2 : e === "happy" ? -0.1 : e === "angry" ? 0.1 : -0.03; const tilt = (e === "angry" ? 0.42 : e === "sad" || e === "worried" ? -0.4 : e === "thinking" && sx > 0 ? -0.25 : 0) * -sx;
    c.save(); c.translate(x, ey - rH * (0.44 - raise)); c.rotate(tilt); c.strokeStyle = shade(hair, -0.3); c.lineWidth = lw * 2.1; c.lineCap = "round"; c.beginPath(); c.moveTo(-rH * 0.2, 0); c.lineTo(rH * 0.2, 0); c.stroke(); c.restore();
  }
  if (a.accessory === "glasses") { c.strokeStyle = ink; c.lineWidth = lw * 1.3; for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * ex + rH * 0.12, ey, rH * 0.3, 0, Math.PI * 2); c.stroke(); } c.beginPath(); c.moveTo(-ex + rH * 0.42, ey); c.lineTo(ex - rH * 0.18, ey); c.stroke(); }
  c.strokeStyle = shade(skin, -0.28); c.lineWidth = lw * 0.9; c.lineCap = "round"; c.beginPath(); c.moveTo(rH * 0.18, hy + rH * 0.12); c.quadraticCurveTo(rH * 0.34, hy + rH * 0.3, rH * 0.14, hy + rH * 0.34); c.stroke();
  mouth(c, pose.viseme, pose.mouth, e, rH, rH * 0.12, hy + rH * 0.62, ink, lw);
  if (a.hairStyle === "cap" || a.accessory === "hat") {
    const col = a.hairStyle === "cap" ? a.accent : shade(a.accent, -0.1);
    c.beginPath(); c.moveTo(-rH * 1.06, hy - rH * 0.2); c.quadraticCurveTo(-rH * 1.0, hy - rH * 1.45, 0, hy - rH * 1.42); c.quadraticCurveTo(rH * 1.1, hy - rH * 1.35, rH * 1.06, hy - rH * 0.2); c.closePath(); fs(c, col, ink, lw);
    c.beginPath(); c.ellipse(rH * 0.95, hy - rH * 0.22, rH * 0.7, rH * 0.14, 0, 0, Math.PI * 2); fs(c, shade(col, -0.18), ink, lw);
  }
  if (a.accessory === "headphones") { c.strokeStyle = ink; c.lineWidth = lw * 3.2; c.lineCap = "round"; c.beginPath(); c.arc(0, hy - rH * 0.1, rH * 1.12, Math.PI * 1.02, Math.PI * 1.98); c.stroke(); c.strokeStyle = a.accent; c.lineWidth = lw * 1.8; c.beginPath(); c.arc(0, hy - rH * 0.1, rH * 1.12, Math.PI * 1.02, Math.PI * 1.98); c.stroke(); c.beginPath(); c.ellipse(rH * 0.98, hy + rH * 0.05, rH * 0.2, rH * 0.32, 0, 0, Math.PI * 2); fs(c, a.accent, ink, lw); }
  c.restore(); c.restore();
}
