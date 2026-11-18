/**
 * PUERTA DE CALIDAD POR ESCENA (módulo puro, sin IA). Antes de aceptar una escena se pregunta «¿qué ha cambiado al terminar esta escena que
 * no existía al principio?». Cada hallazgo tiene un ÁMBITO que decide cuánto cuesta arreglarlo (la regeneración local es la regla):
 *   · "repair" → se arregla EN CÓDIGO, sin modelo: quitar la frase repetida de relleno, recortar un monólogo de relleno.
 *   · "local"  → se reescriben SOLO esas líneas (rima, voz de adulto, hermano reactivo, mención gratuita, cierre reflexivo), en una sola llamada pequeña.
 *   · "scene"  → solo si el problema es de toda la escena (repite una escena, no cambia nada, personaje no previsto): se regenera completa.
 *   · "info"   → solo aviso (la longitud es la última prioridad: ACCIÓN > INTERACCIÓN > CONSECUENCIA > LONGITUD).
 */
import { norm } from "../memory/text.ts";
import { closingProblem } from "./closing.ts";
import { checkRhyme, firstInterventionOf, type RhymeCheck } from "./rhyme.ts";
import { ADULT_VOICE, MOTIVATIONAL, content, jac, words } from "./review.ts";

export type GateIssueKind = "repite-escena" | "repite-frase" | "sin-cambio" | "personaje-no-previsto" | "monologo-relleno" | "corta" | "voz-adulta" | "hermano-reactivo" | "menciona-memoria" | "cierre-reflexivo" | "rima-invalida";
export type GateScope = "scene" | "local" | "repair" | "info";
export type GateIssue = { kind: GateIssueKind; blocking: boolean; scope: GateScope; text: string; /** Índices de las líneas a reescribir (ámbito local) o a quitar (reparación). */ lines?: number[] };
export type GateLine = { speaker?: string; text: string };
export type GateScene = { lines: GateLine[]; change: string };
export type GateInput = {
  scene: GateScene;
  /** Escenas ya ACEPTADAS (texto, cambio declarado, líneas y, si se conocen, quién dijo cada una). */
  previous: { text: string; change: string; lines: string[]; speakers?: string[] }[];
  /** Personajes que pueden hablar en esta escena (los del beat, el protagonista y los nuevos declarados). */
  speakers: string[];
  /** Personajes de la memoria que NO están en el reparto de este episodio (ni deben hablar ni, de entrada, ser mencionados). */
  memoryOutside: string[];
  protagonist?: string; siblingName?: string; minWords?: number;
  /** Si esta escena contiene la intervención de KAP que debe rimar: «opening» (primera de KAP en el episodio) o «first-rhyme» (su primera improvisación). */
  rhyme?: { mode: "opening" | "first-rhyme"; contextTerms: string[] };
  /** Es la última escena: su cierre no puede ser una reflexión ni una moraleja. */
  isLast?: boolean;
};

const sets = (s: string) => new Set(content(s));
const text = (s: GateScene) => s.lines.map((l) => l.text).join(" ");
const mentions = (t: string, name: string) => new RegExp(`(^|[^a-z0-9ñ])${norm(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9ñ]|$)`).test(norm(t));
const REFLECT_START = /^\s*[¿¡]?\s*(?:y si|tal vez|quiz[aá]s?|a veces|alg[uú]n d[ií]a|nunca|siempre|todo|la vida|el mundo|por qu[eé] (?:yo|me|nadie))/i;
const IS_BLOCKING: GateIssueKind[] = ["repite-escena", "repite-frase", "sin-cambio", "personaje-no-previsto"];
const SCOPE: Record<GateIssueKind, GateScope> = { "repite-escena": "scene", "sin-cambio": "scene", "personaje-no-previsto": "scene", "repite-frase": "repair", "monologo-relleno": "repair", corta: "info", "voz-adulta": "local", "hermano-reactivo": "local", "menciona-memoria": "local", "cierre-reflexivo": "local", "rima-invalida": "local" };

/** Última comprobación de la rima de una escena (se expone para el banco de pruebas y los avisos). */
export function sceneRhyme(lines: GateLine[], rhyme: NonNullable<GateInput["rhyme"]>, who = "KAP"): { check: RhymeCheck; index: number[] } {
  const first = firstInterventionOf(lines, who); let pick = first;
  if (rhyme.mode === "first-rhyme") {   // su primera IMPROVISACIÓN: vale cualquier intervención de KAP de la escena que sea una rima válida
    const k = norm(who); for (let i = 0; i < lines.length; i++) { if (norm(lines[i].speaker ?? "") !== k) continue; const run = firstInterventionOf(lines.slice(i), who); const idx = run.index.map((x) => x + i); if (checkRhyme({ lines: run.texts, contextTerms: rhyme.contextTerms }).rhyme_valid) { pick = { index: idx, texts: run.texts }; break; } i = idx.at(-1) ?? i; }
  }
  return { check: checkRhyme({ lines: pick.texts, contextTerms: rhyme.contextTerms }), index: pick.index };
}

