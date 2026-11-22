/**
 * IDEAS Y HOOKS (módulo puro). Qué es una idea de Short de KAP, cómo se puntúa y se descartan las flojas, y qué es un buen hook. El modelo propone y se autopuntúa; el CÓDIGO penaliza lo genérico
 * (coach, gurú, clickbait), lo repetido y lo que no se puede ver, y selecciona sin elegir ideas mediocres. Público: hombres jóvenes que quieren mejorar su vida; voz propia de KAP (no gurú, no coach).
 */
import { CLICKBAIT, textWarningIds } from "./shortSafety.ts";
import { BANNED_OPENINGS, showsAction, wordCount } from "./visualShort.ts";

export const CATEGORIES = ["mentalidad", "disciplina", "autoestima", "confianza", "relaciones-sanas", "limites", "rechazo", "comunicacion", "habitos", "comparacion", "comportamiento-humano", "dinero", "desarrollo-personal", "procrastinacion", "redes-sociales", "respeto-propio", "responsabilidad", "proposito", "independencia-emocional"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CRITERIA = ["originalidad", "identificacion", "claridad", "potencialVisual", "utilidad", "curiosidad"] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Idea = { category: Category; titulo: string; problema: string; situacion: string; kapVive: string; errorInicial: string; hacerDiferente: string; aprendizaje: string; visual: string; publico: string; scores: Record<Criterion, number> };
export type ScoredIdea = Idea & { id: string; modelScore: number; issues: string[]; flags: string[]; repeatedWith?: string; score: number };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const stems = (t: string) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5)));
export const similarity = (a: string, b: string) => { const x = stems(a), y = stems(b); if (!x.size || !y.size) return 0; let n = 0; for (const k of x) if (y.has(k)) n++; return n / (x.size + y.size - n); };
const ideaText = (i: Idea) => [i.titulo, i.problema, i.situacion, i.kapVive, i.errorInicial, i.hacerDiferente, i.aprendizaje, i.visual].join(" ");

/** Problemas de una idea sola (vacío = bien formada): campos concretos, KAP vive la situación, se puede ver, sin coach/gurú/manipulación/clickbait. */
export function ideaIssues(i: Idea): { issues: string[]; flags: string[] } {
  const issues: string[] = [], flags = [...new Set(textWarningIds(ideaText(i)))];
  for (const [k, min] of [["problema", 5], ["situacion", 8], ["kapVive", 6], ["errorInicial", 4], ["hacerDiferente", 4], ["aprendizaje", 5], ["visual", 8]] as const) if (wordCount(i[k]) < min) issues.push(`${k}: demasiado corto (< ${min} palabras)`);
  if (!/\bkap\b/i.test(i.kapVive)) issues.push("kapVive no cuenta qué le ocurre a KAP");
  if (!showsAction(i.situacion) && !showsAction(i.visual)) issues.push("ni la situación ni la representación visual muestran algo que se pueda ver hacer");
  if (CLICKBAIT.test(plain(ideaText(i)))) flags.push("clickbait");
  if (/\b(?:motivacion|motivarte|mejor version|mentalidad ganadora|exito)\b/.test(plain(i.aprendizaje))) flags.push("aprendizaje-generico");
  return { issues, flags };
}
const mean = (s: Record<Criterion, number>) => Math.round((CRITERIA.reduce((n, k) => n + (s[k] ?? 0), 0) / CRITERIA.length) * 10) / 10;
/** Puntúa: media de las 6 puntuaciones del modelo MENOS penalizaciones del código (genérico −3, clichés de aprendizaje −1, problemas −1 cada uno hasta −3, repetida −2). */
export function scoreIdeas(ideas: Idea[]): ScoredIdea[] {
  const out: ScoredIdea[] = [];
  ideas.forEach((idea, n) => {
    const { issues, flags } = ideaIssues(idea), id = `idea-${String(n + 1).padStart(2, "0")}`; const rep = out.find((o) => similarity(`${o.titulo} ${o.problema} ${o.situacion}`, `${idea.titulo} ${idea.problema} ${idea.situacion}`) >= 0.4);
    const hard = flags.filter((f) => f !== "aprendizaje-generico").length ? 3 : 0, soft = flags.includes("aprendizaje-generico") ? 1 : 0, pen = hard + soft + Math.min(3, issues.length) + (rep ? 2 : 0), modelScore = mean(idea.scores);
    out.push({ ...idea, id, modelScore, issues, flags, ...(rep ? { repeatedWith: rep.id } : {}), score: Math.max(0, Math.round((modelScore - pen) * 10) / 10) });
  });
  return out;
}
/** Selecciona las mejores SIN elegir ideas mediocres: puntuación mínima, sin avisos de contenido, sin repetidas y como máximo una por categoría. */
export function selectIdeas(scored: ScoredIdea[], o: { k?: number; min?: number } = {}): string[] {
  const k = o.k ?? 5, min = o.min ?? 6.5, used = new Set<string>(), out: string[] = [];
  for (const i of [...scored].sort((a, b) => b.score - a.score)) { if (out.length >= k) break; if (i.score < min || i.flags.length || i.repeatedWith || i.issues.length > 1 || used.has(i.category)) continue; used.add(i.category); out.push(i.id); }
  return out;
}

// ---------------------------------------------------------------- hooks
export const HOOK_KINDS = ["pregunta-incomoda", "situacion-reconocible", "contradiccion", "afirmacion-inesperada", "mini-historia", "curiosidad"] as const;
export type HookKind = (typeof HOOK_KINDS)[number];
export type Hook = { type: HookKind; text: string };
/** Problemas de un hook solo: breve (KAP lo dice en 3-4 s), sin muletillas de presentador, sin clickbait, sin coach/gurú/manipulación. */
export function hookIssues(h: Hook): string[] {
  const why: string[] = [], n = wordCount(h.text);
  if (!HOOK_KINDS.includes(h.type)) why.push(`tipo inválido «${h.type}»`);
  if (n < 3 || n > 18) why.push(`${n} palabras (un hook se dice en 3-4 s: 3-18)`);
  if (BANNED_OPENINGS.test(h.text) || /^\s*(?:en este|vamos a|te voy a|aprende|descubre|hoy )/i.test(h.text)) why.push("empieza con una muletilla de presentador");
  if (CLICKBAIT.test(plain(h.text))) why.push("clickbait o promesa vacía");
  for (const id of textWarningIds(h.text)) why.push(`contenido: ${id}`);
  return why;
}
/** Problemas del conjunto de 5 hooks de una idea: 5, de tipos distintos y sin repetirse entre sí. */
export function hookSetIssues(hooks: Hook[]): string[] {
  const why: string[] = []; if (hooks.length !== 5) why.push(`hay ${hooks.length} hooks (deben ser 5)`);
  if (new Set(hooks.map((h) => h.type)).size < 4) why.push("hooks de pocos tipos distintos (mínimo 4)");
  hooks.forEach((h, i) => { for (const [j, g] of hooks.entries()) if (j < i && similarity(h.text, g.text) >= 0.5) why.push(`el hook ${i + 1} repite al ${j + 1}`); });
  hooks.forEach((h, i) => { const bad = hookIssues(h); if (bad.length) why.push(`hook ${i + 1}: ${bad.join("; ")}`); });
  return why;
}
