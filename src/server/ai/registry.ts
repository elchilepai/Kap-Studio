/**
 * REGISTRO DE IA. Único sitio donde se elige el proveedor de modelo. HOY: ninguno conectado (`KAP_LLM=none`): KAP funciona con
 * reglas y formularios. Para conectar un modelo local (Ollama + Qwen3-8B/14B…) bastará implementar `LlmClient` en un adaptador nuevo
 * y registrarlo aquí; la memoria, el contexto, el guion y la animación no cambian. Ver docs/MEMORIA-NARRATIVA.md y docs/IA-LOCAL.md.
 */
import type { EpisodeRequestInterpreter, EpisodeSummarizer, LlmClient, ScriptAuthor } from "@/ports/studio";
import { env } from "@/server/env";
import { llmEpisodeSummarizer, llmRequestInterpreter, llmScriptAuthor } from "./adapters";

export type Ai = { llm?: LlmClient; author?: ScriptAuthor; summarizer?: EpisodeSummarizer; requests?: EpisodeRequestInterpreter };
/** Construye los adaptadores de IA a partir de un cliente (también lo usan los tests con un doble de prueba). */
export const aiFrom = (llm?: LlmClient): Ai => (llm ? { llm, author: llmScriptAuthor(llm), summarizer: llmEpisodeSummarizer(llm), requests: llmRequestInterpreter(llm) } : {});

const CLIENTS: Record<string, (() => LlmClient) | undefined> = {};   // aquí se registrarán los clientes reales (p. ej. "ollama")
export function getAi(): Ai { const k = env().KAP_LLM as string; const make = CLIENTS[k]; return k === "none" || !make ? {} : aiFrom(make()); }
export const contextBudget = (ai: Ai) => Math.min(env().KAP_CONTEXT_TOKENS, ai.llm ? Math.floor(ai.llm.contextTokens * 0.45) : env().KAP_CONTEXT_TOKENS);
