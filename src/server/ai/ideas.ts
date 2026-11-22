/**
 * GENERADOR REAL DE IDEAS Y HOOKS (Qwen). Las ideas se piden por LOTES (una por categoría, para cubrir temas distintos y mantener cada llamada corta en CPU); cada lote se valida con el
 * esquema y el código, y los hooks de cada idea seleccionada se piden en otra llamada con UNA corrección si no cumplen. No hay guion, storyboard ni imágenes aquí.
 */
import { z } from "zod";
import type { LlmClient, LlmUsage } from "@/ports/studio";
import { CATEGORIES, CRITERIA, HOOK_KINDS, hookSetIssues, type Hook, type Idea, type ScoredIdea } from "@/narrative/ideas";
import { generateJson, sumUsage } from "./json";
import { KAP_PERSONALITY } from "./prompts";

const score = z.number().int().min(1).max(10);
const f = (max: number) => z.string().min(8).max(max);
export const IdeaSchema = z.object({ category: z.enum(CATEGORIES), titulo: z.string().min(6).max(80), problema: f(130), situacion: f(160), kapVive: f(150), errorInicial: f(130), hacerDiferente: f(130), aprendizaje: f(130), visual: f(170), publico: z.string().min(4).max(70), scores: z.object(Object.fromEntries(CRITERIA.map((c) => [c, score])) as Record<(typeof CRITERIA)[number], typeof score>) });
export const IdeasBatchSchema = z.object({ ideas: z.array(IdeaSchema).min(1).max(8) });
export const HooksSchema = z.object({ hooks: z.array(z.object({ type: z.enum(HOOK_KINDS), text: z.string().min(8).max(160) })).min(5).max(5) });

/** Identidad editorial: público y voz de KAP (sin gurú, sin coach, sin copiar a nadie). */
export const EDITORIAL = `PÚBLICO: hombres jóvenes (16-30) que quieren mejorar su vida. TEMAS: mentalidad, disciplina, autoestima, confianza, relaciones sanas, límites, rechazo, comunicación, hábitos, comparación, comportamiento humano, dinero y desarrollo personal; psicología cotidiana explicada con situaciones reales.
VOZ: KAP es una persona que está aprendiendo estas cosas mientras las vive: se equivoca, se pone nervioso, reflexiona y aprende; NO es un gurú ni un coach perfecto. Directo, seguro sin ser agresivo, honesto, práctico, con humor seco. Voz propia: no imites frases, guiones ni personalidad de ningún creador.
PROHIBIDO: motivación genérica («tú puedes con todo», «cree en ti», «sal de tu zona de confort»), lenguaje de gurú (alfa/beta, secretos, fórmulas mágicas), humillar o sentirse superior, generalizaciones sobre hombres o mujeres, técnicas para manipular o controlar a otra persona. En relaciones: respeto, comunicación, escucha, límites e interés mutuo; nunca «cómo conseguir» a alguien.`;

export const IDEAS_SYSTEM = `Eres el guionista de la serie de Shorts de KAP (animación 2D, 20-60 s). Propones IDEAS de Shorts.
${KAP_PERSONALITY}
${EDITORIAL}
Cada idea es un problema de la vida real que se puede MOSTRAR: una situación cotidiana reconocible con objetos y acciones concretas (el móvil, un mensaje, el gimnasio, una factura, una conversación), que KAP vive, en la que reacciona mal al principio y de la que sale con una acción pequeña y distinta.
Respondes SOLO con JSON: {"ideas":[{"category","titulo","problema","situacion","kapVive","errorInicial","hacerDiferente","aprendizaje","visual","publico","scores":{"originalidad","identificacion","claridad","potencialVisual","utilidad","curiosidad"}}]}.
- "titulo": claro y concreto (no «La importancia de…»). "problema": el problema real en una frase. "situacion": la escena cotidiana concreta y reconocible. "kapVive": qué le ocurre a KAP en ella (empieza por «KAP»). "errorInicial": su mala reacción. "hacerDiferente": la acción concreta y pequeña que puede hacer. "aprendizaje": lo que el espectador entiende (una idea concreta, nunca una frase de motivación). "visual": cómo se representa en imágenes (acciones, objetos, metáforas, visualización mental). "publico": a quién habla.
- "scores": enteros 1-10 de originalidad, identificacion (¿«eso me pasa»?), claridad, potencialVisual, utilidad y curiosidad. SÉ EXIGENTE y honesto: una idea normal merece 5-6; un 9 es excepcional.
- Una idea por categoría pedida, todas DISTINTAS entre sí; nada de ideas parecidas con otras palabras.`;
export const ideasPrompt = (categories: readonly string[], avoid: string[]) => `Genera ${categories.length} ideas, UNA por cada una de estas categorías (usa el valor exacto en "category"): ${categories.join(", ")}.${avoid.length ? `\nYa existen estas ideas; NO repitas su situación ni su enfoque: ${avoid.map((t) => `«${t}»`).join("; ")}.` : ""}`;

