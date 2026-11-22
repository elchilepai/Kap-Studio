/**
 * AUTOR DEL STORYBOARD. Una llamada al modelo (y, si el contenido no cumple, UNA reescritura con los motivos) devuelve el relato como 5 escenas con narración, descripción
 * visual (se dibuja, no se dice), personajes, plano, emoción y propósito. El código comprueba el CONTENIDO (no las etiquetas), monta el prompt de cada imagen con la style bible
 * y las fichas de personaje, y exporta guion, narración (para la voz) y prompts. No genera vídeo.
 */
import { z } from "zod";
import type { ContextPack } from "@/memory";
import type { LlmClient, LlmUsage } from "@/ports/studio";
import { NEG_SPACE, ROLES, SHOTS_SB, storyboardReasons, type Storyboard } from "@/narrative/storyboard";
import { generateJson, sumUsage } from "./json";
import { STORYBOARD_SYSTEM, storyboardPrompt } from "./prompts";

const Scene = z.object({ n: z.number().int().min(1).max(5), role: z.enum(ROLES), narration: z.string().max(220), visual: z.string().min(20).max(600), visualEn: z.string().min(30).max(800), characters: z.array(z.string().min(1).max(40)).min(1).max(3), location: z.string().min(2).max(80), shot: z.enum(SHOTS_SB), emotion: z.string().min(2).max(40), purpose: z.string().min(5).max(160), negativeSpace: z.enum(NEG_SPACE) });
export const StoryboardDraft = z.object({ title: z.string().min(1).max(100), objeto: z.string().min(2).max(60), objetivo: z.string().min(3).max(160), scenes: z.array(Scene).min(5).max(5) });

export async function generateStoryboard(llm: LlmClient, o: { context: ContextPack; cast: string[]; signal?: AbortSignal; temperature?: number }): Promise<{ storyboard: Storyboard; reasons: string[]; warnings: string[]; rewrites: number; calls: number; usage: LlmUsage | undefined }> {
  const base = { system: STORYBOARD_SYSTEM, maxTokens: 3400, temperature: o.temperature ?? 0.7, signal: o.signal }, usages: (LlmUsage | undefined)[] = []; let calls = 0, rewrites = 0;
  const run = async (prompt: string) => { const r = await generateJson(llm, StoryboardDraft, { ...base, prompt }, { retries: 2 }); calls += r.attempts; usages.push(r.usage); return r; };
  const first = await run(storyboardPrompt(o.context, o.cast)); if (!first.ok) throw new Error(`El modelo no devolvió un storyboard válido: ${first.errors.join("; ")}`);
  const fix = (d: z.infer<typeof StoryboardDraft>): Storyboard => ({ title: d.title, objeto: d.objeto, objetivo: d.objetivo, scenes: d.scenes.map((s, i) => ({ ...s, n: i + 1, characters: [...new Set(s.characters.map((c) => (/^kap$/i.test(c.trim()) ? "KAP" : c.trim())))] })) });
  let sb = fix(first.data), reasons = storyboardReasons(sb);
  if (reasons.length) {   // UNA reescritura completa con los motivos concretos; se queda la mejor versión
    rewrites = 1; const again = await run(`${storyboardPrompt(o.context, o.cast)}\n\n# Corrección obligatoria\nTu versión anterior no sirve: ${reasons.join(" | ")}.\nEscríbela de nuevo entera cumpliendo la estructura de 5 escenas, con descripciones visuales concretas de un solo fotograma, la comparación visible, el fallo visible en la escena 3, una estrategia distinta en la 4 y un resultado concreto en la 5.`);
    if (again.ok) { const sb2 = fix(again.data), r2 = storyboardReasons(sb2); if (r2.length <= reasons.length) { sb = sb2; reasons = r2; } }
  }
  const warnings = reasons.map((r) => `STORYBOARD_CHECK · ${r}`); if (rewrites) warnings.push("La primera versión no cumplía el contrato del storyboard: se pidió una reescritura completa.");
  return { storyboard: sb, reasons, warnings, rewrites, calls, usage: sumUsage(usages) };
}
