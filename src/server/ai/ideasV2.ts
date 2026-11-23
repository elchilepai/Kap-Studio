/**
 * GENERADOR REAL V2 DE IDEAS Y HOOKS (Qwen). La idea nace de una ACCIÓN que se puede contar con 8-14 ilustraciones estáticas 2D (stickman). Cada categoría trae una «semilla» abstracta
 * (qué tipo de conflicto) y un objeto central sugerido distinto, para que las ideas no converjan. Las ideas que fallan las puertas de calidad se REGENERAN una vez con los motivos (no se salvan con puntuación).
 * Sin guion, storyboard, prompts de imagen ni vídeo.
 */
import { z } from "zod";
import type { LlmClient, LlmUsage } from "@/ports/studio";
import { HOOK_KINDS_V2, SHOTS, judgeIdea, hookSetIssuesV2, type CategoryV2, type HookV2, type IdeaV2 } from "@/narrative/ideasV2";
import { CATEGORIES_V2 } from "@/narrative/ideasV2";
import { generateJson, sumUsage } from "./json";
import { KAP_PERSONALITY } from "./prompts";

const s = (min: number, max: number) => z.string().min(min).max(max);
export const IdeaV2Schema = z.object({ category: z.enum(CATEGORIES_V2), titulo: s(6, 70), situacion: s(25, 190), problema: s(15, 130), accionKap: s(15, 140), objeto: s(3, 40), consecuencia: s(15, 140), momentoDecision: s(15, 140), hacerDiferente: s(15, 140), mentalidad: s(15, 130), imagenes: z.array(z.object({ plano: z.enum(SHOTS), que: s(10, 110) })).min(8).max(14) });
export const IdeasV2BatchSchema = z.object({ ideas: z.array(IdeaV2Schema).min(1).max(4) });
export const HooksV2Schema = z.object({ hooks: z.array(z.object({ type: z.enum(HOOK_KINDS_V2), text: s(14, 150) })).length(5) });

/** Semilla por categoría: tipo de conflicto (abstracto, no una historia hecha) y objeto central sugerido. */
export const SEEDS: Record<CategoryV2, { tema: string; objeto: string }> = {
  "limites-decir-no": { tema: "alguien le pide algo (tiempo, un favor, una cosa suya) que KAP no quiere dar, y aceptar le sale caro; luego tiene una segunda oportunidad de decir que no", objeto: "un objeto prestado o una lista de favores" },
  aprobacion: { tema: "KAP cambia lo que hace o cómo se presenta según quién tenga delante para caer bien", objeto: "ropa o una silla/puerta por la que entra gente" },
  disciplina: { tema: "KAP tiene algo importante por empezar y se pone a hacer cosas irrelevantes para no empezarlo", objeto: "un ordenador con la tarea abierta y una habitación desordenada" },
  responsabilidad: { tema: "KAP evita asumir algo que es suyo y la factura (literal o figurada) crece hasta que no puede ignorarla", objeto: "un recibo, una deuda o un paquete" },
  comparacion: { tema: "KAP ve el avance de otra persona y abandona o desprecia lo que él estaba construyendo", objeto: "un trofeo, una notificación o un contador de seguidores" },
  rechazo: { tema: "KAP recibe (o imagina recibir) un no y reacciona de una forma que empeora su situación", objeto: "una puerta cerrada" },
  "independencia-emocional": { tema: "KAP deja que la respuesta (o el silencio) de otra persona decida cómo va su día y qué hace", objeto: "un mensaje sin responder o un contador de tiempo" },
  proposito: { tema: "KAP lleva semanas hablando de un objetivo o empieza muchos proyectos y ninguno avanza", objeto: "varias tareas/proyectos abiertos o un camino con bifurcaciones" },
  decisiones: { tema: "KAP sigue una decisión de otros aunque sabe desde el principio que es mala idea", objeto: "un semáforo, un cruce o un mapa" },
  caracter: { tema: "KAP recibe una crítica y automáticamente se justifica o contraataca en vez de usarla", objeto: "una caja o un papel con la crítica" },
  habitos: { tema: "KAP repite una conducta pequeña que parece inofensiva y que le roba lo que dice querer", objeto: "un calendario o un reloj" },
  autoestima: { tema: "KAP intenta demostrar algo a alguien y termina perjudicándose a sí mismo", objeto: "una escalera, una medalla o un espejo de feria" },
  relaciones: { tema: "KAP evita una conversación incómoda con alguien cercano y el malentendido crece", objeto: "un mensaje escrito y borrado varias veces" },
};

