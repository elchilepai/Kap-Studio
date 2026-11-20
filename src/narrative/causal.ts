/**
 * CADENA CAUSAL (módulo puro, sin IA). La acción de KAP debe provocar algo, alguien debe reaccionar y ESA reacción debe cambiar la situación
 * (acción → consecuencia → reacción → siguiente problema), no «situación → KAP hace algo → salto de escena → aparece otra cosa».
 * Solo se mide lo barato: ¿lo que aparece de golpe en una escena (rumor, llamada, acusación, personaje, lugar nuevo…) se apoya en algo que acaba
 * de ocurrir? No se exige una consecuencia por escena ni se juzga la calidad: se señala el «teletransporte narrativo» y se repara en local.
 */
import { norm } from "../memory/text.ts";
import { content } from "./review.ts";

/** Algo importante que puede entrar en escena de golpe: rumor, llamada, mensaje, acusación, descubrimiento, llegada, oportunidad. */
export const SUDDEN = /\b(?:rumor(?:es)?|dicen que|se (?:ha |lo )?(?:enter[oó]|enterado|corrido)|acus\w+|culp\w+|llamada|mensaje|de repente|aparece|apareci[oó]|llega|lleg[oó]|oportunidad|descubre|descubri[oó]|ha visto|ve que)\b/i;
/** Un personaje explica la causalidad en vez de provocarla con un hecho («como hiciste X, ahora pasa Y»). */
export const CAUSE_TELL = /\bcomo (?:t[uú] )?(?:hiciste|has hecho|no (?:contestaste|respondiste|dijiste))\b|\bpor (?:lo que|haber) (?:hiciste|hecho)\b|\b(?:esto|todo esto|eso) (?:pasa|ocurre|ha pasado|pas[oó]|es) (?:porque|consecuencia)\b|\bpor tu culpa\b|\bgracias a lo que hiciste\b|\bahora (?:que|por eso) (?:has|hiciste|lo)\b/i;
export const explainsCause = (t: string) => CAUSE_TELL.test(t);

const stems = (s: string) => new Set(content(s).map((x) => x.slice(0, 5)));
/** Raíces compartidas entre lo que aporta la escena y lo que dejó la anterior (texto, cambio, acción de KAP, consecuencia pendiente). */
export function causalLink(sceneText: string, inherited: string): number { const a = stems(sceneText), b = stems(inherited); let n = 0; for (const x of a) if (b.has(x)) n++; return n; }

export type CausalInput = {
  lines: { speaker?: string; text: string }[];
  /** Escenas aceptadas hasta ahora (la última es la que debe heredarse). */
  previous: { text: string; change: string; speakers?: string[]; does?: string }[];
  /** Consecuencia que el arco dejaba abierta tras el beat anterior (conducta de KAP), si la hay. */
  pending?: string; locationChanged?: boolean; isConsequence?: boolean;
};
export type CausalProblem = { reason: string; line: number };

/** ¿La escena introduce algo importante sin que la anterior lo provoque o lo prepare? Devuelve la razón y la línea que hay que reconectar (la de apertura). */
export function causalProblem(inp: CausalInput): CausalProblem | undefined {
  const prev = inp.previous.at(-1); if (!prev) return undefined;
  const text = inp.lines.map((l) => l.text).join(" "), inherited = [prev.text, prev.change, prev.does ?? "", inp.pending ?? "", inp.previous.at(-2)?.change ?? ""].join(" ");
  const link = causalLink(text, inherited);
  const seen = new Set(inp.previous.flatMap((p) => (p.speakers ?? []).map(norm)).filter(Boolean)), newSpeaker = inp.lines.some((l) => { const k = norm(l.speaker ?? ""); return !!k && k !== "kap" && !seen.has(k) && !norm(inherited).includes(k); });
  const sudden = inp.lines.some((l) => SUDDEN.test(l.text)) || newSpeaker || !!inp.locationChanged;
  const open = Math.max(0, inp.lines.findIndex((l) => !(l.speaker ?? "").trim()));
  const base = `La escena anterior terminó con: «${prev.change.slice(0, 140) || prev.text.slice(0, 100)}»`;
  if (inp.isConsequence && link < 1) return { reason: `${base}. La consecuencia no sale de ahí: haz que lo que ocurre sea el efecto visible de lo que KAP acaba de hacer.`, line: open };
  if (sudden && link < 2) return { reason: `${base}. Aparece algo (un rumor, una llamada, un personaje, un lugar, una acusación) sin que eso lo provoque o lo prepare: que la primera línea lo conecte con un hecho de la escena anterior (alguien vio a KAP, alguien lo contó, la llamada perdida tuvo un efecto), mostrado con un acontecimiento y sin que nadie lo explique.`, line: open };
  return undefined;
}

/** Revisión del episodio entero: escenas cuyo contenido no se apoya en nada de la anterior (cadena rota). */
export function brokenLinks(scenes: { text: string; change?: string; does?: string }[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < scenes.length; i++) { const p = scenes[i - 1]; if (causalLink(scenes[i].text, `${p.text} ${p.change ?? ""} ${p.does ?? ""}`) < 1) out.push(i); }
  return out;
}
