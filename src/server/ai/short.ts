/**
 * AUTOR DEL SHORT (SHORT MODE). Una variante del flujo de episodios, no un parche: UNA llamada al modelo diseña la historia entera como cadena de BEATS activos
 * (narrative/short.ts); la revisión de retención (SHORT_RETENTION_CHECK) y las reparaciones locales se hacen en código; solo si falla el gancho, el giro o el remate
 * se pide UNA reescritura local. Después sigue el camino normal: borrador → IR validada → guion → memoria/continuidad → escenas → animación 2D → render vertical.
 */
import { z } from "zod";
import type { AuthorStats, LlmClient, LlmUsage, ScriptAuthor } from "@/ports/studio";
import { ScreenplayIR } from "@/domain/screenplay";
import { norm } from "@/memory/text";
import { beatsToScenes, MORAL, PHASES, repairShort, shortRetentionCheck, shortSeconds, SHORT_MUSIC, SHORT_SOUNDS, SHOTS, type RetentionResult, type ShortBeat } from "@/narrative/short";
import { draftToIR, draftSeconds, irToScript, type EpisodeDraft } from "./episode";
import { generateJson, sumUsage, type AttemptLog } from "./json";
import { SHORT_SYSTEM, shortPrompt } from "./prompts";

const Beat = z.object({
  phase: z.enum(PHASES), goal: z.string().min(1).max(160), action: z.string().min(1).max(260), reaction: z.string().max(220), change: z.string().min(1).max(200), seconds: z.number().min(1).max(8),
  shot: z.enum(SHOTS), characters: z.array(z.string().min(1).max(40)).min(1).max(4), location: z.string().min(1).max(80), time: z.string().max(20),
  sound: z.enum(SHORT_SOUNDS).optional(), music: z.enum(SHORT_MUSIC).optional(), dialogue: z.object({ speaker: z.string().min(1).max(40), text: z.string().min(1).max(300) }).optional(),
});
export const ShortStory = z.object({ title: z.string().min(1).max(100), logline: z.string().min(1).max(260), hook: z.string().max(200), cast: z.array(z.string().min(1).max(40)).max(6), beats: z.array(Beat).min(6).max(16) });
export type ShortStory = z.infer<typeof ShortStory>;

const PatchSchema = z.object({ beats: z.array(z.object({ index: z.number().int().min(0).max(20), action: z.string().min(1).max(260), reaction: z.string().max(220), change: z.string().min(1).max(200) })).min(1).max(4) });
const NOTES: Record<string, string> = {
  "hook-claro": "El primer beat debe mostrar YA una acción visible y corta (sin empezar hablando).", giro: "Falta un giro o descubrimiento antes del remate: que algo cambie lo que KAP (o el público) creía.",
  remate: "El último beat debe cerrar con una acción o consecuencia visible, sin moraleja ni frase de lección.",
};

/** Borrador del Short (formato del generador de episodios) a partir de los beats: la escena de producción es el decorado, el ritmo lo llevan los beats. */
export function storyToDraft(story: ShortStory, beats: ShortBeat[], known: string[]): EpisodeDraft {
  const scenes = beatsToScenes(beats, known), all = scenes.length < 3 ? [...scenes, ...Array.from({ length: 3 - scenes.length }, (_, i) => ({ ...scenes.at(-1)!, title: `${scenes.at(-1)!.title} (${i + 2})`, lines: scenes.at(-1)!.lines.slice(-1), directions: [], memory: [] }))] : scenes;   // la IR exige ≥ 3 escenas
  return { title: story.title, logline: story.logline, assumptions: [], scenes: all.map((s) => ({ title: s.title, location: s.location, lines: s.lines.length ? s.lines : [{ speaker: "", text: s.title }], memory: s.memory, stage: s.stage, shot: s.shot, time: s.time, interior: s.interior, directions: s.directions.slice(0, 8), change: s.change })) };
}
/** IR → guion conservando las directivas del director (sonido/música), que no son beats de la IR. */
export function draftToShortScript(draft: EpisodeDraft): string {
  const ir = draftToIR(draft), base = irToScript({ ...ir, scenes: ir.scenes.map((s) => ({ ...s, beats: [] })) }).trimEnd().split("\n\n");
  return base.map((blk, i) => { const [head, ...rest] = blk.split("\n"), mood = rest[0]?.startsWith("[mood:") ? [rest.shift()!] : []; return [head, ...mood, ...(draft.scenes[i]?.directions ?? []).map((d) => `[${d}]`), ...rest].join("\n"); }).join("\n\n") + "\n";
}