export const EDITORIAL_V2 = `PÚBLICO: hombres jóvenes (16-30) que quieren mejorar su vida. TEMÁTICA: desarrollo personal masculino, directo y provocador: respeto propio, dejar de perseguir aprobación, límites, disciplina, responsabilidad, independencia emocional, propósito, comparación, rechazo, relaciones, carácter, hábitos, autoestima, aprender a decir no, tomar decisiones.
VOZ DE KAP: propia y distinta de cualquier creador; directa, observadora, seca cuando toca, con humor absurdo o de calle ocasional, situaciones cotidianas y conclusiones prácticas. KAP NO es gurú, psicólogo ni coach: es un personaje que hace cosas, se equivoca, ve la consecuencia y cambia. No imites frases, estructuras ni personalidad de nadie.
PROHIBIDO: motivación genérica («cree en ti», «eres suficiente», «el mañana es una excusa»), lenguaje de gurú o de alfa/beta, humillar, generalizar sobre hombres o mujeres, manipular a otros. En relaciones: respeto, comunicación y límites.`;

export const IDEAS_V2_SYSTEM = `Eres el guionista de los Shorts de KAP. Cada Short se cuenta con 8-14 ILUSTRACIONES ESTÁTICAS 2D estilo stickman (sin animación corporal: zoom, paneo, luz). KAP es el protagonista y el hilo, pero NO tiene que salir en todas las imágenes.
${KAP_PERSONALITY}
${EDITORIAL_V2}
NO empieces pensando en una lección. Empieza por: «¿qué situación CONCRETA le pasa a KAP que podamos contar con dibujos?». La idea nace de una ACCIÓN: acción → consecuencia → realización → cambio de comportamiento.
Respondes SOLO con JSON {"ideas":[{category,titulo,situacion,problema,accionKap,objeto,consecuencia,momentoDecision,hacerDiferente,mentalidad,imagenes:[{plano,que}]}]}:
- titulo: concreto, sobre la situación (no «La importancia de…»). situacion: dónde está KAP y qué ocurre, con detalles concretos. problema: el conflicto real.
- accionKap: lo que KAP HACE (empieza por «KAP» + verbo de acción visible: borra, acepta, presta, cambia de ropa, abre, ordena, envía, tacha, empuja…). PROHIBIDO que sea callarse, mirar al suelo/móvil/espejo, pensar, hablar bajito o sentirse inseguro.
- objeto: el objeto visual importante (1-4 palabras) que debe verse en varias imágenes.
- consecuencia: lo que se VE como resultado de esa acción (algo que cambia en la escena, no un sentimiento).
- momentoDecision: el instante concreto en que KAP elige. hacerDiferente: lo que KAP hace distinto (acción visible, distinta de accionKap). mentalidad: lo que KAP descubre, concreto y práctico (no un aforismo).
- imagenes: entre 8 y 12 viñetas, en orden narrativo, cada una con "plano" (${SHOTS.join(", ")}) y "que" (qué se ve, concreto, ≤14 palabras). Usa planos DISTINTOS (general, medio, primer-plano, pov, cenital, contrapicado, detalle, silueta, metafora, entorno…); varias SIN KAP (objeto en detalle, entorno, metáfora, POV); el objeto aparece en al menos 4. Cada imagen distinta de las otras.
- Todas las ideas del pedido son DISTINTAS entre sí: otra situación, otra acción y otro objeto.`;
export const ideasV2Prompt = (cats: readonly CategoryV2[], avoid: { titulo: string; objeto: string }[], retry?: { cat: CategoryV2; why: string }) =>
  retry ? `Genera 1 idea nueva para la categoría «${retry.cat}» (usa ese valor en "category"). ${SEEDS[retry.cat].tema}. Objeto sugerido: ${SEEDS[retry.cat].objeto}.\n# Corrección obligatoria\nTu versión anterior no sirve: ${retry.why}. Escribe una idea DISTINTA y concreta.${avoid.length ? `\nNo repitas estas: ${avoid.map((a) => `«${a.titulo}» (${a.objeto})`).join("; ")}.` : ""}`
  : `Genera ${cats.length} idea${cats.length > 1 ? "s" : ""}, UNA por categoría (valor exacto en "category"):\n${cats.map((c) => `- ${c}: ${SEEDS[c].tema}. Objeto central sugerido: ${SEEDS[c].objeto} (puedes elegir otro, pero cada idea con su objeto).`).join("\n")}${avoid.length ? `\nYa existen (NO repitas ni su situación, ni su acción, ni su objeto): ${avoid.map((a) => `«${a.titulo}» (${a.objeto})`).join("; ")}.` : ""}`;

