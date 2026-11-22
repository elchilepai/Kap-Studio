/**
 * AUTOR DEL SHORT (SHORT MODE). Una variante del flujo de episodios, no un parche: UNA llamada al modelo diseña la historia entera como cadena de BEATS activos
 * (narrative/short.ts); la revisión de retención (SHORT_RETENTION_CHECK) y las reparaciones locales se hacen en código; solo si falla el gancho, el giro o el remate
 * se pide UNA reescritura local. Después sigue el camino normal: borrador → IR validada → guion → memoria/continuidad → escenas → animación 2D → render vertical.
 */
import { z } from "zod";
import type { AuthorStats, LlmClient, LlmUsage, ScriptAuthor } from "@/ports/studio";
import { ScreenplayIR } from "@/domain/screenplay";
import { norm } from "@/memory/text";
import { audioGaps, beatsToScenes, estimateRenderSeconds, MORAL, PHASES, repairShort, shortRetentionCheck, shortSeconds, SHORT_MUSIC, SHORT_SOUNDS, SHOTS, STEPS, type RetentionResult, type ShortBeat, type ShortDraftScene } from "@/narrative/short";
import { draftToIR, irToScript, type EpisodeDraft } from "./episode";
import { generateJson, sumUsage, type AttemptLog } from "./json";
import { SHORT_SYSTEM, shortPrompt } from "./prompts";

const Beat = z.object({
  phase: z.enum(PHASES), step: z.enum(STEPS), goal: z.string().min(1).max(160), action: z.string().min(1).max(420), reaction: z.string().max(300), change: z.string().min(1).max(200), seconds: z.number().min(1).max(8),
  shot: z.enum(SHOTS), characters: z.array(z.string().min(1).max(40)).min(1).max(4), location: z.string().min(1).max(80), time: z.string().max(20),
  sound: z.enum(SHORT_SOUNDS).optional(), music: z.enum(SHORT_MUSIC).optional(), dialogue: z.object({ speaker: z.string().min(1).max(40), text: z.string().min(1).max(300) }).optional(),
});
export const ShortStory = z.object({ objeto: z.string().min(2).max(60), objetivo: z.string().min(3).max(160), title: z.string().min(1).max(100), logline: z.string().min(1).max(260), hook: z.string().max(200), cast: z.array(z.string().min(1).max(40)).max(6), beats: z.array(Beat).min(6).max(12) });
export type ShortStory = z.infer<typeof ShortStory>;

const PatchSchema = z.object({ beats: z.array(z.object({ index: z.number().int().min(0).max(20), action: z.string().min(1).max(420), reaction: z.string().max(300), change: z.string().min(1).max(200) })).min(1).max(4) });
const NOTES: Record<string, string> = {
  "hook-claro": "El primer beat debe mostrar YA una acción visible y corta (sin empezar hablando).", giro: "Falta un giro o descubrimiento antes del remate: que algo cambie lo que KAP (o el público) creía.",
  remate: "El último beat debe cerrar con una acción o consecuencia visible, sin moraleja ni frase de lección.",
};

/** Borrador del Short (formato del generador de episodios) a partir de los beats. Sin relleno: una escena existe solo si hay contenido propio (la IR admite desde 1 escena). */
export function storyToDraft(story: ShortStory, beats: ShortBeat[], known: string[]): { draft: EpisodeDraft; scenes: ShortDraftScene[] } {
  const scenes = beatsToScenes(beats, known);
  return { scenes, draft: { title: story.title, logline: story.logline, assumptions: [], scenes: scenes.map((s) => ({ title: s.title, location: s.location, lines: s.lines.length ? s.lines : [{ speaker: "", text: s.title }], memory: s.memory, stage: s.stage, shot: s.shot, time: s.time, interior: s.interior, directions: s.directions, change: s.change })) } };   // TODAS las directivas llegan al render
}
/** IR → guion conservando las directivas del director (sonido, impacto, silencio, marca-musica), que no son beats de la IR, y el corte seco entre escenas del mismo lugar. */
export function draftToShortScript(draft: EpisodeDraft, scenes: Pick<ShortDraftScene, "transition">[] = []): string {
  const ir = draftToIR(draft), base = irToScript({ ...ir, scenes: ir.scenes.map((sc) => ({ ...sc, beats: [] })) }).trimEnd().split("\n\n");
  return base.map((blk, i) => { const [head, ...rest] = blk.split("\n"), mood = rest[0]?.startsWith("[mood:") ? [rest.shift()!] : []; return [head, ...mood, ...(scenes[i]?.transition ? ["[transicion: cut]"] : []), ...(draft.scenes[i]?.directions ?? []).map((d) => `[${d}]`), ...rest].join("\n"); }).join("\n\n") + "\n";
}

