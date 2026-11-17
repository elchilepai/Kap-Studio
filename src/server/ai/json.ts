/** Salida estructurada de un LLM con validación estricta y reparación: el modelo nunca es de fiar, el esquema sí. */
import { z } from "zod";
import type { LlmClient, LlmUsage } from "@/ports/studio";

/** Qué falló en cada intento: JSON mal formado, JSON que no cumple el esquema, o el modelo no respondió. */
export type AttemptLog = { attempt: number; kind: "ok" | "json" | "schema" | "request"; errors: string[]; usage?: LlmUsage };
export const sumUsage = (xs: (LlmUsage | undefined)[]): LlmUsage => xs.reduce<LlmUsage>((a, u) => (u ? { promptTokens: a.promptTokens + u.promptTokens, outputTokens: a.outputTokens + u.outputTokens, totalMs: a.totalMs + u.totalMs, loadMs: a.loadMs + u.loadMs, promptMs: a.promptMs + u.promptMs, evalMs: a.evalMs + u.evalMs } : a), { promptTokens: 0, outputTokens: 0, totalMs: 0, loadMs: 0, promptMs: 0, evalMs: 0 });
export type JsonResult<T> = ({ ok: true; data: T } | { ok: false; errors: string[]; raw: string }) & { attempts: number; log: AttemptLog[]; usage: LlmUsage };

const extract = (text: string): string => {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text); const body = (fence ? fence[1] : text).trim();
  const i = body.search(/[{[]/), j = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  return i >= 0 && j > i ? body.slice(i, j + 1) : body;
};

/** Pide JSON que cumpla `schema`; si no cumple, reintenta (máx. `retries`) mostrándole al modelo qué falló. Nunca lanza por salida defectuosa. */
export async function generateJson<T>(llm: LlmClient, schema: z.ZodType<T>, req: { system?: string; prompt: string; temperature?: number; maxTokens?: number; signal?: AbortSignal }, o: { retries?: number } = {}): Promise<JsonResult<T>> {
  const jsonSchema = z.toJSONSchema(schema), max = (o.retries ?? 2) + 1, log: AttemptLog[] = []; let prompt = req.prompt, raw = "", errors: string[] = [];
  const fin = (r: { ok: true; data: T } | { ok: false; errors: string[]; raw: string }, attempts: number): JsonResult<T> => ({ ...r, attempts, log, usage: sumUsage(log.map((l) => l.usage)) });
  for (let attempt = 1; attempt <= max; attempt++) {
    let out: { text: string; usage?: LlmUsage };
    try { out = await llm.generate({ ...req, prompt, jsonSchema, temperature: req.temperature ?? 0 }); } catch (e) { log.push({ attempt, kind: "request", errors: [(e as Error).message] }); return fin({ ok: false, errors: [`El modelo no respondió: ${(e as Error).message}`], raw }, attempt); }
    raw = out.text; let parsed: unknown, kind: AttemptLog["kind"] = "ok";
    try { parsed = JSON.parse(extract(raw)); } catch { errors = ["La respuesta no es JSON válido"]; parsed = undefined; kind = "json"; }
    if (parsed !== undefined) { const r = schema.safeParse(parsed); if (r.success) { log.push({ attempt, kind: "ok", errors: [], usage: out.usage }); return fin({ ok: true, data: r.data }, attempt); } errors = r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`); kind = "schema"; }
    log.push({ attempt, kind, errors, usage: out.usage });
    prompt = `${req.prompt}\n\nTu respuesta anterior no era válida:\n- ${errors.join("\n- ")}\nResponde de nuevo SOLO con JSON que cumpla el esquema.`;
  }
  return fin({ ok: false, errors, raw }, max);
}