export type BatchV2 = { ideas: IdeaV2[]; usage?: LlmUsage; calls: number; dropped: number; regenerated: { category: string; why: string[]; improved: boolean }[] };
/** Un lote (1-2 categorías). Cada idea se juzga frente a las ya aceptadas (de TODOS los lotes); si la rechaza el código, se regenera UNA vez y se queda la mejor (no rechazada o con menos fallos). */
export async function generateIdeaBatchV2(llm: LlmClient, o: { categories: readonly CategoryV2[]; prior: IdeaV2[]; signal?: AbortSignal; temperature?: number }): Promise<BatchV2> {
  const avoid = () => o.prior.map((p) => ({ titulo: p.titulo, objeto: p.objeto })), usages: (LlmUsage | undefined)[] = [];
  const ask = (cats: readonly CategoryV2[], retry?: { cat: CategoryV2; why: string }) => generateJson(llm, IdeasV2BatchSchema, { system: IDEAS_V2_SYSTEM, prompt: ideasV2Prompt(cats, avoid(), retry), maxTokens: 800 * cats.length + 300, temperature: o.temperature ?? 0.8, signal: o.signal }, { retries: 2 });
  const r = await ask(o.categories); if (!r.ok) throw new Error(`El modelo no devolvió ideas válidas: ${r.errors.join("; ")}`);
  usages.push(r.usage); let calls = r.attempts, dropped = 0; const seen = new Set<string>(), asked = new Set<string>(o.categories), got = r.data.ideas.filter((i) => asked.has(i.category) && !seen.has(i.category) && (seen.add(i.category), true)) as IdeaV2[]; dropped += r.data.ideas.length - got.length;
  const kept: IdeaV2[] = [], regenerated: BatchV2["regenerated"] = [];
  for (const idea of got) {
    const jd = judgeIdea(idea, [...o.prior, ...kept]); if (!jd.rejected) { kept.push(idea); continue; }
    const why = jd.reasons.join(" | "), b = await ask([idea.category], { cat: idea.category, why }); calls += b.attempts; usages.push(b.ok ? b.usage : undefined);
    const cand = b.ok ? (b.data.ideas.find((x) => x.category === idea.category) as IdeaV2 | undefined) : undefined, j2 = cand ? judgeIdea(cand, [...o.prior, ...kept]) : undefined, better = !!cand && !!j2 && (!j2.rejected || j2.reasons.length < jd.reasons.length);
    regenerated.push({ category: idea.category, why: jd.reasons, improved: better }); kept.push(better ? cand! : idea);   // si no mejora se conserva (el código la marcará descartada: no se salva con puntuación)
  }
  return { ideas: kept, usage: sumUsage(usages), calls, dropped, regenerated };
}