/** Todo lo que impide aceptar la escena tal cual. Vacío = aceptable. */
export function checkScene(inp: GateInput): GateIssue[] {
  const out: GateIssue[] = [], sc = inp.scene, t = text(sc), kap = norm(inp.protagonist ?? "KAP"), prev = inp.previous;
  const add = (kind: GateIssueKind, msg: string, lines?: number[]) => out.push({ kind, blocking: IS_BLOCKING.includes(kind), scope: SCOPE[kind], text: msg, ...(lines?.length ? { lines } : {}) });
  const mine = sets(t), n = words(t).length;
  // repetición de ESCENA entera
  const twin = prev.findIndex((p) => mine.size >= 6 && jac(mine, sets(p.text)) >= 0.5);
  if (twin >= 0) add("repite-escena", `Repite casi literalmente el contenido de una escena anterior (${twin + 1}).`);
  // repetición de FRASE: solo la de relleno (el mismo personaje vuelve a decir lo que ya dijo). Un eco o una burla de OTRO personaje es repetición necesaria.
  const seen = prev.flatMap((p) => p.lines.map((l, i) => ({ w: new Set(words(l)), who: norm(p.speakers?.[i] ?? ""), known: !!p.speakers }))).filter((x) => x.w.size >= 4), own: { w: Set<string>; who: string }[] = [], dupIdx: number[] = [];
  sc.lines.forEach((l, i) => { if (words(l.text).length < 4) return; const w = new Set(words(l.text)), who = norm(l.speaker ?? "");
    const filler = [...seen, ...own.map((o) => ({ ...o, known: true }))].some((x) => jac(x.w, w) >= 0.8 && (!x.known || x.who === who));   // sin datos de quién habló se asume relleno
    if (filler) dupIdx.push(i); else own.push({ w, who }); });
  if (dupIdx.length) add("repite-frase", `La frase «${sc.lines[dupIdx[0]].text.slice(0, 80)}» ya la había dicho el mismo personaje: no repitas diálogos.`, dupIdx);
  // ¿qué ha cambiado? el cambio declarado debe existir, ser nuevo y apoyarse en contenido nuevo
  const ch = sc.change.trim(), allPrev = new Set(prev.flatMap((p) => [...sets(p.text)])), fresh = mine.size ? [...mine].filter((w) => !allPrev.has(w)).length / mine.size : 0;
  if (ch.length < 12 || prev.some((p) => p.change && jac(sets(ch), sets(p.change)) >= 0.6)) add("sin-cambio", "El cambio declarado es vacío o igual al de una escena anterior: ¿qué cambia al terminar esta escena (una acción, un dato nuevo, una reacción, una decisión, una consecuencia)?");
  else if (prev.length && mine.size >= 6 && fresh < 0.3) add("sin-cambio", "La escena apenas añade información nueva respecto a lo ya escrito.");
  // MONÓLOGO DE RELLENO: varias intervenciones seguidas de KAP sin información, acción ni cambio nuevos (y sin acción narrada que lo justifique)
  const narrated = sc.lines.filter((l) => !(l.speaker ?? "").trim() && words(l.text).length >= 8).length;
  if (narrated < 2) { const seenWords = new Set(prev.flatMap((p) => [...sets(p.text)]));
    for (let i = 0; i < sc.lines.length;) { if (norm(sc.lines[i].speaker ?? "") !== kap) { sets(sc.lines[i].text).forEach((w) => seenWords.add(w)); i++; continue; }
      let j = i; while (j + 1 < sc.lines.length && norm(sc.lines[j + 1].speaker ?? "") === kap) j++;
      if (j - i + 1 >= 3) { const run = sc.lines.slice(i, j + 1), nov = run.map((l) => { const s = sets(l.text); const f = s.size ? [...s].filter((w) => !seenWords.has(w)).length / s.size : 0; s.forEach((w) => seenWords.add(w)); return f; });
        const lowNovelty = nov.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, nov.length - 1) < 0.5, reflective = run.filter((l) => REFLECT_START.test(l.text)).length >= 2;
        if (lowNovelty || reflective) { const keep = new Set([0, nov.indexOf(Math.max(...nov.slice(1))) ]); add("monologo-relleno", `KAP encadena ${run.length} intervenciones seguidas sin información, acción ni cambio nuevos: deja el intercambio con los demás o una acción.`, run.map((_, k) => i + k).filter((_, k) => !keep.has(k))); } }
      i = j + 1; } }
  // reparto: la memoria no entra por defecto
  const allowed = new Set(inp.speakers.map(norm).concat(kap));
  for (const l of sc.lines) { const k = norm(l.speaker ?? ""); if (k && !allowed.has(k) && inp.memoryOutside.some((m) => norm(m) === k)) { add("personaje-no-previsto", `«${l.speaker}» (de la memoria) habla en esta escena sin estar en su reparto: la memoria no obliga a usarlo.`); break; } }
  const named = inp.memoryOutside.find((m) => mentions(t, m)); if (named) add("menciona-memoria", `Menciona a «${named}» sin que esta escena lo necesite: quita esa mención.`, sc.lines.map((l, i) => (mentions(l.text, named) ? i : -1)).filter((i) => i >= 0));
  // longitud: SOLO aviso (la última prioridad)
  if (n < (inp.minWords ?? 55)) add("corta", `Escena corta (${n} palabras): puede ser correcto si la acción y la consecuencia están claras.`);
  // voz de KAP y hermano
  const kapIdx = sc.lines.map((l, i) => (norm(l.speaker ?? "") === kap ? i : -1)).filter((i) => i >= 0), kapLines = kapIdx.map((i) => sc.lines[i].text);
  if (kapLines.some((l) => MOTIVATIONAL.test(l)) || (kapLines.join(" ").match(new RegExp(ADULT_VOICE.source, "gi")) ?? []).length >= 2) add("voz-adulta", "KAP suena a eslogan o a adulto que conoce su futuro: haz que hable como un niño de su edad, con cosas concretas de lo que ve y siente ahora.", kapIdx.filter((i) => MOTIVATIONAL.test(sc.lines[i].text) || ADULT_VOICE.test(sc.lines[i].text)));
  if (inp.siblingName) { const idx = sc.lines.map((l, i) => (norm(l.speaker ?? "") === norm(inp.siblingName!) ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2 && idx.every((i) => words(sc.lines[i].text).length <= 5)) add("hermano-reactivo", "El hermano pequeño solo reacciona: dale algo propio (pedir algo concreto, esconder o traer algo, desobedecer, ir a buscar a alguien) con palabras de niño pequeño.", idx); }
  // rima (solo la escena que la lleva) y cierre (solo la última)
  if (inp.rhyme) { const { check, index } = sceneRhyme(sc.lines, inp.rhyme, inp.protagonist); if (!check.rhyme_valid) add("rima-invalida", `La rima de KAP no vale: ${check.reasons.join("; ")}.`, index); }
  if (inp.isLast) { const c = closingProblem(sc.lines, inp.protagonist); if (c) add("cierre-reflexivo", `${c.reason}. Cierra con una acción, un gag, una reacción, una sorpresa o una consecuencia, no con una moraleja.`, [c.index]); }
  return out;
}

