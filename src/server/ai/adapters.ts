/**
 * ADAPTADORES GENÉRICOS sobre un `LlmClient`: ScriptAuthor, EpisodeSummarizer y EpisodeRequestInterpreter. Valen para cualquier
 * modelo (Qwen3-8B, Qwen3-14B…): solo cambia el cliente. Toda salida se valida con los esquemas de KAP antes de usarse y
 * NINGÚN adaptador escribe en el canon: devuelven propuestas que pasan por el flujo normal (revisión → aprobación → confirmación).
 */
import { z } from "zod";
import type { EpisodeRequestInterpreter, EpisodeSummarizer, LlmClient, ScriptAuthor } from "@/ports/studio";
import { Change, buildContextPack, deriveEnding, type EpisodeRequest } from "@/memory";
import { generateJson } from "./json";
import { AUTHOR_SYSTEM, REQUEST_SYSTEM, SUMMARIZER_SYSTEM, authorPrompt, summarizerPrompt } from "./prompts";
import { parseMemoryDirectives } from "@/memory/directives";

const info = (llm: LlmClient, what: string) => ({ id: `llm:${llm.model}`, label: `${what} con ${llm.model}`, free: true as const });

export function llmScriptAuthor(llm: LlmClient): ScriptAuthor {
  return {
    ...info(llm, "Redactor de guiones"), available: () => llm.available(),
    async write({ request, context, signal }) {
      if (!(await llm.available())) throw new Error("El modelo de IA no está disponible");
      const out = await llm.generate({ system: AUTHOR_SYSTEM, prompt: authorPrompt(context), temperature: 0.7, maxTokens: 3500, signal });
      const script = out.text.replace(/^```[a-z]*\n?|```$/gim, "").trim(), warnings: string[] = [];
      if (!script) throw new Error("El modelo devolvió un guion vacío");
      if (!/^\s*#/m.test(script)) warnings.push("El guion no tiene encabezados de escena («# Lugar»): se dividirá por párrafos.");
      const directives = [...script.matchAll(/^\s*\[([^\]]+)\]\s*$/gm)].map((m) => m[1]).filter((d) => /^(conoce|obtiene|pierde|destruye|repara|usa|abre-hilo|cierra-hilo|relacion|relación|ropa|ubicacion|ubicación|muere|reaparece|hecho|momento|sabe|regla|lugar|evento)\s*:/i.test(d));
      const bad = parseMemoryDirectives(directives).errors; for (const e of bad) warnings.push(`Directiva de memoria inválida del modelo: ${e}`);
      void request; return { script, warnings };
    },
  };
}

const SummaryOut = z.object({ logline: z.string().min(1).max(300), summary: z.string().min(1).max(2000), changes: z.array(Change).max(60) });
export function llmEpisodeSummarizer(llm: LlmClient): EpisodeSummarizer {
  return {
    ...info(llm, "Resumen y cambios de memoria"), available: () => llm.available(),
    async summarize({ episode, canon, signal }) {
      const pack = buildContextPack({ request: { text: "", number: episode.number, season: episode.season, exact: false, cast: [], notes: "" }, canon, episodes: [], budgetTokens: Math.floor(llm.contextTokens * 0.35) });
      const r = await generateJson(llm, SummaryOut, { system: SUMMARIZER_SYSTEM, prompt: summarizerPrompt(episode, pack.text), maxTokens: 2000, signal });
      if (!r.ok) return { summary: "", logline: "", changes: [], warnings: [`El modelo no devolvió un resumen válido tras ${r.attempts} intento(s): ${r.errors.join("; ")}`] };
      void deriveEnding; return { summary: r.data.summary, logline: r.data.logline, changes: r.data.changes, warnings: r.attempts > 1 ? [`Se necesitaron ${r.attempts} intentos para obtener JSON válido`] : [] };
    },
  };
}

const RequestOut = z.object({ number: z.number().int().min(1).max(999), season: z.number().int().min(1).max(99).optional(), continuesFromNumber: z.number().int().min(1).max(999).optional(), exact: z.boolean().default(false), cast: z.array(z.string().max(80)).max(12).default([]), notes: z.string().max(1000).default("") });
export function llmRequestInterpreter(llm: LlmClient): EpisodeRequestInterpreter {
  return {
    ...info(llm, "Intérprete de peticiones"), available: () => llm.available(),
    async parse(text, ctx): Promise<EpisodeRequest> {
      const r = await generateJson(llm, RequestOut, { system: REQUEST_SYSTEM, prompt: `Personajes conocidos: ${ctx.knownCharacters.join(", ")}\nPetición: ${text}` });
      if (!r.ok) throw new Error(`No se pudo interpretar la petición: ${r.errors.join("; ")}`);
      const season = r.data.season ?? ctx.defaultSeason, known = new Set(ctx.knownCharacters.map((c) => c.toLowerCase()));
      return { text, number: r.data.number, season, ...(r.data.continuesFromNumber !== undefined ? { continuesFrom: season * 1000 + r.data.continuesFromNumber } : {}), exact: r.data.exact, cast: r.data.cast.filter((c) => known.has(c.toLowerCase())), notes: r.data.notes || text };
    },
  };
}
