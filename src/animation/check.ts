import { evaluate } from "./timeline.ts";
import { viewFor } from "./render.ts";
import type { StageSpec } from "./types.ts";
import { WORLD_W } from "./types.ts";

/** Comprobación de encuadre: la ventana de cámara nunca debe salirse del mundo (más el margen dibujado). */
export function dimsOk(stage: StageSpec, aspect: number): boolean {
  for (let t = 0; t <= stage.duration; t += 0.25) {
    const v = viewFor(stage, aspect, evaluate(stage, t));
    if (v.cx - v.visW / 2 < -1.3 || v.cx + v.visW / 2 > WORLD_W + 1.3) return false;
  }
  return true;
}
