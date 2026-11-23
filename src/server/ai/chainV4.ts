/**
 * GENERADOR REAL V4 (Qwen) — FASE A: UNA cadena narrativa corta por llamada. Sin viñetas, escenas, hooks ni guion. Qwen genera; el código valida la ESTRUCTURA (no la lógica); una persona valida la historia.
 * Los límites del esquema son AMPLIOS a propósito (con decodificación restringida un límite estrecho corta la frase y el modelo la continúa en el campo siguiente); la brevedad se pide en el prompt y se comprueba después.
 */
import { z } from "zod";
import type { LlmClient, LlmUsage } from "@/ports/studio";
import { CATEGORIES_V4, chainIssues, type CategoryV4, type Chain, type Issue } from "@/narrative/chainV4";
import { EDITORIAL_V2 } from "./ideasV2";
import { generateJson } from "./json";
import { KAP_PERSONALITY } from "./prompts";

const field = z.string().min(20).max(420);
export const SCHEMA_MAX = 420;
export const ChainSchema = z.object({ category: z.enum(CATEGORIES_V4), titulo: z.string().min(6).max(90), objeto: z.string().min(3).max(50), situacion: field, conflicto: field, motivo: field, accion: field, consecuencia: field, decision: field, nuevaAccion: field, resultado: field, mentalidad: field });
export const ChainsSchema = z.object({ cadenas: z.array(ChainSchema).length(1) });

/** Conflicto y FORMA de la historia por categoría (abstractos: el modelo inventa la situación concreta, el objeto y el entorno). Cada forma es distinta para no repetir «quiere → teme → se esconde → lo intenta». */
export const SEEDS_V4: Record<CategoryV4, { conflicto: string; forma: string }> = {
  aprobacion: { conflicto: "KAP acepta algo que no quiere hacer para no quedar mal con alguien", forma: "el coste aparece más tarde y se acumula; KAP lo ve y la siguiente vez responde distinto" },
  comparacion: { conflicto: "KAP compara su avance con el de otra persona (por ejemplo, en redes) y cambia lo que estaba construyendo", forma: "sustitución gradual: KAP modifica lo suyo poco a poco para parecerse al otro, el resultado empeora y KAP lo descubre en algo tangible" },
  justificarse: { conflicto: "KAP recibe una crítica o una queja y empieza a justificarse antes de escuchar", forma: "escalada: cada justificación empeora la situación hasta que algo concreto se rompe; KAP cambia de estrategia" },
  "rechazo-identidad": { conflicto: "KAP recibe un no (de un grupo, una persona o una oportunidad) e intenta convertirse en otra persona para conseguir aprobación", forma: "transformación forzada: KAP cambia varias cosas de sí mismo, nadie lo nota o resulta ridículo, y vuelve a ser él mismo con una decisión distinta" },
  "limites-costumbre": { conflicto: "KAP deja pasar una falta de respeto pequeña y con el tiempo se convierte en costumbre", forma: "acumulación de pequeñas concesiones hasta un momento claro en que KAP pone un límite concreto" },
};
export const CHAIN_SYSTEM = `Eres el guionista de los Shorts de KAP. Escribes la CADENA NARRATIVA de una idea: una historia corta y LÓGICA, de arriba abajo. Todavía NO hay escenas, viñetas, hooks ni guion.
${KAP_PERSONALITY}
${EDITORIAL_V2}
Respondes SOLO con JSON {"cadenas":[{category,titulo,objeto,situacion,conflicto,motivo,accion,consecuencia,decision,nuevaAccion,resultado,mentalidad}]} con EXACTAMENTE 1 cadena. Cada campo es UNA frase CORTA y COMPLETA (máximo 22 palabras) que termina en punto. NUNCA dejes una frase a medias ni la continúes en el campo siguiente.
- situacion: dónde está KAP y qué pasa, concreto y cotidiano. conflicto: lo que se tuerce o lo que está en juego. motivo: qué quiere o teme KAP (por qué actúa así).
- accion: lo que KAP HACE por ese motivo (empieza por «KAP» + verbo concreto: abrir, cerrar, esconder, romper, escribir, borrar, guardar, tirar, recoger, entregar, rechazar, cambiar, construir, abandonar, volver, comparar, elegir…). Nada de callarse, mirar, pensar ni sentirse. NO inventes una acción llamativa solo porque sea visual: tiene que SALIR del motivo.
- consecuencia: lo que esa acción provoca. decision: el momento en que esa consecuencia obliga a KAP a elegir. nuevaAccion: lo que KAP hace DISTINTO (empieza por «KAP» + verbo concreto). resultado: lo que cambia después.
- mentalidad: una conclusión CONCRETA derivada de lo que acaba de ocurrir, que dice qué entiende KAP («KAP descubre que…»). PROHIBIDO empezar con «A veces», «Debes», «La clave es», «Recuerda», «Hay que», «Tienes que».
- objeto: UN objeto concreto (teléfono, maqueta, calendario, mochila, lista, dinero, reloj, mensaje, libro, herramienta, inscripción…) que PARTICIPA en la historia: aparece en la acción, la consecuencia, la nueva acción y el resultado. NO decorativo (sofá, mesa, pared, habitación).
- La cadena se lee como causa → efecto: cada paso es consecuencia del anterior. MAL: «ve que su vecino tiene un reloj bonito → destroza su jardín» (la acción no sale del conflicto). Evita historias cuya única parte visible sea que KAP piensa, se siente mal, mira al suelo o se tranquiliza.
- Formato de ejemplo (de OTRO tema, no lo copies): situacion «KAP prepara una presentación para el lunes y su compañero le pide que le deje revisarla.» · accion «KAP le entrega el archivo sin copia y se va a entrenar.» · consecuencia «El compañero presenta una versión mezclada y KAP queda como segundo autor.»`;
export const chainPrompt = (cat: CategoryV4, avoid: { titulo: string; objeto: string }[], why = "") => `Escribe 1 cadena para la categoría «${cat}» (valor exacto en "category").\nConflicto de partida (inventa tú la situación concreta, el objeto y el entorno): ${SEEDS_V4[cat].conflicto}.\nForma de la historia: ${SEEDS_V4[cat].forma}.\nNo sigas la fórmula «quiere algo → tiene miedo → se esconde → luego lo intenta».${avoid.length ? `\nYa existen estas cadenas; usa OTRA situación, OTRO objeto y OTRA acción: ${avoid.map((a) => `«${a.titulo}» (${a.objeto})`).join("; ")}.` : ""}${why ? `\n\n# Corrección obligatoria\nTu versión anterior no sirve por problemas de estructura: ${why}. Escribe la cadena de nuevo.` : ""}`;

