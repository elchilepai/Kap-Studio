/**
 * MODELO DE ACCIÓN (módulo puro, isomorfo: lo usan la línea de tiempo del montaje y el director de animación).
 * Una narración como «se levanta, cruza el pasillo, abre la puerta y mira hacia el salón» NO son cuatro frases con su silencio: es UNA acción continua.
 * Cada paso tiene su naturaleza (locomoción, gesto, reacción, mirada…) y una duración típica que sale del TIPO de acción (no de contar cláusulas), y el
 * siguiente paso EMPIEZA antes de que acabe el anterior (solape): se levanta ↔ empieza a caminar, llega ↔ ya alcanza la puerta.
 */
export type StepKind = "posture" | "run" | "locomotion" | "handle" | "hold" | "look" | "sound" | "reaction" | "emote" | "other";
export type Step = { clause: string; kind: StepKind; dur: number; overlap: number; /** sin verbo de acción: solo describe (no mueve nada) */ descriptive: boolean };
export type ChainedStep = Step & { start: number };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** [patrón sobre texto sin tildes, naturaleza, duración (s), solape con el paso siguiente (s)]. Duraciones TÍPICAS: el director ajusta la locomoción a la distancia real. */
export const ACTION_MODEL: [RegExp, StepKind, number, number][] = [
  [/\b(?:se levanta\w*|se incorpora\w*|se pone de pie)\b/, "posture", 0.7, 0.35],
  [/\b(?:se sienta\w*|se agacha\w*|se arrodilla\w*|se inclina\w*)\b/, "posture", 0.8, 0.2],
  [/\b(?:corre\w*|echa a correr|sale corriendo|sale disparad\w*)\b/, "run", 1.5, 0.25],
  [/\b(?:cruza\w*|recorre\w*|atraviesa\w*)\b/, "locomotion", 1.9, 0.35],
  [/\b(?:se acerca\w*|se aproxima\w*|se dirige\w*|camina\w*|avanza\w*|entra\b|sale\b|llega\w*|se marcha\w*|se aleja\w*|se va\b)/, "locomotion", 1.7, 0.3],
  [/\b(?:abre|abrir|cierra|cerrar|coge\w*|agarra\w*|saca\w*|toma\w*|recoge\w*|guarda\w*|deja\b|apoya\w*|suelta\w*|tira\b|lanza\w*|empuja\w*|toca\w*|aparta\w*|esconde\w*|se pone\b|se quita\b|sostiene|sujeta\w*|abraza\w*|enciende\w*|apaga\w*|gira\b)\b/, "handle", 0.85, 0.2],
  [/\b(?:se detiene|se para\b|se queda (?:quiet\w*|inmovil\w*|paralizad\w*)|se congela\w*|deja de moverse|frena\w*)\b/, "hold", 0.6, 0],
  [/\b(?:se oye\w*|se escucha\w*|suena\w*|portazo|grito\w*|ruido|golpe|estruendo)\b/, "sound", 0.9, 0.3],
  [/\b(?:se sobresalta\w*|se asusta\w*|retrocede\w*|da un paso atras|se estremece\w*|se echa atras)\b/, "reaction", 0.8, 0.2],
  [/\b(?:mira\w*|observa\w*|escucha\w*|oye\b|se gira\w*|se vuelve\w*|levanta la cabeza|alza la vista|busca\w*|se asoma\w*)\b/, "look", 0.75, 0.2],
  [/\b(?:sonrie\w*|suspira\w*|asiente\w*|niega\w*|se encoge de hombros|se rie|llora\w*|frunce\w*|bosteza\w*|se estira\w*|respira\w*|traga\w*)\b/, "emote", 0.8, 0.2],
];
const VERB_RE = new RegExp(ACTION_MODEL.map(([r]) => r.source).join("|"));
/** ¿La cláusula contiene algún verbo de acción/percepción/reacción? (si no, solo describe). */
export const hasAction = (clause: string) => VERB_RE.test(plain(clause));

/** Cláusulas de una narración: frases, comas, «pero/mientras» y «… y <otro verbo de acción>». */
export function clausesOfNarration(text: string): string[] {
  const out: string[] = [];
  for (const piece of text.split(/[.!?…;]+|,|\bpero\b|\bmientras\b/i).map((x) => x.trim()).filter((x) => x.length > 2)) {
    const m = /^(.*?\S)\s+y\s+((?:se\s+)?[a-záéíóúñ]+.*)$/i.exec(piece);
    if (m && hasAction(m[1]) && hasAction(m[2])) out.push(m[1].trim(), m[2].trim()); else out.push(piece);
  }
  return out;
}
export function planClauses(text: string): Step[] {
  return clausesOfNarration(text).map((clause) => { const n = plain(clause), hit = ACTION_MODEL.find(([re]) => re.test(n));
    return hit ? { clause, kind: hit[1], dur: hit[2], overlap: hit[3], descriptive: false } : { clause, kind: "other" as StepKind, dur: 0.7, overlap: 0.1, descriptive: true }; });
}
/** Encadena los pasos como UNA acción continua: cada uno empieza cuando el anterior está a punto de acabar (solape). */
export function chain(steps: Step[]): ChainedStep[] {
  let t = 0; return steps.map((s, i) => { const c: ChainedStep = { ...s, start: Math.max(0, t) }; t = c.start + s.dur - (i < steps.length - 1 ? s.overlap : 0); return c; });
}
export const chainSeconds = (steps: ChainedStep[]) => (steps.length ? Math.max(...steps.map((s) => s.start + s.dur)) : 0);
/** Duración de una narración de acción: sale del tipo y del encadenado de sus pasos, NO de contar cláusulas. */
export const actionDuration = (text: string) => Math.max(0.8, chainSeconds(chain(planClauses(text))));