export const HOOKS_SYSTEM = `Eres el guionista de KAP. Escribes HOOKS: la primera frase que KAP dice a cámara (o en voz en off) en los primeros 3 segundos de un Short.
${EDITORIAL}
Respondes SOLO con JSON: {"hooks":[{"type","text"}]} con EXACTAMENTE 5 hooks de tipos DISTINTOS elegidos entre: pregunta-incomoda, situacion-reconocible, contradiccion, afirmacion-inesperada, mini-historia, curiosidad.
- Cada hook: 5-16 palabras, en español natural, directo y con el humor seco de KAP; se entiende solo, sin contexto; genera curiosidad por lo que muestra, sin exagerar.
- PROHIBIDO empezar con «Hoy vamos a hablar de…», «Hola», «En este vídeo…», «Te voy a explicar…», «Aprende…». PROHIBIDO el clickbait vacío y las promesas falsas («no vas a creer», «el secreto», «esto cambiará tu vida», «nadie te lo cuenta», porcentajes inventados).
- Tipos: pregunta-incomoda (una pregunta que escuece), situacion-reconocible (una escena que el espectador ya vivió), contradiccion (dos cosas que parecen opuestas), afirmacion-inesperada (algo que choca con lo que se cree), mini-historia (una micro-escena de KAP en una frase), curiosidad (deja una pregunta abierta concreta).
- Los 5 hooks deben ser DISTINTOS entre sí (ni la misma idea con otras palabras).`;
export const hooksPrompt = (i: Pick<Idea, "titulo" | "problema" | "situacion" | "kapVive" | "errorInicial" | "hacerDiferente">, why = "") => `IDEA: «${i.titulo}».\nProblema: ${i.problema}\nSituación: ${i.situacion}\nQué le pasa a KAP: ${i.kapVive}\nError inicial: ${i.errorInicial}\nQué hace diferente: ${i.hacerDiferente}\n\nEscribe los 5 hooks.${why ? `\n\n# Corrección obligatoria\nTu versión anterior no sirve: ${why}. Escríbelos de nuevo.` : ""}`;

export type BatchResult = { ideas: Idea[]; usage?: LlmUsage; calls: number };
/** Un lote de ideas (una por categoría). Devuelve solo las que cumplen el esquema y tienen una categoría pedida; el resto se descarta y se cuenta. */
export async function generateIdeaBatch(llm: LlmClient, o: { categories: readonly string[]; avoid: string[]; signal?: AbortSignal; temperature?: number }): Promise<BatchResult & { dropped: number }> {
  const r = await generateJson(llm, IdeasBatchSchema, { system: IDEAS_SYSTEM, prompt: ideasPrompt(o.categories, o.avoid), maxTokens: 400 * o.categories.length + 300, temperature: o.temperature ?? 0.8, signal: o.signal }, { retries: 2 });
  if (!r.ok) throw new Error(`El modelo no devolvió ideas válidas: ${r.errors.join("; ")}`);
  const asked = new Set(o.categories), kept = r.data.ideas.filter((i) => asked.has(i.category)), seen = new Set<string>(), uniq = kept.filter((i) => (seen.has(i.category) ? false : (seen.add(i.category), true)));
  return { ideas: uniq as Idea[], usage: r.usage, calls: r.attempts, dropped: r.data.ideas.length - uniq.length };
}
/** Los 5 hooks de una idea; si el conjunto no cumple, UNA corrección con los motivos y se queda con el mejor intento (sin inventar nada). */
export async function generateHooks(llm: LlmClient, idea: ScoredIdea, o: { signal?: AbortSignal; temperature?: number } = {}): Promise<{ hooks: Hook[]; issues: string[]; repaired: boolean; usage?: LlmUsage; calls: number }> {
  const ask = async (why = "") => generateJson(llm, HooksSchema, { system: HOOKS_SYSTEM, prompt: hooksPrompt(idea, why), maxTokens: 450, temperature: o.temperature ?? 0.8, signal: o.signal }, { retries: 2 });
  const a = await ask(); if (!a.ok) throw new Error(`El modelo no devolvió hooks válidos: ${a.errors.join("; ")}`);
  let hooks = a.data.hooks as Hook[], issues = hookSetIssues(hooks), calls = a.attempts, repaired = false; const usages = [a.usage];
  if (issues.length) { const b = await ask(issues.join(" | ")); calls += b.attempts; usages.push(b.usage); repaired = true; if (b.ok) { const i2 = hookSetIssues(b.data.hooks as Hook[]); if (i2.length <= issues.length) { hooks = b.data.hooks as Hook[]; issues = i2; } } }
  return { hooks, issues, repaired, usage: sumUsage(usages), calls };
}
