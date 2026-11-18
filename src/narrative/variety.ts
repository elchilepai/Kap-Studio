/**
 * VARIEDAD ESPACIAL/TEMPORAL DENTRO DEL EPISODIO (módulo puro). No obliga a cambiar de escenario en cada escena ni por cumplir una métrica:
 * solo detecta el episodio completamente plano cuando el propio arco declara que la historia permite desplazarse (escenarios secundarios o
 * transiciones posibles) y propone QUÉ beats revisar (los de la segunda mitad), no todo el episodio.
 */
import { norm } from "../memory/text.ts";

export type VarietyBeat = { location: string; time: string; interior?: boolean };
export type VarietySetting = { main?: string; secondary?: string[]; timeOfDay?: string; transitions?: string[] };
export function episodeVariety(beats: VarietyBeat[], setting?: VarietySetting): { flat: boolean; allowed: boolean; beatsToMove: number[]; reason: string } {
  const n = beats.length, locs = new Set(beats.map((b) => norm(b.location))), times = new Set(beats.map((b) => norm(b.time)));
  const flat = n >= 5 && locs.size === 1 && times.size === 1, allowed = !!setting && ((setting.secondary?.length ?? 0) > 0 || (setting.transitions?.length ?? 0) > 0);
  const from = Math.ceil(n / 2), beatsToMove = flat && allowed ? Array.from({ length: Math.min(3, Math.max(0, n - 1 - from)) }, (_, i) => from + i) : [];
  return { flat, allowed, beatsToMove, reason: flat ? `todas las escenas ocurren en «${beats[0].location}» y a la misma hora (${beats[0].time})${allowed ? ", aunque el arco declara escenarios o transiciones posibles" : ""}` : "" };
}
