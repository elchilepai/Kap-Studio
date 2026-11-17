/** Salida estructurada de un LLM con validación estricta y reparación: el modelo nunca es de fiar, el esquema sí. */
import { z } from "zod";
import type { LlmClient } from "@/ports/studio";

export type JsonResult<T> = { ok: true; data: T; attempts: number } | { ok: false; errors: string[]; attempts: number; raw: string };

const extract = (text: string): string => {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text); const body = (fence ? fence[1] : text).trim();
  const i = body.search(/[{[]/), j = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  return i >= 0 && j > i ? body.slice(i, j + 1) : body;
};

/** Pide JSON que cumpla `schema`; si no cumple, reintenta (máx. `retries`) mostrándole al modelo qué falló. Nunca lanza por salida defectuosa. */
export async function generateJson<T>(llm: LlmClient, schema: z.ZodType<T>, req: { system?: string; prompt: string; temperature?: number; maxTokens?: number; signal?: AbortSignal }, o: { retries?: number } = {}): Promise<JsonResult<T>> {
  const jsonSchema = z.toJSONSchema(schema), max = (o.retries ?? 2) + 1; let prompt = req.prompt, raw = "", errors: string[] = [];
  for (let attempt = 1; attempt <= max; attempt++) {
    try { raw = (await llm.generate({ ...req, prompt, jsonSchema, temperature: req.temperature ?? 0 })).text; } catch (e) { return { ok: false, errors: [`El modelo no respondió: ${(e as Error).message}`], attempts: attempt, raw }; }
    let parsed: unknown; try { parsed = JSON.parse(extract(raw)); } catch { errors = ["La respuesta no es JSON válido"]; parsed = undefined; }
    if (parsed !== undefined) { const r = schema.safeParse(parsed); if (r.success) return { ok: true, data: r.data, attempts: attempt }; errors = r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`); }
    prompt = `${req.prompt}\n\nTu respuesta anterior no era válida:\n- ${errors.join("\n- ")}\nResponde de nuevo SOLO con JSON que cumpla el esquema.`;
  }
  return { ok: false, errors, attempts: max, raw };
}
