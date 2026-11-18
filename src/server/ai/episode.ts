/**
 * AUTOR DE EPISODIOS CON SALIDA ESTRUCTURADA. El modelo NO escribe texto libre ni toca el motor: devuelve un BORRADOR en JSON
 * (esquema estricto, impuesto también al motor de generación) que se convierte a la IR de KAP, se valida con el esquema de la IR y se
 * entrega como guion en el formato documentado. Después el pipeline normal lo vuelve a interpretar y valida (reglas → IR → memoria →
 * continuidad → escenas → animación → render). Nada de lo que devuelve el modelo se aplica al canon sin la confirmación del usuario.
 */
import { z } from "zod";
import type { AuthorStats, LlmClient, ScriptAuthor } from "@/ports/studio";
import { ScreenplayIR } from "@/domain/screenplay";
import { beatToDirection, parseDirection } from "@/animation/beats";
import { isMemoryKey, parseMemoryDirectives } from "@/memory/directives";
import { generateJson, sumUsage, type AttemptLog } from "./json";
import { AUTHOR_JSON_SYSTEM, authorJsonPrompt, expandPrompt } from "./prompts";
import type { LlmUsage } from "@/ports/studio";

const SceneDraft = z.object({
  title: z.string().min(1).max(100), location: z.string().min(1).max(80),
  lines: z.array(z.object({ speaker: z.string().max(40), text: z.string().min(1).max(700) })).min(1).max(16),   // speaker "" = narrador
  memory: z.array(z.string().max(320)).max(16),                                                                    // directivas de memoria de KAP: [acto: …] [gancho: …] [hito-logrado: …]…
  // Solo el generador por arco las rellena: función de la escena, etapa del arco, plano, momento del día, interior/exterior y acciones 2D del vocabulario cerrado.
  fn: z.string().max(40).optional(), stage: z.string().max(30).optional(), shot: z.string().max(20).optional(), time: z.string().max(30).optional(), interior: z.boolean().optional(),
  directions: z.array(z.string().max(120)).max(8).optional(),
});
export const EpisodeDraft = z.object({
  title: z.string().min(1).max(100), logline: z.string().min(1).max(260),
  assumptions: z.array(z.string().max(300)).max(8),                                                                  // si la petición era ambigua: qué ha supuesto el modelo
  scenes: z.array(SceneDraft).min(3).max(40),
});
export type EpisodeDraft = z.infer<typeof EpisodeDraft>;

export const draftToIR = (d: EpisodeDraft): ScreenplayIR => ({ v: 1, warnings: [], scenes: d.scenes.map((s) => ({ title: s.title, location: s.location, mood: s.time ? `${s.time}, ${s.interior ? "interior" : "exterior"}` : "",
  beats: (s.directions ?? []).map((x) => parseDirection(x).beat).filter((b): b is NonNullable<typeof b> => !!b), hints: {}, memory: s.memory.map((m) => m.replace(/^\[|\]$/g, "").trim().replace(/^acto:\s*resoluci[oó]n\b/i, "acto: resolucion")).filter(Boolean),
  lines: s.lines.filter((l) => l.text.trim()).map((l) => ({ ...(l.speaker.trim() ? { speaker: l.speaker.trim().toUpperCase() } : {}), text: l.text.trim() })) })) });

/** IR → guion en el formato documentado (lo que verá y podrá corregir el usuario). `parseScript` lo reconstruye igual. */
export function irToScript(ir: ScreenplayIR): string {
  return ir.scenes.map((s) => [`# ${s.location || s.title}`, ...(s.mood ? [`[mood: ${s.mood}]`] : []), ...(s.beats ?? []).map((b) => `[${beatToDirection(b)}]`), ...s.lines.map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)), ...(s.memory ?? []).map((m) => `[${m}]`)].join("\n")).join("\n\n") + "\n";
}
export const draftWords = (d: EpisodeDraft) => d.scenes.reduce((n, s) => n + s.lines.reduce((m, l) => m + l.text.split(/\s+/).filter(Boolean).length, 0), 0);
/** Duración estimada del episodio hablado (palabras ÷ ritmo medio de la voz sintética; ≈ 2,9 palabras/s medido en las demostraciones). */
export const draftSeconds = (d: EpisodeDraft) => Math.round(draftWords(d) / 2.9 + d.scenes.length * 0.8);
const MIN_SEC = 240, TARGET_SCENES = 18;

