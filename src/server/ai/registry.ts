/**
 * REGISTRO DE IA. Único sitio donde se elige el proveedor de modelo. HOY: ninguno conectado (`KAP_LLM=none`): KAP funciona con
 * reglas y formularios. Para conectar un modelo local (Ollama + Qwen3-8B/14B…) bastará implementar `LlmClient` en un adaptador nuevo
 * y registrarlo aquí; la memoria, el contexto, el guion y la animación no cambian. Ver docs/MEMORIA-NARRATIVA.md y docs/IA-LOCAL.md.
 */
import type { EpisodeRequestInterpreter, EpisodeSummarizer, LlmClient, ScriptAuthor } from "@/ports/studio";
import { env } from "@/server/env";
import { llmEpisodeSummarizer, llmRequestInterpreter, llmScriptAuthor } from "./adapters";
import { createOllamaClient } from "./ollama";
import { llmEpisodeAuthor } from "./episode";
import { llmArcAuthor } from "./arc";
import { llmShortAuthor } from "./short";

export type Ai = { llm?: LlmClient; author?: ScriptAuthor; summarizer?: EpisodeSummarizer; requests?: EpisodeRequestInterpreter };
/** Construye los adaptadores de IA a partir de un cliente (también lo usan los tests con un doble de prueba). */
/** `authorMode`: «arc» (por defecto) = el modelo diseña primero el arco del episodio y lo convierte en escenas; «json» = borrador JSON de una pasada → IR; «text» = guion en texto libre. */
/** SHORT MODE: con `hints.mode === "short"` el autor es el de Shorts (una llamada, beats activos); en cualquier otro caso se usa el autor de episodios sin cambios. */
export const withShortMode = (episode: ScriptAuthor, llm: LlmClient): ScriptAuthor => { const short = llmShortAuthor(llm); return Object.assign(Object.create(episode) as ScriptAuthor, { write: (i: Parameters<ScriptAuthor["write"]>[0]) => (i.hints?.mode === "short" ? short.write(i) : episode.write(i)) }); };
export const aiFrom = (llm?: LlmClient, o: { authorMode?: "arc" | "json" | "text"; scenes?: number } = {}): Ai => (llm ? { llm, author: withShortMode((o.authorMode ?? "arc") === "arc" ? llmArcAuthor(llm) : o.authorMode === "json" ? llmEpisodeAuthor(llm, { scenes: o.scenes }) : llmScriptAuthor(llm), llm), summarizer: llmEpisodeSummarizer(llm), requests: llmRequestInterpreter(llm) } : {});

/** Clientes registrados. Añadir otro motor/modelo local = una entrada aquí; nada más cambia. */
const CLIENTS: Record<string, (() => LlmClient) | undefined> = {
  ollama: () => { const e = env(); return createOllamaClient({ baseUrl: e.KAP_OLLAMA_URL, model: e.KAP_LLM_MODEL, contextTokens: e.KAP_LLM_CONTEXT, timeoutMs: e.KAP_LLM_TIMEOUT_S * 1000, allowRemote: e.KAP_LLM_ALLOW_REMOTE }); },
};
export function getAi(): Ai { const k = env().KAP_LLM as string; const make = CLIENTS[k]; return k === "none" || !make ? {} : aiFrom(make(), { authorMode: env().KAP_AUTHOR_MODE }); }
export const contextBudget = (ai: Ai) => Math.min(env().KAP_CONTEXT_TOKENS, ai.llm ? Math.floor(ai.llm.contextTokens * 0.45) : env().KAP_CONTEXT_TOKENS);
