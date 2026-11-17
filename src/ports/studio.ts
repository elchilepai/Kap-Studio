/**
 * Puertos de la producción automática. El pipeline solo habla con estas interfaces; cada proveedor
 * (reglas locales hoy, servicios gratuitos/IA mañana) es un adaptador intercambiable.
 * REGLA: un adaptador que no está realmente disponible NO se simula: `available()` devuelve false y la interfaz lo dice.
 */
import type { Scene } from "@/domain/types";

export type ProviderInfo = { id: string; label: string; free?: boolean; quality?: "basica" | "buena"; note?: string };

/** Interpreta un guion y lo divide en escenas. Hoy: reglas. Futuro: LLM. */
export interface ScriptAnalyzer extends ProviderInfo {
  analyze(input: { script: string; brief: string; characters: { id: string; name: string }[] }): Promise<Scene[]>;
}

/** Escribe un guion a partir de una idea y de la memoria narrativa. Hoy: NO DISPONIBLE. */
export interface ScriptAuthor extends ProviderInfo {
  available(): Promise<boolean>;
  write(input: { idea: string; canon: string[]; previous: string[] }): Promise<string>;
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
  interpret(input: { script: string; brief: string; characters: { name: string }[]; places: { name: string }[] }): Promise<unknown>;
}
