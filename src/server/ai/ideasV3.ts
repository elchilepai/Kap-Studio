/**
 * GENERADOR REAL V3 (Qwen): UNA idea por llamada, sin regenerar (esta prueba mide si el modelo entiende la dirección). Cada idea es una cadena causal contada con 8-14 viñetas-acontecimiento.
 * Tras los bloqueos del código, un CRÍTICO (otra llamada a Qwen, temperatura baja) comprueba la coherencia enlace a enlace. Hooks: 5 candidatos en tercera persona → 3 finales.
 */
import { z } from "zod";
import type { LlmClient, LlmUsage } from "@/ports/studio";
import { CATEGORIES_V3, ENLACES, FUNCIONES, HOOK_KINDS_V3, PERSPECTIVAS, PLANOS, hookSetIssuesV3, type CategoryV3, type Critic, type HookV3, type IdeaV3 } from "@/narrative/ideasV3";
import { EDITORIAL_V2 } from "./ideasV2";
import { generateJson, sumUsage } from "./json";
import { KAP_PERSONALITY } from "./prompts";

const s = (min: number, max: number) => z.string().min(min).max(max);
export const VinetaSchema = z.object({ funcion: z.enum(FUNCIONES), sujeto: s(2, 40), que: s(20, 140), objeto: s(0, 40), plano: z.enum(PLANOS), perspectiva: z.enum(PERSPECTIVAS), composicion: s(8, 90) });
export const IdeaV3Schema = z.object({ category: z.enum(CATEGORIES_V3), titulo: s(6, 70), situacion: s(30, 200), motivo: s(20, 150), accionKap: s(15, 140), objeto: s(3, 40), consecuencia: s(20, 150), decision: s(20, 150), nuevaAccion: s(15, 140), resultado: s(20, 150), mentalidad: s(30, 190), vinetas: z.array(VinetaSchema).min(8).max(14) });
export const IdeasV3Schema = z.object({ ideas: z.array(IdeaV3Schema).length(1) });
export const CriticSchema = z.object({ enlaces: z.array(z.object({ enlace: z.enum(ENLACES), coherente: z.boolean(), motivo: s(10, 140) })).length(7), accionCausadaPorMotivo: z.boolean(), identificacion: z.number().int().min(1).max(5), fuerzaSituacion: z.number().int().min(1).max(5), potencialShort: z.number().int().min(1).max(5) });
export const HooksV3Schema = z.object({ hooks: z.array(z.object({ type: z.enum(HOOK_KINDS_V3), text: s(20, 170) })).length(5) });

