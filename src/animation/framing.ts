/**
 * COMPOSICIÓN DE PLANOS (puro e isomórfico). Decide, para cada escena, dónde se colocan los personajes y qué plano se usa
 * para que ninguno quede cortado por el borde, no se solapen y el subtítulo no tape los pies. No encoge a todos los
 * personajes: ajusta la cámara y, si hace falta, escalona el reparto en dos filas (profundidad).
 */
import { GROUND_Y, WORLD_H, WORLD_W } from "./types.ts";

/** Medio ancho de un personaje (cuerpo + brazos en reposo), en unidades de mundo. */
export const ACTOR_HALF_W = 0.78;
/** Quien habla gesticula (brazos extendidos): se le reserva más ancho para que ni la mano asome cortada por el borde. */
export const FOCUS_HALF_W = 1.15;
/** Alcance de los brazos de un personaje que NO habla: para darlo por «fuera» del plano ni su mano debe asomar. */
export const ACTOR_REACH = 1.05;
/** Altura aproximada de un personaje de pies a cabeza (unidades de mundo). */
export const ACTOR_HEIGHT = 3.75;
/** Fila trasera: más arriba en pantalla y algo más pequeña (perspectiva), para que las cabezas no se tapen. */
export const ROW_DY = 0.45, ROW_SCALE = 0.92;
export const FEET_DY = 0.55;                 // los pies pisan el suelo con un poco de profundidad (igual que el dibujante)
export const CAM_MARGIN = 1.2;               // la cámara puede asomar 1,2 u fuera del mundo por cada lado

export const visibleSize = (zoom: number, aspect: number) => { const visH = WORLD_H / Math.max(0.3, zoom); return { visH, visW: visH * aspect }; };
/** Misma restricción que aplica el renderizador a la posición horizontal de la cámara. */
export const clampCx = (cx: number, visW: number) => (visW >= WORLD_W + 2 * CAM_MARGIN ? WORLD_W / 2 : Math.min(Math.max(cx, visW / 2 - CAM_MARGIN), WORLD_W - visW / 2 + CAM_MARGIN));

// ------------------------------------------------------------------ zona segura de subtítulos
export type SubtitleLook = { position?: "bottom" | "center" | "top"; scale?: number };
/** Fuente única de las métricas del subtítulo (la usan el ASS y la composición). `top`/`bottom` en fracción de la altura. */
export function subtitleMetrics(width: number, height: number, look: SubtitleLook = {}) {
  const vertical = height > width, position = look.position ?? "bottom", scale = look.scale ?? 1;
  const fontSize = Math.round((vertical ? width * 0.058 : height * 0.047) * scale);
  const marginV = Math.round(position === "bottom" ? height * (vertical ? 0.17 : 0.07) : position === "top" ? height * 0.08 : 0);
  const block = fontSize * 2.7;                                   // 2 líneas + contorno
  const bottom = position === "top" ? (marginV + block) / height : position === "center" ? 0.5 + block / 2 / height : 1 - marginV / height;
  const top = position === "top" ? marginV / height : position === "center" ? 0.5 - block / 2 / height : bottom - block / height;
  return { fontSize, marginV, align: position === "top" ? 8 : position === "center" ? 5 : 2, top, bottom };
}
export type SafeZone = { top: number; bottom: number };

/**
 * Desplazamiento vertical de la cámara (unidades) para que los pies queden por encima de la zona de subtítulos.
 * Solo si el personaje ENTERO cabe por encima de esa zona (planos generales y medios): en un primer plano muy cerrado
 * (la cara llena la pantalla) no se baja, para no dejar la cabeza pegada al borde superior.
 */
export function feetDrop(cy: number, visH: number, safe: SafeZone | undefined, gap = 0.03): number {
  if (!safe || safe.top < 0.55) return 0;                         // subtítulos arriba o en el centro: no se baja la escena
  const target = Math.min(0.9, safe.top - gap);
  if (ACTOR_HEIGHT / visH > target - 0.08) return 0;              // no cabe entero sobre la zona: plano cerrado
  const feet = GROUND_Y + FEET_DY, frac = 0.5 + (feet - cy) / visH;
  return Math.max(0, frac - target) * visH;                       // fracción que sobra × altura visible
}

// ------------------------------------------------------------------ reparto de personajes
export type Slot = { x: number; row: 0 | 1 };
/**
 * Posición inicial de cada personaje. Horizontal: una fila (como siempre). Vertical: la ventana solo abarca ≈ 5 de las 16 unidades,
 * así que 1-2 personajes se agrupan en una fila y 3-4 se escalonan en dos (la trasera, más arriba y algo menor), sin solaparse.
 */
