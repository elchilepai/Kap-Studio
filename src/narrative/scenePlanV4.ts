/**
 * GUION + ESCENAS V4 (módulo puro) — de una CADENA APROBADA a un guion de 30-45 s y 8-10 escenas que cuentan la historia como acontecimientos DISTINTOS (no una plantilla repetida). Aquí solo hay
 * validación ESTRUCTURAL: cada paso de la cadena cubierto y en orden, acontecimientos que no se repiten, el objeto central participa (también en el resultado), escenas sin KAP que siguen siendo su
 * experiencia, variedad real de planos/tipos/cámara, poca reacción pasiva, duración y voz coherentes. Si la historia funciona visualmente lo decide una persona.
 */
import { CLICKBAIT, textWarningIds } from "./shortSafety.ts";
import { SCENE_TYPES, SHOT_TYPES, MOTION_KINDS, speechSeconds, wordCount, BANNED_OPENINGS, type SceneType, type ShotType, type MotionKind } from "./visualShort.ts";
import { GENERIC, acts, mentions } from "./ideasV2.ts";
import { REACCION, persona } from "./ideasV3.ts";
import { FIELDS_V4, type Chain, type FieldV4, type Issue } from "./chainV4.ts";
import { similarity } from "./ideas.ts";

/** Movimientos que se pueden hacer razonablemente en CapCut sobre una imagen estática (nada de rotaciones 3D, bucles alrededor del personaje ni vídeo generado). */
export const CAMARAS = ["zoom-in", "zoom-out", "pan", "slide", "scale-change", "parallax", "particles", "light"] as const satisfies readonly MotionKind[];
export type Escena = { n: number; cubre: FieldV4[]; tipo: SceneType; kapPresente: boolean; experiencia: string; queOcurre: string; enPantalla: string[]; textoEnPantalla: string; plano: ShotType; perspectiva: string; camara: MotionKind; camaraNota: string; dialogo: string; duracion: number; /** Opcionales (storyboard revisado): función narrativa, composición del encuadre y objeto principal. */ funcion?: string; composicion?: string; objetoPrincipal?: string };
export type Plan = { musica: string; escenas: Escena[] };
export const DURACION = { min: 30, max: 45 };
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const stems = (t: string) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 4).map((w) => w.slice(0, 5)));
const pureReaction = (e: Escena) => REACCION.test(plain(e.queOcurre)) && !acts(e.queOcurre.replace(REACCION, ""));
export const totalSeconds = (p: Plan) => Math.round(p.escenas.reduce((n, e) => n + e.duracion, 0) * 10) / 10;
export const script = (p: Plan) => p.escenas.filter((e) => e.dialogo.trim()).map((e) => e.dialogo.trim()).join(" ");