/** Dirección psicológica por categoría (abstracta: el modelo inventa la situación concreta, el objeto y el entorno). */
export const SEEDS_V3: Record<CategoryV3, string> = {
  aprobacion: "KAP dice que sí a algo que no quiere hacer para no quedar mal, y esa decisión le cuesta algo concreto; después tiene una segunda oportunidad y actúa distinto",
  comparacion: "KAP está construyendo algo propio, se compara con el avance de otra persona y empieza a abandonar lo suyo; después retoma su camino",
  justificarse: "KAP recibe una crítica o una señal de que se ha equivocado y se pone a justificarse antes de escuchar; la justificación empeora la situación; después escucha primero",
  evitacion: "KAP tiene un objetivo importante y se llena de tareas secundarias para evitar hacerlo; después corta lo secundario y empieza",
  "hablar-sin-hacer": "KAP lleva semanas hablando de lo que quiere hacer pero no ha ejecutado ninguna acción concreta; ve la evidencia y da el primer paso real",
};
export const IDEAS_V3_SYSTEM = `Eres el guionista de los Shorts de KAP. Cada idea es una PEQUEÑA HISTORIA contada con 8-14 ILUSTRACIONES ESTÁTICAS 2D estilo stickman (sin animación corporal compleja). KAP es el protagonista, pero NO tiene que salir en todas las viñetas (objetos, manos, teléfono, ordenador, entorno, POV, consecuencias, metáforas).
${KAP_PERSONALITY}
${EDITORIAL_V2}
LA CADENA DEBE SER COHERENTE, enlace a enlace: situación → motivo → acción → consecuencia → decisión → nueva acción → resultado → mentalidad.
- situacion: dónde está KAP y qué ocurre (concreto, cotidiano). motivo: QUÉ QUIERE O TEME KAP y por eso actúa (el conflicto psicológico). accionKap: lo que KAP HACE como CONSECUENCIA DIRECTA de ese motivo (empieza por «KAP» + verbo de acción visible; nada de callarse, mirar, pensar ni sentirse). consecuencia: lo que ocurre y se VE por esa acción. decision: el momento en que KAP se da cuenta y elige. nuevaAccion: lo que KAP hace DISTINTO (acción visible, otra distinta de accionKap). resultado: lo que se ve cambiar. mentalidad: lo que KAP ha entendido, específico y ligado a su conducta (empieza por «KAP descubre/entiende/se da cuenta de que…»; PROHIBIDO empezar con «A veces», «El problema es», «Debes entender», «La clave es», «Recuerda que», «Hay que»; PROHIBIDA la moraleja genérica).
- NO aceptes contradicciones. Mal: «KAP presta un libro» y luego «KAP devuelve el libro» como acción principal. Mal: KAP destroza algo suyo porque otro tiene algo mejor (sin relación psicológica clara). La acción llamativa NO puede ponerse para cumplir una regla: tiene que salir del motivo.
- vinetas (8-14): una secuencia de ACONTECIMIENTOS distintos que cuenta la historia en orden, como una película; cada viñeta es algo que OCURRE (no un plano distinto de lo mismo). Cada una: funcion (${FUNCIONES.join(", ")}), sujeto (quién o qué se ve: «KAP», «el móvil», «la mesa»…), que (el acontecimiento, ≥6 palabras), objeto (el objeto o entorno clave, o ""), plano (${PLANOS.join(", ")}), perspectiva (${PERSPECTIVAS.join(", ")}), composicion (cómo se coloca en el cuadro). Las viñetas deben incluir, en este orden, las funciones accion, consecuencia, decision, nueva-accion y resultado. MÁXIMO un tercio de viñetas de pura reacción (mirar, pensar, suspirar, respirar, sonreír, quedarse quieto). Al menos algunas viñetas sin KAP en pantalla.
Respondes SOLO con JSON {"ideas":[{category,titulo,situacion,motivo,accionKap,objeto,consecuencia,decision,nuevaAccion,resultado,mentalidad,vinetas:[…]}]} con EXACTAMENTE 1 idea.`;
export const ideasV3Prompt = (cat: CategoryV3, avoid: string[]) => `Genera 1 idea para la categoría «${cat}» (valor exacto en "category"). Dirección psicológica (inventa tú la situación concreta, el objeto y el entorno): ${SEEDS_V3[cat]}.${avoid.length ? `\nYa existen estas ideas; usa OTRA situación, otro objeto y otro entorno: ${avoid.map((a) => `«${a}»`).join("; ")}.` : ""}`;

export async function generateIdeaV3(llm: LlmClient, o: { category: CategoryV3; avoid: string[]; signal?: AbortSignal; temperature?: number }): Promise<{ idea: IdeaV3; usage?: LlmUsage; calls: number }> {
  const r = await generateJson(llm, IdeasV3Schema, { system: IDEAS_V3_SYSTEM, prompt: ideasV3Prompt(o.category, o.avoid), maxTokens: 2300, temperature: o.temperature ?? 0.8, signal: o.signal }, { retries: 2 });
  if (!r.ok) throw new Error(`El modelo no devolvió una idea válida: ${r.errors.join("; ")}`);
  return { idea: { ...r.data.ideas[0], category: o.category } as IdeaV3, usage: r.usage, calls: r.attempts };
}