/** Reparación EN CÓDIGO (sin modelo): quita las frases repetidas de relleno y recorta el monólogo de relleno. Solo si la escena conserva ≥ 3 líneas y ≥ 2 voces/acciones. */
export function repairLines(lines: GateLine[], issues: GateIssue[]): { lines: GateLine[]; repaired: GateIssueKind[] } {
  const drop = new Set<number>(), kinds: GateIssueKind[] = [];
  for (const i of issues.filter((x) => x.scope === "repair" && x.lines?.length)) { const before = drop.size; i.lines!.forEach((l) => drop.add(l)); if (drop.size > before) kinds.push(i.kind); }
  const next = lines.filter((_, i) => !drop.has(i)), voices = new Set(next.map((l) => norm(l.speaker ?? "")));
  if (!drop.size || next.length < 3 || voices.size < 2) return { lines, repaired: [] };
  return { lines: next, repaired: kinds };
}

/** Texto que se añade al prompt para pedir la regeneración de la ESCENA con TODAS las razones agrupadas (una sola regeneración, no una por detector). */
export const gateFeedback = (issues: GateIssue[]) => `\n\nATENCIÓN: tu versión anterior de esta escena no era aceptable:\n${issues.filter((i) => i.scope !== "info").map((i) => `- ${i.text}`).join("\n")}\nEscríbela de nuevo corrigiendo TODO lo anterior. Antes de responder, comprueba: «¿qué ha cambiado al terminar esta escena que no existía al principio?» y decláralo en "change".`;

/** ¿Queda algo que obligue a regenerar la escena completa? (lo local se arregla por separado). */
export const needsSceneRegen = (issues: GateIssue[]) => issues.some((i) => i.scope === "scene");
export const isBlocking = (issues: GateIssue[]) => issues.some((i) => i.blocking && i.scope !== "repair");