export function layoutSlots(n: number, aspect: number): Slot[] {
  const row = (xs: number[], r: 0 | 1 = 0): Slot[] => xs.map((x) => ({ x, row: r }));
  if (aspect >= 0.8) return row(n <= 1 ? [8] : n === 2 ? [5.8, 10.2] : n === 3 ? [4.4, 8, 11.6] : [3.4, 6, 10, 12.6]);
  if (n <= 1) return row([8]);
  if (n === 2) return row([6.7, 9.3]);
  if (n === 3) return [{ x: 6.65, row: 0 }, { x: 8, row: 1 }, { x: 9.35, row: 0 }];                       // triángulo: uno al fondo entre dos delanteros
  return [{ x: 6.25, row: 1 }, { x: 7.15, row: 0 }, { x: 8.85, row: 0 }, { x: 9.75, row: 1 }];              // 4: pareja delantera y dos «alas» detrás (compacto: el plano de grupo solo abre ≈ 5 %)
}
/** Plano general que necesita un reparto para que quepa entero (zoom ≤ 1 = más abierto). */
export function wideZoom(xs: number[], aspect: number, minZoom = 0.8, maxZoom = 1): number {
  if (!xs.length) return maxZoom;
  const need = Math.max(...xs) - Math.min(...xs) + 2 * (ACTOR_HALF_W + 0.2);
  const z = (WORLD_H * aspect) / need;                              // visW = 9·aspect/z ≥ need ⇒ z ≤ 9·aspect/need
  return Math.max(minZoom, Math.min(maxZoom, z));
}

// ------------------------------------------------------------------ solucionador de planos
export type FrameActor = { id: string; x: number };
export type FrameInput = {
  actors: FrameActor[]; focus?: string; aspect: number;
  zoom: number;                  // zoom deseado según el tipo de plano
  minZoom?: number; maxZoom?: number;
  look?: -1 | 0 | 1;             // hacia dónde mira quien habla: la cámara le deja espacio por delante
  leadFrac?: number;             // fracción de la ventana que se desplaza (regla de tercios)
};
export type FrameResult = { zoom: number; cx: number; lead: number; cut: string[]; included: string[] };

/** ¿Cómo queda un personaje respecto a la ventana? dentro (entero), fuera (nada) o cortado (a medias). */
export function visibility(x: number, cx: number, visW: number, half = ACTOR_HALF_W): "in" | "out" | "cut" {
  const a = x - half, b = x + half, l = cx - visW / 2, r = cx + visW / 2, m = 0.12;
  if (a >= l + m && b <= r - m) return "in";
  const reach = Math.max(half, ACTOR_REACH);
  if (x + reach <= l + 0.02 || x - reach >= r - 0.02) return "out";
  return "cut";
}

/**
 * Elige zoom y centro del plano: el que más se parece al deseado SIN dejar a nadie cortado. Si hay que elegir, prefiere abrir
 * el plano para meter a todos; si no cabe, encuadra a quien habla y deja a los demás completamente fuera.
 */
export function frameShot(o: FrameInput): FrameResult {
  const minZ = o.minZoom ?? 1, maxZ = o.maxZoom ?? 1.9, focus = o.actors.find((a) => a.id === o.focus) ?? o.actors[0];
  const xs = o.actors.map((a) => a.x), group = (Math.min(...xs) + Math.max(...xs)) / 2, lead = o.leadFrac ?? 0.17;
  let best: (FrameResult & { cost: number }) | undefined;
  for (let zz = minZ; zz <= maxZ + 1e-9; zz += 0.05) {                              // barrido de zoom: se puntúa cada candidato
    const { visW } = visibleSize(zz, o.aspect);
    const leads = [o.look ? o.look * lead : 0, 0, o.look ? o.look * lead * 0.5 : 0, o.look ? -o.look * lead * 0.5 : 0];
    const cands = [...leads.map((l) => ({ cx: clampCx(focus.x + l * visW, visW), l })), { cx: clampCx(group, visW), l: (group - focus.x) / visW }];
    for (const c of cands) {
      const vis = o.actors.map((a) => ({ id: a.id, v: visibility(a.x, c.cx, visW) }));
      const cut = vis.filter((q) => q.v === "cut").map((q) => q.id), included = vis.filter((q) => q.v === "in").map((q) => q.id);
      if (visibility(focus.x, c.cx, visW, FOCUS_HALF_W) !== "in") continue;         // quien habla siempre entero, con los brazos
      const cost = cut.length * 1000 + Math.abs(zz - o.zoom) * 4 + Math.abs(c.l - (o.look ?? 0) * lead) * 1.5 + (o.actors.length - included.length) * 0.4;
      if (!best || cost < best.cost) best = { zoom: +zz.toFixed(3), cx: c.cx, lead: +((c.cx - focus.x) / visW).toFixed(3), cut, included, cost };
    }
  }
  if (!best) { const { visW } = visibleSize(minZ, o.aspect); const cx = clampCx(focus.x, visW); return { zoom: minZ, cx, lead: 0, cut: o.actors.filter((a) => visibility(a.x, cx, visW) === "cut").map((a) => a.id), included: [focus.id] }; }
  const { cost: _c, ...r } = best; void _c; return r;
}
