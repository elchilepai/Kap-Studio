import type { Appearance, Ctx, LayeredRig, LayerPart, Viseme } from "./types.ts";
import type { Pose } from "./character.ts";

/**
 * RIG POR CAPAS: personajes propios (PNG) con la misma pose que el vector paramétrico. Cada parte gira sobre su punto de
 * giro y cuelga de su padre; el orden de dibujo es `z`. La cara puede intercambiar ojos y boca por expresión/visema.
 */
type M = [number, number, number, number, number, number];
const mul = (p: M, q: M): M => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const R = (a: number): M => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const S = (k: number): M => [k, 0, 0, k, 0, 0];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
type Img = { width: number; height: number };

const arm = (p: [number, number]) => p[0] + p[1] * 0.5;   // un solo segmento: hombro + media flexión del codo
/** Ángulo de cada articulación. Brazos y piernas cuelgan hacia abajo: positivo = adelante, que en el lienzo es girar en sentido contrario. */
const joint = (role: string, pose: Pose): number =>
  role === "torso" ? pose.lean : role === "head" ? pose.headTilt
  : role === "armF" ? -arm(pose.armF) : role === "armB" ? -arm(pose.armB) : role === "legF" ? -pose.legF : role === "legB" ? -pose.legB : 0;

export function drawLayered(c: Ctx, a: Appearance, rig: LayeredRig, pose0: Pose, o: { alpha: number; facing: 1 | -1; shadow: boolean }, images: Record<string, unknown>) {
  const sprite = !!rig.animations?.includes("idle"), pose: Pose = sprite ? { ...pose0, lean: pose0.lean * 0.3, headTilt: pose0.headTilt * 1.3, bob: Math.min(0.03, Math.abs(pose0.bob)) * Math.sign(pose0.bob) } : pose0;   // ilustración: se inclina poco (no se tumba)
  const unit = a.height / rig.pxPerUnit;   // unidades de mundo por píxel de imagen (pxPerUnit = px por unidad a altura 1)
  c.save(); c.globalAlpha *= o.alpha; c.scale(o.facing, 1);
  if (o.shadow) { c.fillStyle = "rgba(0,0,0,0.28)"; c.beginPath(); c.ellipse(0, 0.03, 0.6 * a.height, 0.1 * a.height, 0, 0, Math.PI * 2); c.fill(); }
  c.translate(0, -pose.bob * 3 * a.height); if (rig.animations?.includes("idle")) c.scale(1, 1 + Math.max(-0.02, Math.min(0.02, pose.bob * 1.6)));   // respiración (el sprite no se estira al caminar)
  const byId = new Map(rig.parts.map((p) => [p.id, p])); const nodes = new Map<string, { m: M; rot: number }>();
  /** Matriz píxel-de-imagen → mundo de cada parte: se coloca su punto de giro en el punto de unión del padre y hereda su rotación. */
  const build = (p: LayerPart, depth = 0): { m: M; rot: number } => {
    const hit = nodes.get(p.id); if (hit) return hit; if (depth > 16) return { m: [1, 0, 0, 1, 0, 0], rot: 0 };
    const par = p.parent ? byId.get(p.parent) : undefined; let wx: number, wy: number, rot: number;
    if (par) { const pn = build(par, depth + 1); const pi = images[par.image] as Img | undefined; const [ax, ay] = p.at ?? [pi?.width ?? 0, pi?.height ?? 0]; [wx, wy] = apply(pn.m, ax, ay); rot = pn.rot + joint(p.role, pose); }
    else { const [ox, oy] = p.at ?? [0, 0]; wx = ox * unit; wy = oy * unit; rot = joint(p.role, pose); }
    const node = { m: mul(mul(mul(T(wx, wy), R(rot)), S((p.scale ?? 1) * unit)), T(-p.anchor[0], -p.anchor[1])), rot };
    nodes.set(p.id, node); return node;
  };
  for (const p of rig.parts) build(p);
  for (const p of [...rig.parts].sort((x, y) => x.z - y.z)) {
    const img = images[p.image] as Img | undefined; if (!img) continue; const m = nodes.get(p.id)!.m;
    c.save(); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); c.drawImage(img as never, 0, 0); c.restore();
    if (rig.face && rig.face.parent === p.id) {
      const e = rig.face.eyes?.[pose.blink > 0.6 ? "closed" : pose.expression] ?? rig.face.eyes?.neutral, v = (pose.viseme as Viseme) ?? "rest", mo = (v === "rest" ? rig.face.restMouths?.[pose.expression] : undefined) ?? rig.face.mouths?.[v] ?? rig.face.mouths?.rest;
      for (const id of [e, mo]) { const fi = id ? (images[id] as Img | undefined) : undefined; if (!fi) continue; c.save(); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); c.translate(rig.face.at[0] + (id === e ? pose.lookX * 16 : 0), rig.face.at[1]); c.scale(rig.face.scale ?? 1, rig.face.scale ?? 1); c.drawImage(fi as never, -fi.width / 2, -fi.height / 2); c.restore(); }
    }
  }
  c.restore();
}

/** Comprobación de un rig por capas contra los recursos disponibles (para el asistente de importación). */
export function checkLayeredRig(rig: LayeredRig, known: (assetId: string) => { width?: number; height?: number } | undefined): string[] {
  const issues: string[] = []; const ids = new Set(rig.parts.map((p) => p.id));
  if (rig.pxPerUnit <= 0) issues.push("pxPerUnit debe ser mayor que 0");
  if (!rig.parts.some((p) => p.role === "torso")) issues.push("Falta la parte «torso»"); if (!rig.parts.some((p) => p.role === "head")) issues.push("Falta la parte «head»");
  if (ids.size !== rig.parts.length) issues.push("Hay identificadores de parte repetidos");
  for (const p of rig.parts) {
    const im = known(p.image); if (!im) issues.push(`La parte «${p.id}» usa un recurso inexistente (${p.image})`);
    else if (im.width && im.height && (p.anchor[0] < 0 || p.anchor[1] < 0 || p.anchor[0] > im.width || p.anchor[1] > im.height)) issues.push(`El punto de giro de «${p.id}» cae fuera de su imagen (${im.width}×${im.height})`);
    if (p.parent && !ids.has(p.parent)) issues.push(`La parte «${p.id}» tiene un padre inexistente (${p.parent})`);
  }
  const seen = new Set<string>(); for (const p of rig.parts) { let cur: LayerPart | undefined = p; const path = new Set<string>(); while (cur?.parent) { if (path.has(cur.id)) { issues.push(`Ciclo de padres en «${p.id}»`); break; } path.add(cur.id); cur = rig.parts.find((x) => x.id === cur!.parent); } seen.add(p.id); }
  if (rig.face) { if (!ids.has(rig.face.parent)) issues.push("La cara apunta a una parte inexistente"); for (const id of [...Object.values(rig.face.eyes ?? {}), ...Object.values(rig.face.mouths ?? {})]) if (!known(id)) issues.push(`Una imagen de la cara no existe (${id})`); }
  return issues;
}