export function llmShortAuthor(llm: LlmClient, opts: { maxTokens?: number; temperature?: number } = {}): ScriptAuthor & { lastStory?: ShortStory; lastBeats?: ShortBeat[]; lastRetention?: RetentionResult; lastDraft?: EpisodeDraft } {
  const self: ScriptAuthor & { lastStory?: ShortStory; lastBeats?: ShortBeat[]; lastRetention?: RetentionResult; lastDraft?: EpisodeDraft } = {
    id: `llm-short:${llm.model}`, label: `Autor de Shorts (beats activos) con ${llm.model}`, free: true, available: () => llm.available(),
    async write({ request, context, signal }) {
      if (!(await llm.available())) throw new Error("El modelo de IA no está disponible");
      const cast = [...new Set(["KAP", ...request.cast])], base = { system: SHORT_SYSTEM, maxTokens: opts.maxTokens ?? 3200, temperature: opts.temperature ?? 0.7, signal };
      const logs: AttemptLog[] = [], usages: (LlmUsage | undefined)[] = []; let patches = 0;
      const first = await generateJson(llm, ShortStory, { ...base, prompt: shortPrompt(context, cast) }, { retries: 2 });
      logs.push(...first.log); usages.push(first.usage); if (!first.ok) throw new Error(`El modelo no devolvió un Short válido tras ${first.attempts} intento(s): ${first.errors.join("; ")}`);
      const story = first.data; let beats: ShortBeat[] = story.beats.map((b) => ({ ...b, reaction: b.reaction ?? "" }));
      // personajes: solo el reparto pedido (+ el hermano si la petición lo nombra); el resto se retira del beat
      const allowed = new Set([...cast, ...story.cast.filter((n) => /hermano/i.test(n) && /hermano/i.test(request.notes ?? ""))].map(norm)); const dropped = new Set<string>();
      beats = beats.map((b) => { const keep = b.characters.filter((n) => allowed.has(norm(n))); b.characters.filter((n) => !allowed.has(norm(n))).forEach((n) => dropped.add(n)); return { ...b, characters: keep.length ? keep : ["KAP"], ...(b.dialogue && !allowed.has(norm(b.dialogue.speaker)) ? { dialogue: undefined } : {}) }; });
      // 1) reparaciones LOCALES en código (repetidos, prescindibles) y 2) revisión de retención sin llamar al modelo
      const rep = repairShort(beats); beats = rep.beats; let ret = shortRetentionCheck(beats);
      // 3) como mucho UNA reescritura local de los beats clave (gancho, giro, remate) si fallan
      const fix = ret.checks.filter((c) => !c.ok && c.fix === "patch"), idx = [...new Set(fix.flatMap((c) => c.beats ?? []))].slice(0, 4);
      if (idx.length) {
        const ask = `${shortPrompt(context, cast)}\n\n# Reescritura local\nEl Short ya existe (beats en orden): ${JSON.stringify(beats.map((b, i) => ({ index: i, phase: b.phase, action: b.action, reaction: b.reaction, change: b.change })))}\nReescribe SOLO estos beats (índices ${idx.join(", ")}) sin cambiar el resto de la historia. ${fix.map((c) => NOTES[c.id] ?? c.note ?? "").join(" ")} Devuelve {"beats":[{"index","action","reaction","change"}]}.`;
        const p = await generateJson(llm, PatchSchema, { ...base, maxTokens: 900, prompt: ask }, { retries: 1 }); logs.push(...p.log.map((l) => ({ ...l, attempt: logs.length + l.attempt }))); usages.push(p.usage); patches = 1;
        if (p.ok) { for (const e of p.data.beats) if (idx.includes(e.index) && beats[e.index]) { const b = { ...beats[e.index], action: e.action, reaction: e.reaction, change: e.change }; if (b.dialogue && MORAL.test(b.dialogue.text)) delete b.dialogue; beats[e.index] = b; } ret = shortRetentionCheck(beats); }
      }
      const draft = storyToDraft(story, beats, cast), irCheck = ScreenplayIR.safeParse(draftToIR(draft)); if (!irCheck.success) throw new Error(`La IR resultante no es válida: ${irCheck.error.issues[0]?.message}`);
      const warnings: string[] = []; for (const c of ret.checks) if (!c.ok) warnings.push(`SHORT_RETENTION_CHECK · ${c.id}${c.note ? `: ${c.note}` : ""}`);
      if (rep.merged || rep.dropped) warnings.push(`Reparación local del Short: ${rep.merged} beat(s) fusionados, ${rep.dropped} eliminados.`);
      for (const n of dropped) warnings.push(`Personaje fuera del reparto retirado del Short: ${n}`);
      const secs = shortSeconds(beats), usage = sumUsage(usages);
      const stats: AuthorStats = { attempts: logs.length, retries: logs.filter((l) => l.kind !== "ok").length, jsonErrors: logs.filter((l) => l.kind === "json").length, schemaErrors: logs.filter((l) => l.kind === "schema").length, lengthRetries: 0, memoryDirectiveErrors: 0, usage, estimatedSec: Math.round(secs), localPatches: patches, codeRepairs: rep.merged + rep.dropped, retention: { passed: ret.passed, total: ret.total, failed: ret.failed, beats: beats.length, seconds: secs } };
      void draftSeconds; self.lastStory = story; self.lastBeats = beats; self.lastRetention = ret; self.lastDraft = draft;
      return { script: draftToShortScript(draft), warnings, ir: irCheck.data, stats };
    },
  };
  return self;
}