type Cand = { story: ShortStory; beats: ShortBeat[]; ret: RetentionResult; scenes: ShortDraftScene[]; draft: EpisodeDraft; merged: number; dropped: number; outside: string[] };

export function llmShortAuthor(llm: LlmClient, opts: { maxTokens?: number; temperature?: number } = {}): ScriptAuthor & { lastStory?: ShortStory; lastBeats?: ShortBeat[]; lastRetention?: RetentionResult; lastDraft?: EpisodeDraft; lastScenes?: ShortDraftScene[] } {
  const self: ScriptAuthor & { lastStory?: ShortStory; lastBeats?: ShortBeat[]; lastRetention?: RetentionResult; lastDraft?: EpisodeDraft; lastScenes?: ShortDraftScene[] } = {
    id: `llm-short:${llm.model}`, label: `Autor de Shorts (beats activos) con ${llm.model}`, free: true, available: () => llm.available(),
    async write({ request, context, signal }) {
      if (!(await llm.available())) throw new Error("El modelo de IA no está disponible");
      const cast = [...new Set(["KAP", ...request.cast])], base = { system: SHORT_SYSTEM, maxTokens: opts.maxTokens ?? 3600, temperature: opts.temperature ?? 0.7, signal };
      const logs: AttemptLog[] = [], usages: (LlmUsage | undefined)[] = []; let patches = 0, rewrites = 0;
      const allowedBase = [...cast].map(norm), brotherOk = /hermano/i.test(request.notes ?? "");
      // beats → candidato: personajes del reparto, reparación local en código, escenas y duración REAL estimada por el contenido
      const prepare = (story: ShortStory): Cand => {
        const allowed = new Set([...allowedBase, ...(brotherOk ? story.cast.filter((n) => /hermano/i.test(n)).map(norm) : [])]), outside = new Set<string>();
        let beats: ShortBeat[] = story.beats.map((b) => ({ ...b, reaction: b.reaction ?? "" }));
        beats = beats.map((b) => { const keep = b.characters.filter((n) => allowed.has(norm(n))); b.characters.filter((n) => !allowed.has(norm(n))).forEach((n) => outside.add(n)); return { ...b, characters: keep.length ? keep : ["KAP"], ...(b.dialogue && !allowed.has(norm(b.dialogue.speaker)) ? { dialogue: undefined } : {}) }; });
        const rep = repairShort(beats); beats = rep.beats; const { draft, scenes } = storyToDraft(story, beats, cast);
        return { story, beats, scenes, draft, merged: rep.merged, dropped: rep.dropped, outside: [...outside], ret: shortRetentionCheck(beats, { renderSeconds: estimateRenderSeconds(scenes), objeto: story.objeto }) };
      };
      const gen = async (prompt: string) => { const r = await generateJson(llm, ShortStory, { ...base, prompt }, { retries: 2 }); logs.push(...r.log.map((l) => ({ ...l, attempt: logs.length + l.attempt }))); usages.push(r.usage); return r; };
      const first = await gen(shortPrompt(context, cast)); if (!first.ok) throw new Error(`El modelo no devolvió un Short válido tras ${first.attempts} intento(s): ${first.errors.join("; ")}`);
      let cand = prepare(first.data);
      // si falla el CONTRATO narrativo (intento → fallo → segundo intento → descubrimiento, sin relleno emocional) o dura menos de 45 s: UNA reescritura completa con el motivo (no se rellena con código)
      const hard = cand.ret.checks.filter((c) => !c.ok && c.fix === "rewrite");
      if (hard.length) {
        rewrites = 1; const why = hard.map((c) => c.note).join(" | ");
        const again = await gen(`${shortPrompt(context, cast)}\n\n# Corrección obligatoria\nTu versión anterior («${cand.story.title}») NO es válida: ${why}.\nEscríbela DE NUEVO entera, con otra historia concreta si hace falta: elige UN objeto o actividad concreta (campo «objeto»); alguien consigue algo con él al principio; KAP intenta lo mismo con ese objeto, le sale mal por una causa visible, reacciona con el cuerpo, prueba una estrategia DISTINTA con el mismo objeto, obtiene un resultado concreto distinto y lo usa después. SIN abrazos ni tristeza como solución, sin frases abstractas y con 3-4 frases de acción encadenadas por beat para que dure 50-65 s.`);
        if (again.ok) { const c2 = prepare(again.data); if (c2.ret.failed.length <= cand.ret.failed.length) cand = c2; }
      }
      // como mucho UNA reescritura local de los beats clave (gancho, giro, remate) si fallan
      const fix = cand.ret.checks.filter((c) => !c.ok && c.fix === "patch"), idx = [...new Set(fix.flatMap((c) => c.beats ?? []))].slice(0, 4);
      if (idx.length) {
        const { beats } = cand, ask = `${shortPrompt(context, cast)}\n\n# Reescritura local\nEl Short ya existe (beats en orden): ${JSON.stringify(beats.map((b, i) => ({ index: i, phase: b.phase, step: b.step, action: b.action, reaction: b.reaction, change: b.change })))}\nReescribe SOLO estos beats (índices ${idx.join(", ")}) sin cambiar el resto de la historia. ${fix.map((c) => NOTES[c.id] ?? c.note ?? "").join(" ")} Devuelve {"beats":[{"index","action","reaction","change"}]}.`;
        const pr = await generateJson(llm, PatchSchema, { ...base, maxTokens: 900, prompt: ask }, { retries: 1 }); logs.push(...pr.log.map((l) => ({ ...l, attempt: logs.length + l.attempt }))); usages.push(pr.usage); patches = 1;
        if (pr.ok) { const nb = beats.map((b) => ({ ...b })); for (const e of pr.data.beats) if (idx.includes(e.index) && nb[e.index]) { const b = { ...nb[e.index], action: e.action, reaction: e.reaction, change: e.change }; if (b.dialogue && MORAL.test(b.dialogue.text)) delete b.dialogue; nb[e.index] = b; }
          const { draft, scenes } = storyToDraft(cand.story, nb, cast); cand = { ...cand, beats: nb, draft, scenes, ret: shortRetentionCheck(nb, { renderSeconds: estimateRenderSeconds(scenes), objeto: cand.story.objeto }) }; }
      }
      const irCheck = ScreenplayIR.safeParse(draftToIR(cand.draft)); if (!irCheck.success) throw new Error(`La IR resultante no es válida: ${irCheck.error.issues[0]?.message}`);
      const warnings: string[] = []; for (const c of cand.ret.checks) if (!c.ok) warnings.push(`SHORT_RETENTION_CHECK · ${c.id}${c.note ? `: ${c.note}` : ""}`);
      if (cand.merged || cand.dropped) warnings.push(`Reparación local del Short: ${cand.merged} beat(s) fusionados, ${cand.dropped} eliminados.`);
      { const gaps = audioGaps(cand.scenes); for (const g of gaps) warnings.push(`SHORT_AUDIO_GAP · ${g.from}-${g.to} s sin ningún sonido de acción ni diálogo (revisar: un silencio solo vale si tiene función dramática)`); }
      if (rewrites) warnings.push("El contrato narrativo del Short falló en la primera versión: se pidió una reescritura completa.");
      for (const n of cand.outside) warnings.push(`Personaje fuera del reparto retirado del Short: ${n}`);
      const secs = cand.ret.seconds, usage = sumUsage(usages);
      const stats: AuthorStats = { attempts: logs.length, retries: logs.filter((l) => l.kind !== "ok").length, jsonErrors: logs.filter((l) => l.kind === "json").length, schemaErrors: logs.filter((l) => l.kind === "schema").length, lengthRetries: rewrites, memoryDirectiveErrors: 0, usage, estimatedSec: Math.round(secs), localPatches: patches, codeRepairs: cand.merged + cand.dropped, retention: { passed: cand.ret.passed, total: cand.ret.total, failed: cand.ret.failed, beats: cand.beats.length, seconds: secs } };
      void shortSeconds; self.lastStory = cand.story; self.lastBeats = cand.beats; self.lastRetention = cand.ret; self.lastDraft = cand.draft; self.lastScenes = cand.scenes;
      return { script: draftToShortScript(cand.draft, cand.scenes), warnings, ir: irCheck.data, stats };
    },
  };
  return self;
}
