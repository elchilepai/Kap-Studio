/**
 * Puertos de la producción automática. El pipeline solo habla con estas interfaces; cada proveedor
 * (reglas locales hoy, servicios gratuitos/IA mañana) es un adaptador intercambiable.
 * REGLA: un adaptador que no está realmente disponible NO se simula: `available()` devuelve false y la interfaz lo dice.
 */
import type { Scene } from "@/domain/types";
import type { CanonState, Change, ContextPack, EpisodeInput, EpisodeRequest, RequestCtx } from "@/memory";

export type ProviderInfo = { id: string; label: string; free?: boolean; quality?: "basica" | "buena"; note?: string };

/** Interpreta un guion y lo divide en escenas. Hoy: reglas. Futuro: LLM. */
export interface ScriptAnalyzer extends ProviderInfo {
  analyze(input: { script: string; brief: string; characters: { id: string; name: string }[] }): Promise<Scene[]>;
}

/** Escribe un guion a partir de una idea y de la memoria narrativa. Hoy: NO DISPONIBLE. */
export interface ScriptAuthor extends ProviderInfo {
  available(): Promise<boolean>;
  /** Recibe la petición ya interpretada y el PAQUETE DE CONTEXTO de la memoria narrativa (no la historia entera). Devuelve el guion en el formato documentado de KAP (con directivas de memoria). */
  write(input: { request: EpisodeRequest; context: ContextPack; signal?: AbortSignal; /** Pistas de variedad de la serie (opcionales): escenarios y desenlaces recientes. */ hints?: AuthorHints }): Promise<{ script: string; warnings: string[]; /** IR validada (si el autor devuelve estructura): el pipeline la re-valida igualmente. */ ir?: unknown; stats?: AuthorStats }>;
}

/** Sintetiza voz a un archivo de audio. Hoy: audio subido por el usuario o espeak-ng local si está instalado. */
export interface VoiceProvider extends ProviderInfo {
  available(): Promise<boolean>;
  synthesize(text: string, outFile: string, o: { signal?: AbortSignal; speaker?: string }): Promise<void>;
}

/** Genera una imagen a partir de un texto. Hoy: NO DISPONIBLE (se usa la biblioteca y tarjetas KAP). */
export interface ImageProvider extends ProviderInfo {
  available(): Promise<boolean>;
  generate(prompt: string, o: { width: number; height: number; signal?: AbortSignal }): Promise<{ file: string; license: string }>;
}

export type CapabilityRow = ProviderInfo & { area: "guion" | "voz" | "imagen" | "musica" | "video"; available: boolean; detail: string };

/**
 * CAPA DE INTERPRETACIÓN DEL GUION: convierte texto (formato documentado o lenguaje natural) en una representación intermedia
 * estructurada (ver domain/screenplay.ts). Está SEPARADA de la capa de animación: el director solo consume la IR ya validada.
 * Hoy: intérprete por reglas. Mañana: un LLM que devuelva la misma IR (se valida con el mismo esquema).
 */
export interface ScriptInterpreter extends ProviderInfo {
  available(): Promise<boolean>;
  interpret(input: { script: string; brief: string; characters: { name: string }[]; places: { name: string }[]; /** Contexto de continuidad (si hay memoria): permite resolver nombres y referencias. */ context?: ContextPack; signal?: AbortSignal }): Promise<unknown>;
}

/**
 * CLIENTE DE MODELO DE LENGUAJE: la ÚNICA pieza que conoce un modelo concreto (Qwen3-8B, Qwen3-14B, otro…). Todo lo demás de KAP
 * (memoria, contexto, guion, intérprete) habla con este puerto, de modo que cambiar de modelo o de motor (Ollama, llama.cpp…)
 * es cambiar de adaptador/configuración, sin tocar el motor de animación ni la memoria.
 * REGLA: si no está realmente disponible, `available()` devuelve false: no se simula.
 */
export type LlmRequest = { system?: string; prompt: string; /** JSON Schema que debe cumplir la salida (salida estructurada del motor). */ jsonSchema?: object; temperature?: number; maxTokens?: number; signal?: AbortSignal };
/** Medidas agregadas de una redacción (para el banco de pruebas): intentos, reintentos por tipo y uso del modelo. */
/** Pistas de variedad: de los episodios anteriores, dónde ocurrieron y CÓMO TERMINARON (desenlace, gancho y último cierre), para no repetirlos. */
export type AuthorHints = { previousEpisodes?: { locations: string[]; settings?: string[]; outcome?: string; hook?: string; ending?: string }[]; previousOutcomes?: string[] };
export type AuthorStats = { /** Solo el generador por arco: escenas regeneradas / eliminadas por la puerta de calidad y motivos. */ scenesRegenerated?: number; scenesDropped?: number; gateIssues?: Record<string, number>; /** Llamadas pequeñas que reescriben solo unas líneas (rima, voz, cierre…), reparaciones en código y revisiones del arco. */ localPatches?: number; codeRepairs?: number; arcRevisions?: number; rhymeValid?: boolean; attempts: number; retries: number; jsonErrors: number; schemaErrors: number; lengthRetries: number; memoryDirectiveErrors: number; usage: LlmUsage; estimatedSec: number };
/** Medidas de una llamada (si el motor las da): sirven para el banco de pruebas y para ajustar el presupuesto de contexto. */
export type LlmUsage = { promptTokens: number; outputTokens: number; totalMs: number; loadMs: number; promptMs: number; evalMs: number };
export interface LlmClient extends ProviderInfo {
  /** Identificador del modelo (p. ej. «qwen3:8b»). Solo informativo: nada del resto de KAP depende de él. */
  readonly model: string;
  /** Tokens de contexto que admite; la memoria ajusta su paquete a este límite. */
  readonly contextTokens: number;
  available(): Promise<boolean>;
  generate(req: LlmRequest): Promise<{ text: string; usage?: LlmUsage }>;
}

/** Interpreta una petición en texto libre («Crea el episodio 7 continuando el 6»). Hoy: reglas. Mañana: LLM. */
export interface EpisodeRequestInterpreter extends ProviderInfo {
  available(): Promise<boolean>;
  parse(text: string, ctx: RequestCtx): Promise<EpisodeRequest>;
}

/** Resume un episodio y propone cambios de memoria (mismo esquema `Change` que las reglas). Hoy: reglas. Mañana: LLM. */
export interface EpisodeSummarizer extends ProviderInfo {
  available(): Promise<boolean>;
  summarize(input: { episode: EpisodeInput; canon: CanonState; signal?: AbortSignal }): Promise<{ summary: string; logline: string; changes: Change[]; warnings: string[] }>;
}