export const CRITIC_SYSTEM = `Eres un editor MUY ESTRICTO de historias para Shorts. Recibes una idea con su cadena causal y juzgas si la historia tiene LÓGICA. Respondes SOLO con JSON {"enlaces":[{"enlace","coherente","motivo"}],"accionCausadaPorMotivo","identificacion","fuerzaSituacion","potencialShort"}.
- "enlaces": evalúa EXACTAMENTE estos 7, uno por uno: ${ENLACES.join(", ")}. coherente=true solo si el segundo elemento se sigue de verdad del primero y no se contradice con él. "motivo": una frase que justifica tu respuesta (si es false, di qué falla).
- Ejemplos de enlace ROTO: la situación es «KAP presta un libro» y la acción principal es «KAP devuelve el libro»; KAP destroza su jardín porque un vecino tiene un reloj bonito (no hay relación psicológica entre el conflicto y la acción); la mentalidad no tiene nada que ver con lo que ha ocurrido; el resultado contradice la nueva acción.
- "accionCausadaPorMotivo": true solo si la acción de KAP es lo que una persona haría de verdad movida por ese motivo.
- "identificacion", "fuerzaSituacion", "potencialShort": enteros 1-5. 3 = normal, 5 = excepcional (casi nunca). 1-2 = floja. Sé crítico: la mayoría de ideas merece 2 o 3.
Sé exigente: una historia incoherente es peor que no tener historia.`;
export const criticPrompt = (i: IdeaV3) => `IDEA «${i.titulo}»\nSituación: ${i.situacion}\nMotivo: ${i.motivo}\nAcción de KAP: ${i.accionKap}\nConsecuencia: ${i.consecuencia}\nDecisión: ${i.decision}\nNueva acción: ${i.nuevaAccion}\nResultado: ${i.resultado}\nMentalidad: ${i.mentalidad}\n\nJuzga la coherencia.`;
export async function criticV3(llm: LlmClient, idea: IdeaV3, o: { signal?: AbortSignal } = {}): Promise<{ critic: Critic; usage?: LlmUsage; calls: number }> {
  const r = await generateJson(llm, CriticSchema, { system: CRITIC_SYSTEM, prompt: criticPrompt(idea), maxTokens: 900, temperature: 0.1, signal: o.signal }, { retries: 2 });
  if (!r.ok) throw new Error(`El crítico no devolvió un veredicto válido: ${r.errors.join("; ")}`); return { critic: r.data as Critic, usage: r.usage, calls: r.attempts };
}

export const HOOKS_V3_SYSTEM = `Eres el guionista de KAP. Escribes HOOKS: la primera frase del Short (3-4 segundos), que entra DIRECTAMENTE en la situación concreta.
${EDITORIAL_V2}
Respondes SOLO con JSON {"hooks":[{"type","text"}]} con EXACTAMENTE 5 hooks, UNO de cada tipo: situacion, conflicto, curiosidad, contradiccion, mini-historia.
- TODOS en TERCERA PERSONA, hablando de KAP (nunca «yo», nunca «tú»). Cada hook, 8-20 palabras, con un OBJETO o ACCIÓN concretos de la idea.
- Cada hook EMPIEZA DE FORMA DISTINTA. PROHIBIDO empezar con «¿Qué pasó cuando…», «Sabía que…», «A veces», «El problema es», «Debes entender», «Hoy…»; prohibidos los aforismos, la moraleja y las frases motivacionales.
- Formas posibles (no las copies): situacion = una escena con su objeto («KAP tenía una hora libre. La gastó ordenando cosas que nadie iba a mirar.»); conflicto = lo que KAP no quería y lo que hizo igual; curiosidad = algo que KAP descubre o está a punto de descubrir, sin fórmula fija; contradiccion = lo que KAP quería frente a lo que estaba provocando; mini-historia = dos frases cortas con inicio y problema.
- Los 5 hooks son distintos entre sí.`;
export const hooksV3Prompt = (i: IdeaV3, why = "") => `IDEA «${i.titulo}»\nSituación: ${i.situacion}\nMotivo: ${i.motivo}\nAcción de KAP: ${i.accionKap}\nObjeto: ${i.objeto}\nConsecuencia: ${i.consecuencia}\nNueva acción: ${i.nuevaAccion}\n\nEscribe los 5 hooks.${why ? `\n\n# Corrección obligatoria\nTu versión anterior no sirve: ${why}. Escríbelos de nuevo.` : ""}`;
export async function generateHooksV3(llm: LlmClient, idea: IdeaV3, o: { signal?: AbortSignal } = {}): Promise<{ hooks: HookV3[]; issues: string[]; repaired: boolean; usage?: LlmUsage; calls: number }> {
  const ask = (why = "") => generateJson(llm, HooksV3Schema, { system: HOOKS_V3_SYSTEM, prompt: hooksV3Prompt(idea, why), maxTokens: 550, temperature: 0.8, signal: o.signal }, { retries: 2 });
  const a = await ask(); if (!a.ok) throw new Error(`El modelo no devolvió hooks válidos: ${a.errors.join("; ")}`);
  let hooks = a.data.hooks as HookV3[], issues = hookSetIssuesV3(hooks, idea), calls = a.attempts, repaired = false; const usages: (LlmUsage | undefined)[] = [a.usage];
  if (issues.length) { const b = await ask(issues.join(" | ")); calls += b.attempts; usages.push(b.ok ? b.usage : undefined); repaired = true; if (b.ok) { const i2 = hookSetIssuesV3(b.data.hooks as HookV3[], idea); if (i2.length <= issues.length) { hooks = b.data.hooks as HookV3[]; issues = i2; } } }
  return { hooks, issues, repaired, usage: sumUsage(usages), calls };
}
