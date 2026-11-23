/**
 * GUION + ESCENAS V4 con Qwen: UNA llamada a partir de una cadena APROBADA (guion de 30-45 s y 8-10 escenas). Si la validación estructural falla, UNA regeneración con los motivos. Ningún modelo juzga la historia.
 * Límites de esquema amplios (la brevedad se pide en el prompt) para que las frases nunca se corten. Sin vídeo ni imágenes: solo guion, escenas y cámara sugerida.
 */
import { z } from "zod";
import type { LlmClient, LlmUsage } from "@/ports/studio";
import { FIELDS_V4, type Chain, type Issue } from "@/narrative/chainV4";
import { DURACION, MOTION_KINDS, SCENE_TYPES, SHOT_TYPES, planIssues, type Plan } from "@/narrative/scenePlanV4";
import { EDITORIAL_V2 } from "./ideasV2";
import { generateJson } from "./json";
import { KAP_PERSONALITY } from "./prompts";

const t = (min: number, max: number) => z.string().min(min).max(max);
export const EscenaSchema = z.object({ n: z.number().int().min(1).max(12), cubre: z.array(z.enum(FIELDS_V4)).min(1).max(3), tipo: z.enum(SCENE_TYPES), kapPresente: z.boolean(), experiencia: t(0, 300), queOcurre: t(20, 400), enPantalla: z.array(t(2, 80)).min(2).max(6), textoEnPantalla: t(0, 60), plano: z.enum(SHOT_TYPES), perspectiva: t(3, 60), camara: z.enum(MOTION_KINDS), camaraNota: t(8, 200), dialogo: t(0, 300), duracion: z.number().min(2).max(7) });
export const PlanSchema = z.object({ musica: t(8, 200), escenas: z.array(EscenaSchema).min(8).max(10) });

export const SCENES_SYSTEM = `Eres el guionista y storyboarder de los Shorts de KAP. Recibes una CADENA NARRATIVA YA APROBADA y la conviertes en un guion hablado de ${DURACION.min}-${DURACION.max} segundos y en 8-10 ESCENAS ilustradas (ilustraciones estáticas 2D estilo stickman, profesional y cinematográfico; sin animación corporal: después solo se añade movimiento ligero de cámara).
${KAP_PERSONALITY}
${EDITORIAL_V2}
REGLAS DE LAS ESCENAS
- Cada escena es un MOMENTO DISTINTO de la historia y añade información NUEVA. Si dos escenas se pueden intercambiar sin cambiar la historia, sobra una. NO repitas una plantilla («acción → consecuencia → decisión…») hasta llenar huecos: avanza la historia.
- Las escenas siguen el ORDEN de la cadena (situación, conflicto, motivo, acción, consecuencia, decisión, nueva acción, resultado). En "cubre" indica qué pasos de la cadena cuenta cada escena (1 o 2; puedes usar "mentalidad" en la última). Ningún paso se queda sin escena.
- "queOcurre": lo que ocurre VISUALMENTE (una acción o un cambio, ≥ 8 palabras): abrir, borrar, esconder, romper, guardar, tirar, entregar, cambiar, comparar… NO escenas donde KAP solo está de pie hablando, mira, piensa, respira o sonríe.
- "enPantalla": 2-6 elementos concretos que se ven (objetos, entorno, pantalla, personajes). El OBJETO CENTRAL de la cadena aparece en al menos 5 escenas y TAMBIÉN en el resultado final.
- KAP NO sale en todas: en 3-5 escenas "kapPresente" es false (primer plano del objeto, detalle, POV de KAP, entorno, metáfora o consecuencia) y en "experiencia" explicas cómo esa imagen representa lo que KAP está viviendo. Si KAP sale, "experiencia" va vacía.
- "tipo": ${SCENE_TYPES.join(", ")} (usa al menos 5 distintos; KAP_PRESENTADOR como mucho 2 veces). "plano": ${SHOT_TYPES.join(", ")} (al menos 4 distintos). "perspectiva": cómo se mira (cenital, contrapicado, POV de KAP, de perfil, sobre el hombro…). "camara": movimiento ligero SUGERIDO para el montaje: ${MOTION_KINDS.join(", ")} (al menos 3 distintos) y "camaraNota" qué hace exactamente («zoom lento hacia la pantalla del reloj»).
- "textoEnPantalla": texto gráfico DENTRO de la ilustración (un número, una palabra); puede ir vacío; máximo 6 palabras.
REGLAS DEL GUION
- KAP cuenta lo que le pasó en PRIMERA PERSONA, con su humor seco; nunca habla de sí mismo en tercera persona ni te habla de «tú». "dialogo" es lo que se dice en esa escena (puede ir vacío: algunas escenas en silencio).
- La escena 1 abre con un GANCHO hablado que genera tensión SIN revelar el desenlace (no cuentes la decisión, la nueva acción ni el resultado). PROHIBIDO empezar con «A veces», «¿Qué pasó cuando…», «Sabía que…», «Hoy vamos a…»; nada de aforismos ni moralejas.
- Guion total: entre 60 y 117 palabras. Cada "duracion" (2-7 s) debe dar tiempo a decir su diálogo (≈ 2,6 palabras por segundo). La suma de duraciones: ${DURACION.min}-${DURACION.max} segundos. Cierre con la conclusión concreta de la historia (no una moraleja genérica).
Respondes SOLO con JSON {"musica","escenas":[{n,cubre,tipo,kapPresente,experiencia,queOcurre,enPantalla,textoEnPantalla,plano,perspectiva,camara,camaraNota,dialogo,duracion}]}. Cada frase termina en punto; nunca dejes una frase a medias.`;
export const scenesPrompt = (c: Chain, why = "") => `CADENA APROBADA «${c.titulo}» (objeto central: ${c.objeto})\n${FIELDS_V4.map((f, n) => `${n + 1}. ${f}: ${c[f]}`).join("\n")}\n\nEscribe el guion y las 8-10 escenas.${why ? `\n\n# Corrección obligatoria\nTu versión anterior no sirve por problemas de estructura: ${why}. Escríbelo de nuevo.` : ""}`;

export type PlanGen = { plan: Plan; issues: Issue[]; attempts: { issues: Issue[] }[]; usage?: LlmUsage; calls: number };
export async function generatePlanV4(llm: LlmClient, chain: Chain, o: { signal?: AbortSignal; temperature?: number } = {}): Promise<PlanGen> {
  const ask = async (why = "") => { const r = await generateJson(llm, PlanSchema, { system: SCENES_SYSTEM, prompt: scenesPrompt(chain, why), maxTokens: 3200, temperature: o.temperature ?? 0.7, signal: o.signal }, { retries: 2 }); if (!r.ok) throw new Error(`El modelo no devolvió un plan válido: ${r.errors.join("; ")}`); return { plan: r.data as Plan, calls: r.attempts, usage: r.usage }; };
  const a = await ask(), ia = planIssues(a.plan, chain), attempts = [{ issues: ia }]; if (!ia.length) return { plan: a.plan, issues: [], attempts, usage: a.usage, calls: a.calls };
  const b = await ask(ia.map((i) => i.msg).join(" | ")), ib = planIssues(b.plan, chain); attempts.push({ issues: ib }); const best = ib.length <= ia.length ? b : a;
  return { plan: best.plan, issues: best === b ? ib : ia, attempts, usage: b.usage, calls: a.calls + b.calls };
}