/** Validación estructural del plan (vacío = bien formado). No juzga si la historia funciona: eso lo decide una persona. */
export function planIssues(p: Plan, chain: Chain): Issue[] {
  const out: Issue[] = [], add = (id: string, msg: string) => out.push({ id, msg }), es = p.escenas, n = es.length;
  if (n < 8 || n > 10) add("escenas", `${n} escenas (deben ser 8-10)`);
  es.forEach((e, k) => { if (e.n !== k + 1) add("escenas", `la escena ${k + 1} está numerada ${e.n}`); });
  const total = totalSeconds(p); if (total < DURACION.min || total > DURACION.max) add("duracion", `duración total ${total} s (debe ser ${DURACION.min}-${DURACION.max} s)`);
  es.forEach((e) => { if (e.duracion < 2 || e.duracion > 7) add("duracion", `escena ${e.n}: ${e.duracion} s (2-7 s)`); const sp = speechSeconds(e.dialogo); if (sp > e.duracion + 0.5) add("voz", `escena ${e.n}: la voz dura ${sp} s y la escena ${e.duracion} s`); });
  // cada paso de la cadena cubierto, en orden, y ninguno acaparado
  const order = FIELDS_V4.filter((f) => f !== "mentalidad"), first = order.map((f) => es.findIndex((e) => e.cubre.includes(f)));
  for (const [k, f] of order.entries()) if (first[k] < 0) add("cadena", `ningún escena cubre el paso «${f}» de la cadena`);
  if (first.every((x) => x >= 0) && first.some((x, k) => k > 0 && x < first[k - 1])) add("cadena", "las escenas no siguen el orden de la cadena (situación → conflicto → motivo → acción → consecuencia → decisión → nueva acción → resultado)");
  for (const f of FIELDS_V4) if (es.filter((e) => e.cubre.includes(f)).length > 3) add("cadena", `el paso «${f}» ocupa más de 3 escenas`);
  // acontecimientos distintos: nada intercambiable
  let rep = false; es.forEach((a, x) => es.forEach((b, y) => { if (y < x && similarity(a.queOcurre, b.queOcurre) >= 0.45) rep = true; })); if (rep) add("repetida", "hay escenas cuyo acontecimiento se repite (si dos escenas se pueden intercambiar sin cambiar la historia, sobra una)");
  es.forEach((e) => { if (wordCount(e.queOcurre) < 8) add("repetida", `escena ${e.n}: «qué ocurre» demasiado corto (< 8 palabras)`); });
  // KAP no tiene que salir siempre, pero sus escenas sin él siguen siendo su experiencia
  const sinKap = es.filter((e) => !e.kapPresente), conKap = es.filter((e) => e.kapPresente); if (conKap.length < 3) add("kap", `KAP aparece en ${conKap.length} escenas (al menos 3: es el protagonista; en las demás no hace falta, pero cada imagen debe seguir siendo parte de su historia)`);
  sinKap.forEach((e) => { if (wordCount(e.experiencia) < 6) add("kap", `escena ${e.n} (sin KAP): explica cómo representa lo que KAP está viviendo`); });
  // variedad real y poca pasividad
  if (new Set(es.map((e) => e.plano)).size < 4) add("variedad", "menos de 4 planos distintos"); if (new Set(es.map((e) => e.tipo)).size < 5) add("variedad", "menos de 5 tipos de escena distintos"); if (new Set(es.map((e) => e.camara)).size < 3) add("variedad", "menos de 3 movimientos de cámara distintos"); es.forEach((e) => { if (!(CAMARAS as readonly string[]).includes(e.camara)) add("camara", `escena ${e.n}: «${e.camara}» no se puede hacer razonablemente en CapCut sobre una imagen estática (usa ${CAMARAS.join(", ")})`); });
  if (es.filter((e) => e.tipo === "KAP_PRESENTADOR").length > 2) add("variedad", "más de 2 escenas con KAP presentando a cámara"); if (es.filter(pureReaction).length > 2) add("pasiva", `${es.filter(pureReaction).length} escenas son solo reacción (mirar, pensar, respirar…): máximo 2`);
  const inert = es.filter((e) => !acts(e.queOcurre) && e.enPantalla.length < 3); if (inert.length > 1) add("pasiva", `escenas sin acción ni elementos en pantalla: ${inert.map((e) => e.n).join(", ")}`);
  // el objeto central participa en la historia y aparece en el resultado
  const uses = es.filter((e) => mentions(chain.objeto, `${e.queOcurre} ${e.enPantalla.join(" ")}`)); if (uses.length < 5) add("objeto", `el objeto «${chain.objeto}» aparece en ${uses.length} escenas (mínimo 5)`);
  if (!es.slice(-2).some((e) => mentions(chain.objeto, `${e.queOcurre} ${e.enPantalla.join(" ")}`))) add("objeto", `el objeto «${chain.objeto}» no aparece en las dos últimas escenas (el resultado debe mostrarlo)`);
  es.forEach((e) => { if (e.enPantalla.length < 2) add("pantalla", `escena ${e.n}: describe al menos 2 elementos en pantalla`); if (wordCount(e.textoEnPantalla) > 6) add("pantalla", `escena ${e.n}: el texto en pantalla debe tener 6 palabras como máximo`); });
  // voz: primera persona de KAP, sin fórmulas, sin revelar el desenlace en el gancho
  const lines = es.filter((e) => e.dialogo.trim()); const hook = es[0]?.dialogo.trim() ?? "";
  if (wordCount(hook) < 6) add("gancho", "la escena 1 debe abrir con un gancho hablado (≥ 6 palabras)");
  if (BANNED_OPENINGS.test(hook) || /^\s*(?:a veces|¿?qu[eé] pas[oó] cuando|sab[ií]a que|el problema es|debes|recuerda|hoy )/i.test(hook) || GENERIC.test(plain(hook))) add("gancho", "el gancho empieza con una fórmula prohibida o suena a frase de coach");
  const early = stems([chain.situacion, chain.conflicto, chain.motivo, chain.accion, chain.consecuencia, chain.objeto].join(" ")), late = [...stems([chain.decision, chain.nuevaAccion, chain.resultado, chain.mentalidad].join(" "))].filter((k) => !early.has(k)), spoil = [...stems(hook)].filter((k) => late.includes(k)); if (spoil.length >= 3) add("gancho", "el gancho revela el desenlace (usa palabras que solo aparecen en la decisión, la nueva acción o el resultado)");
  lines.forEach((e) => { const pe = persona(e.dialogo); if (/\bkap\b/i.test(e.dialogo)) add("voz", `escena ${e.n}: KAP no habla de sí mismo en tercera persona (es quien cuenta la historia)`); else if (pe === "segunda") add("voz", `escena ${e.n}: mezcla segunda persona; KAP cuenta lo que le pasó en primera persona`); });
  const words = wordCount(script(p)); if (words < 60 || words > Math.round(DURACION.max * 2.6)) add("voz", `el guion tiene ${words} palabras (60-${Math.round(DURACION.max * 2.6)} para ${DURACION.min}-${DURACION.max} s)`);
  if (lines.length < 5) add("voz", "el guion habla en menos de 5 escenas (deja alguna escena en silencio, pero no demasiadas)");
  const all = plain([...es.flatMap((e) => [e.dialogo, e.queOcurre, e.textoEnPantalla])].join(" ")), bad = textWarningIds(all); if (bad.length || CLICKBAIT.test(all) || GENERIC.test(all)) add("contenido", `coach genérico, clickbait o contenido no permitido${bad.length ? ` (${bad.join(", ")})` : ""}`);
  return out;
}
export { SCENE_TYPES, SHOT_TYPES, MOTION_KINDS };