export const HOOKS_V2_SYSTEM = `Eres el guionista de KAP. Escribes HOOKS: la primera frase del Short (3-4 segundos), que nace de la SITUACIÓN concreta que cuenta el Short.
${EDITORIAL_V2}
Respondes SOLO con JSON {"hooks":[{"type","text"}]} con EXACTAMENTE 5 hooks, UNO de cada tipo: situacion, conflicto, curiosidad, contradiccion, mini-historia.
- situacion: una escena concreta que el espectador ya vivió (con un objeto o acción). conflicto: lo que KAP sabía y lo que le costaba hacer. curiosidad: deja una pregunta abierta sobre lo que va a pasar. contradiccion: lo que quería frente a lo que consiguió. mini-historia: una micro-escena de KAP en una o dos frases, con inicio y problema.
- Cada hook: 8-18 palabras, español natural, con un OBJETO o ACCIÓN concretos de la idea, en pasado o presente de KAP o en segunda persona; con el humor seco de KAP si encaja.
- PROHIBIDO empezar con «A veces», «El problema es», «Debes entender», «Tu vida cambia», «No necesitas», «Recuerda que», «Hoy vamos a…»; PROHIBIDOS los aforismos («X no es Y, es Z»), la moraleja, las frases motivacionales y el clickbait vacío.
- Ejemplos de FORMA (de otros temas, no los copies): «Prestó los auriculares un viernes. Seguían sin volver el miércoles.» · «Tenía una hora libre. La gastó contestándole a alguien que ni le había escrito.»
- Los 5 hooks son distintos entre sí.`;
export const hooksV2Prompt = (i: IdeaV2, why = "") => `IDEA: «${i.titulo}»\nSituación: ${i.situacion}\nAcción de KAP: ${i.accionKap}\nObjeto: ${i.objeto}\nConsecuencia: ${i.consecuencia}\nMomento de decisión: ${i.momentoDecision}\nLo que hace diferente: ${i.hacerDiferente}\n\nEscribe los 5 hooks.${why ? `\n\n# Corrección obligatoria\nTu versión anterior no sirve: ${why}. Escríbelos de nuevo.` : ""}`;
/** Los 5 hooks de una idea; si el conjunto no cumple, UNA corrección con los motivos y se queda con el mejor intento. */
export async function generateHooksV2(llm: LlmClient, idea: IdeaV2, o: { signal?: AbortSignal; temperature?: number } = {}): Promise<{ hooks: HookV2[]; issues: string[]; repaired: boolean; usage?: LlmUsage; calls: number }> {
  const ask = (why = "") => generateJson(llm, HooksV2Schema, { system: HOOKS_V2_SYSTEM, prompt: hooksV2Prompt(idea, why), maxTokens: 500, temperature: o.temperature ?? 0.8, signal: o.signal }, { retries: 2 });
  const a = await ask(); if (!a.ok) throw new Error(`El modelo no devolvió hooks válidos: ${a.errors.join("; ")}`);
  let hooks = a.data.hooks as HookV2[], issues = hookSetIssuesV2(hooks, idea), calls = a.attempts, repaired = false; const usages: (LlmUsage | undefined)[] = [a.usage];
  if (issues.length) { const b = await ask(issues.join(" | ")); calls += b.attempts; usages.push(b.ok ? b.usage : undefined); repaired = true; if (b.ok) { const i2 = hookSetIssuesV2(b.data.hooks as HookV2[], idea); if (i2.length <= issues.length) { hooks = b.data.hooks as HookV2[]; issues = i2; } } }
  return { hooks, issues, repaired, usage: sumUsage(usages), calls };
}
