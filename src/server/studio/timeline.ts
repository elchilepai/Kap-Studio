/**
 * LÍNEA DE TIEMPO DE UNA ESCENA: lo que se OYE y se LEE es solo el diálogo; la narración es DIRECCIÓN (lo que ocurre y dirige la animación): ocupa
 * tiempo (cada acción necesita su momento) pero ni se pronuncia ni se subtitula. Esta línea de tiempo secuencial es la ÚNICA fuente de tiempos para la
 * voz (silencios en las acciones), los subtítulos y el director de animación.
 */
import { wordCount } from "./text";

export type TLine = { speaker?: string; text: string };
export type TItem = { kind: "dialogue" | "action"; speaker?: string; text: string; start: number; end: number };
/** Pausa tras cada frase hablada (la misma que la voz añade entre líneas). */
export const GAP = 0.25, WORDS_PER_SEC = 2.6, ACTION_MIN = 1.4, ACTION_PER_CLAUSE = 1.5;

export const isDialogue = (l: TLine) => !!l.speaker?.trim();
/** Cláusulas de una acción narrada (una por frase o por «pero»/«mientras»): cada una necesita su momento en pantalla. */
export const clausesOf = (text: string) => text.split(/[.!?…;]+|\bpero\b|\bmientras\b/i).map((x) => x.trim()).filter((x) => x.length > 2);
export const speechSeconds = (text: string) => Math.max(0.7, wordCount(text) / WORDS_PER_SEC);
export const actionSeconds = (text: string) => Math.max(ACTION_MIN, clausesOf(text).length * ACTION_PER_CLAUSE);

/** Disposición secuencial. `durations[i]` = segundos reales de la línea i (si ya se conocen, p. ej. tras sintetizar la voz); si no, se estiman. */
export function sceneTimeline(lines: TLine[], durations: (number | undefined)[] = []): TItem[] {
  let t = 0;
  return lines.map((l, i) => { const dialogue = isDialogue(l), d = dialogue ? durations[i] ?? speechSeconds(l.text) : actionSeconds(l.text);
    const it: TItem = { kind: dialogue ? "dialogue" : "action", ...(dialogue ? { speaker: l.speaker } : {}), text: l.text, start: t, end: t + d }; t += d + (dialogue ? GAP : 0); return it; });
}
export const timelineSeconds = (items: TItem[]) => (items.length ? items.at(-1)!.end + (items.at(-1)!.kind === "dialogue" ? GAP : 0) : 0);
export const sceneSeconds = (lines: TLine[]) => timelineSeconds(sceneTimeline(lines));
/** Reescala una línea de tiempo estimada para que ocupe exactamente `window` segundos. */
export const fitTimeline = (items: TItem[], window: number): TItem[] => { const last = items.at(-1); if (!last) return items; const tail = last.kind === "dialogue" ? GAP : 0, k = Math.max(0.05, (window - tail) / (last.end || 1)); return items.map((i) => ({ ...i, start: i.start * k, end: i.end * k })); };