export type ChainGen = { chain: Chain; issues: Issue[]; attempts: { issues: Issue[] }[]; usage?: LlmUsage; calls: number };
/** Una cadena; si la validación estructural falla, UNA regeneración con los motivos y se queda la que tenga menos fallos. Nunca usa un modelo como juez. */
export async function generateChainV4(llm: LlmClient, o: { category: CategoryV4; avoid: { titulo: string; objeto: string }[]; signal?: AbortSignal; temperature?: number }): Promise<ChainGen> {
  const ask = async (why = "") => { const r = await generateJson(llm, ChainsSchema, { system: CHAIN_SYSTEM, prompt: chainPrompt(o.category, o.avoid, why), maxTokens: 1000, temperature: o.temperature ?? 0.8, signal: o.signal }, { retries: 2 }); if (!r.ok) throw new Error(`El modelo no devolvió una cadena válida: ${r.errors.join("; ")}`); return { chain: { ...r.data.cadenas[0], category: o.category } as Chain, calls: r.attempts, usage: r.usage }; };
  const a = await ask(), ia = chainIssues(a.chain), attempts = [{ issues: ia }]; if (!ia.length) return { chain: a.chain, issues: [], attempts, usage: a.usage, calls: a.calls };
  const b = await ask(ia.map((i) => i.msg).join(" | ")), ib = chainIssues(b.chain); attempts.push({ issues: ib }); const best = ib.length <= ia.length ? b : a;
  return { chain: best.chain, issues: best === b ? ib : ia, attempts, usage: b.usage, calls: a.calls + b.calls };
}