export type EpisodeAuthorOptions = { scenes?: number; expand?: boolean; maxTokens?: number; temperature?: number };

/** Redactor con salida JSON: valida esquema → IR, reintenta si hace falta y, si el episodio queda corto (< 4 min), pide UNA ampliación. */
export function llmEpisodeAuthor(llm: LlmClient, opts: EpisodeAuthorOptions = {}): ScriptAuthor & { lastDraft?: EpisodeDraft } {
  const self: ScriptAuthor & { lastDraft?: EpisodeDraft } = {
    id: `llm-json:${llm.model}`, label: `Redactor de episodios (JSON → IR) con ${llm.model}`, free: true, available: () => llm.available(),
    async write({ request, context, signal }) {
      if (!(await llm.available())) throw new Error("El modelo de IA no está disponible");
      const scenes = opts.scenes ?? TARGET_SCENES, base = { system: AUTHOR_JSON_SYSTEM, maxTokens: opts.maxTokens ?? 3600, temperature: opts.temperature ?? 0.7, signal };
      const logs: AttemptLog[] = []; let draft: EpisodeDraft | undefined, lengthRetries = 0; const usages: (LlmUsage | undefined)[] = [];
      const first = await generateJson(llm, EpisodeDraft, { ...base, prompt: authorJsonPrompt(context, scenes) }, { retries: 2 });
      logs.push(...first.log); usages.push(first.usage); if (!first.ok) throw new Error(`El modelo no devolvió un episodio válido tras ${first.attempts} intento(s): ${first.errors.join("; ")}`);
      draft = first.data;
      if (opts.expand !== false && draftSeconds(draft) < MIN_SEC) {   // episodio demasiado corto para ≈ 5 min: una ampliación guiada
        lengthRetries = 1; const more = await generateJson(llm, EpisodeDraft, { ...base, prompt: expandPrompt(context, scenes, draft, draftSeconds(draft)) }, { retries: 1 });
        logs.push(...more.log.map((l) => ({ ...l, attempt: logs.length + l.attempt }))); usages.push(more.usage); if (more.ok && draftSeconds(more.data) > draftSeconds(draft)) draft = more.data;
      }
      const irCheck = ScreenplayIR.safeParse(draftToIR(draft)); if (!irCheck.success) throw new Error(`La IR resultante no es válida: ${irCheck.error.issues[0]?.message}`);
      const ir = irCheck.data, warnings: string[] = [];
      const all = ir.scenes.flatMap((s) => s.memory ?? []), dirs = all.filter((d) => isMemoryKey(d.split(":")[0])), unknown = all.filter((d) => !isMemoryKey(d.split(":")[0]));
      const memErrors = [...parseMemoryDirectives(dirs).errors, ...unknown.map((d) => `«${d}»: directiva de memoria desconocida`)];
      for (const e of memErrors) warnings.push(`Directiva de memoria inválida del modelo: ${e}`);
      const secs = draftSeconds(draft); if (secs < MIN_SEC) warnings.push(`El episodio dura ≈ ${(secs / 60).toFixed(1)} min: queda por debajo del formato (≈ 5 min).`);
      for (const a of draft.assumptions) warnings.push(`Suposición del modelo: ${a}`);
      const stats: AuthorStats = { attempts: logs.length, retries: logs.filter((l) => l.kind !== "ok").length + lengthRetries, jsonErrors: logs.filter((l) => l.kind === "json").length, schemaErrors: logs.filter((l) => l.kind === "schema").length, lengthRetries, memoryDirectiveErrors: memErrors.length, usage: sumUsage(usages), estimatedSec: secs };
      void request; self.lastDraft = draft; return { script: irToScript(ir), warnings, ir, stats };
    },
  };
  return self;
}
