/**
 * PUERTA DE CALIDAD POR ESCENA (módulo puro, sin IA). Antes de aceptar una escena del generador por arco se pregunta:
 * «¿qué ha cambiado al terminar esta escena que no existía al principio?». Si la respuesta es «nada», o la escena repite lo ya escrito,
 * se REGENERA con la razón concreta (o se elimina si, tras reintentarlo, sigue sin aportar). Lo subjetivo (escena corta, voz de adulto,
 * hermano reactivo, mención gratuita de la memoria) también se regenera, pero si persiste solo queda como aviso.
 */
import { norm } from "../memory/text.ts";
import { ADULT_VOICE, MOTIVATIONAL, content, jac, words } from "./review.ts";

export type GateIssueKind = "repite-escena" | "repite-frase" | "sin-cambio" | "personaje-no-previsto" | "corta" | "voz-adulta" | "hermano-reactivo" | "menciona-memoria";
export type GateIssue = { kind: GateIssueKind; blocking: boolean; text: string };
export type GateScene = { lines: { speaker?: string; text: string }[]; change: string };
export type GateInput = {
  scene: GateScene;
  /** Escenas ya ACEPTADAS (texto, cambio declarado y líneas). */
  previous: { text: string; change: string; lines: string[] }[];
  /** Personajes que pueden hablar en esta escena (los del beat, el protagonista y los nuevos declarados). */
  speakers: string[];
  /** Personajes de la memoria que NO están en el reparto de este episodio (ni deben hablar ni, de entrada, ser mencionados). */
  memoryOutside: string[];
  protagonist?: string; siblingName?: string; minWords?: number;
};

const sets = (s: string) => new Set(content(s));
const text = (s: GateScene) => s.lines.map((l) => l.text).join(" ");
const mentions = (t: string, name: string) => new RegExp(`(^|[^a-z0-9ñ])${norm(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9ñ]|$)`).test(norm(t));
const BLOCKING: GateIssueKind[] = ["repite-escena", "repite-frase", "sin-cambio", "personaje-no-previsto"];

/** Todo lo que impide aceptar la escena tal cual. Vacío = aceptable. */
export function checkScene(inp: GateInput): GateIssue[] {
  const out: GateIssue[] = [], sc = inp.scene, t = text(sc), kap = norm(inp.protagonist ?? "KAP"), prev = inp.previous;
  const add = (kind: GateIssueKind, msg: string) => out.push({ kind, blocking: BLOCKING.includes(kind), text: msg });
  const mine = sets(t), n = words(t).length;
  // repetición: de escena, de frase (dentro y fuera de la escena)
  const twin = prev.findIndex((p) => mine.size >= 6 && jac(mine, sets(p.text)) >= 0.5);
  if (twin >= 0) add("repite-escena", `Repite casi literalmente el contenido de una escena anterior (${twin + 1}).`);
  const seen = prev.flatMap((p) => p.lines).filter((l) => words(l).length >= 4).map((l) => new Set(words(l))), own: Set<string>[] = []; let dup = "";
  for (const l of sc.lines) { if (words(l.text).length < 4) continue; const w = new Set(words(l.text)); if ([...seen, ...own].some((x) => jac(x, w) >= 0.8)) { dup = l.text; break; } own.push(w); }
  if (dup) add("repite-frase", `La frase «${dup.slice(0, 80)}» ya se había dicho; no repitas diálogos.`);
  // ¿qué ha cambiado? el cambio declarado debe existir, ser nuevo y apoyarse en contenido nuevo
  const ch = sc.change.trim(), allPrev = new Set(prev.flatMap((p) => [...sets(p.text)])), fresh = mine.size ? [...mine].filter((w) => !allPrev.has(w)).length / mine.size : 0;
  if (ch.length < 12 || prev.some((p) => p.change && jac(sets(ch), sets(p.change)) >= 0.6)) add("sin-cambio", "El cambio declarado es vacío o igual al de una escena anterior: ¿qué cambia al terminar esta escena (una acción, un dato nuevo, una reacción, una decisión, una consecuencia)?");
  else if (prev.length && mine.size >= 6 && fresh < 0.3) add("sin-cambio", "La escena apenas añade información nueva respecto a lo ya escrito.");
  // reparto: la memoria no entra por defecto
  const allowed = new Set(inp.speakers.map(norm).concat(kap));
  for (const l of sc.lines) { const k = norm(l.speaker ?? ""); if (k && !allowed.has(k) && inp.memoryOutside.some((m) => norm(m) === k)) { add("personaje-no-previsto", `«${l.speaker}» (de la memoria) habla en esta escena sin estar en su reparto: la memoria no obliga a usarlo.`); break; } }
  const named = inp.memoryOutside.find((m) => mentions(t, m)); if (named) add("menciona-memoria", `Menciona a «${named}» sin que esta escena lo necesite.`);
  // corta, voz, hermano
  if (n < (inp.minWords ?? 55)) add("corta", `Escena corta (${n} palabras): dale contenido real (una acción concreta, la reacción de otro personaje, un dato nuevo o un cambio), no relleno ni frases motivacionales.`);
  const kapLines = sc.lines.filter((l) => norm(l.speaker ?? "") === kap).map((l) => l.text);
  if (kapLines.some((l) => MOTIVATIONAL.test(l)) || (kapLines.join(" ").match(new RegExp(ADULT_VOICE.source, "gi")) ?? []).length >= 2) add("voz-adulta", "KAP suena a eslogan o a adulto que conoce su futuro: haz que hable como un niño de su edad, con cosas concretas de lo que ve y siente ahora.");
  if (inp.siblingName) { const s = sc.lines.filter((l) => norm(l.speaker ?? "") === norm(inp.siblingName!)).map((l) => l.text);
    if (s.length >= 2 && s.every((l) => words(l).length <= 5)) add("hermano-reactivo", "El hermano pequeño solo reacciona: dale algo propio (pedir algo concreto, esconder o traer algo, desobedecer, ir a buscar a alguien) con palabras de niño pequeño."); }
  return out;
}

/** Texto que se añade al prompt para pedir la regeneración con razones concretas. */
export const gateFeedback = (issues: GateIssue[]) => `\n\nATENCIÓN: tu versión anterior de esta escena no era aceptable:\n${issues.map((i) => `- ${i.text}`).join("\n")}\nEscríbela de nuevo corrigiendo TODO lo anterior. Antes de responder, comprueba: «¿qué ha cambiado al terminar esta escena que no existía al principio?» y decláralo en "change".`;

export const isBlocking = (issues: GateIssue[]) => issues.some((i) => i.blocking);
