/**
 * CIERRES y DESENLACES (módulo puro). Un episodio debe acabar como un capítulo de una serie (gag, reacción, sorpresa, imagen, consecuencia,
 * decisión, complicación), no con una moraleja ni una reflexión sobre rendirse. Y su desenlace no puede ser intercambiable con el de los dos
 * episodios anteriores: se compara el contenido (gancho + consecuencia + cierre) y el TIPO de cierre, sin una lista rígida de desenlaces.
 */
import { norm } from "../memory/text.ts";
import { MOTIVATIONAL, content, jac } from "./review.ts";

const MORAL = /aprendi[oó]|aprend[ií]|lecci[oó]n|m[aá]s fuerte|ya no es el mismo|nunca (?:volver[aá]|m[aá]s)|todo (?:va a|ser[aá]) (?:bien|posible)|hay que seguir/i;
/** Reflexión de cierre: preguntas retóricas sobre rendirse o sobre qué hará, «algún día…», «algo ha cambiado dentro de mí». */
export const REFLECTIVE_CLOSE = /¿\s*(?:y si|qu[eé] (?:hago|har[eé]|har[aá]|pasar[aá]|ser[aá]|hacer)|podr[aá]|voy a|va a|me rendir|seguir[eé]|ser[eé])|\btal vez\b|\balg[uú]n d[ií]a\b|\bquiz[aá]s?\b|\balgo (?:dentro de m[ií]|ha cambiado|est[aá] cambiando|cambi[oó])(?![a-záéíóú])|no me rendir|no voy a rendirme/i;
/** Cierres de tráiler que valen para cualquier episodio, los diga KAP u otro personaje o los cuente el narrador. */
export const STOCK_CLOSE = /no ser[aá] f[aá]cil|\beste es mi camino\b|nunca me rendir[eé]|no me rendir[eé]|¿\s*qu[eé] pasar[aá]\s*(?:ahora)?\s*\?|¿\s*qu[eé] (?:me )?espera\s*\?|(?:mi|su|el) sue[ñn]o (?:acaba de|est[aá] por|apenas) (?:comenzar|empezar)|esto es solo el principio|el camino (?:apenas )?(?:comienza|empieza)|un nuevo desaf[ií]o est[aá] a punto|no te equivoques/i;
export type ClosingKind = "reflexion" | "superacion" | "pregunta" | "accion" | "dialogo";

export function closingKind(t: string): ClosingKind { const s = t.trim(); if (MOTIVATIONAL.test(s) || MORAL.test(s)) return "superacion"; if (REFLECTIVE_CLOSE.test(s)) return "reflexion"; if (/\?\s*$/.test(s) || /¿[^?]*\?[^?]*$/.test(s)) return "pregunta"; return /["«:]/.test(s) ? "dialogo" : "accion"; }
/** Problemas del cierre: devuelve el motivo si las últimas líneas suenan a reflexión/moraleja/pregunta retórica de KAP. */
export function closingProblem(lines: { speaker?: string; text: string }[], who = "KAP"): { reason: string; index: number } | undefined {
  const tail = lines.map((l, i) => ({ ...l, i })).filter((l) => l.text.trim()).slice(-2), k = norm(who);
  const stock = tail.slice().reverse().find((l) => STOCK_CLOSE.test(l.text)); if (stock) return { index: stock.i, reason: `El cierre es una frase de tráiler que valdría para cualquier episodio: «${stock.text.slice(0, 80)}»` };
  for (const l of tail.slice().reverse()) { const kind = closingKind(l.text); if (norm(l.speaker ?? "") === k && (kind === "reflexion" || kind === "superacion" || kind === "pregunta")) return { index: l.i, reason: `El cierre de KAP es ${kind === "pregunta" ? "una pregunta retórica" : kind === "reflexion" ? "una reflexión" : "una frase de superación/moraleja"}: «${l.text.slice(0, 80)}»` }; }
  return undefined;
}
export type EndingSig = { hook?: string; consequence?: string; closing?: string; outcome?: string };
/** ¿Este desenlace podría intercambiarse por el de uno de los episodios anteriores sin cambiar prácticamente nada? */
export function endingInterchangeable(cand: EndingSig, prev: EndingSig[]): { index: number; reason: string } | undefined {
  const sig = (e: EndingSig) => new Set(content(`${e.hook ?? ""} ${e.consequence ?? ""} ${e.closing ?? ""}`)), c = sig(cand), ck = closingKind(`${cand.closing ?? cand.hook ?? ""}`);
  for (let i = 0; i < prev.length; i++) { const p = prev[i], sim = jac(c, sig(p)), sameKind = closingKind(`${p.closing ?? p.hook ?? ""}`) === ck, sameOutcome = !!cand.outcome && !!p.outcome && norm(cand.outcome) === norm(p.outcome);
    if (sim >= 0.34 || (sameKind && sameOutcome && sim >= 0.1)) return { index: i, reason: `se parece al desenlace de uno de los episodios anteriores (${sim >= 0.34 ? "mismo contenido" : `mismo tipo de cierre «${ck}» y mismo desenlace «${cand.outcome}»`})` }; }
  return undefined;
}
