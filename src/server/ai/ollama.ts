import http from "node:http";
/**
 * CLIENTE DE OLLAMA (modelo local, gratuito, sin conexión tras descargar el modelo). Implementa SOLO `LlmClient`: es la única pieza
 * que habla con Ollama. El resto de KAP (memoria, contexto, guion, IR, animación, render) no lo conoce: cambiar de modelo
 * (qwen3:8b, qwen3:14b, otro) es cambiar `KAP_LLM_MODEL`.
 * Seguridad: solo loopback salvo `allowRemote`; sin herramientas ni ejecución de código; el texto del usuario viaja como dato.
 */
import type { LlmClient, LlmRequest, LlmUsage } from "@/ports/studio";

export type OllamaConfig = { baseUrl: string; model: string; contextTokens: number; timeoutMs: number; keepAlive?: string; allowRemote?: boolean; fetch?: typeof fetch };

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i;
export function assertLocalUrl(url: string, allowRemote = false): URL {
  const u = new URL(url); if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("KAP_OLLAMA_URL debe ser http(s)");
  if (!allowRemote && !LOOPBACK.test(u.hostname)) throw new Error(`KAP_OLLAMA_URL apunta a un host no local (${u.hostname}): KAP solo usa modelos locales. Si es intencionado, define KAP_LLM_ALLOW_REMOTE=true.`);
  return u;
}

/** Parámetros recomendados por Qwen3 para el modo SIN «pensar»: creatividad moderada y menos repeticiones. */
const SAMPLING = { top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.0 };

/**
 * fetch mínimo sobre node:http. El `fetch` global (undici) corta a los 300 s sin cabeceras, y un modelo local en CPU
 * puede tardar más en responder (petición no «streaming»): aquí el único límite es el de la configuración.
 */
const localFetch: typeof fetch = (input, init) => new Promise((resolve, reject) => {
  const u = new URL(String(input)), signal = init?.signal ?? undefined;
  if (signal?.aborted) return reject(signal.reason);
  const req = http.request(u, { method: init?.method ?? "GET", headers: init?.headers as Record<string, string> }, (res) => {
    const chunks: Buffer[] = []; res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500 })));
    res.on("error", reject);
  });
  req.on("error", reject); signal?.addEventListener("abort", () => req.destroy(signal.reason as Error), { once: true });
  req.end(init?.body as string | undefined);
});

export function createOllamaClient(cfg: OllamaConfig): LlmClient {
  const base = assertLocalUrl(cfg.baseUrl, cfg.allowRemote), f = cfg.fetch ?? localFetch;
  const url = (p: string) => new URL(p, base).toString();
  const sig = (s?: AbortSignal) => { const t = AbortSignal.timeout(cfg.timeoutMs); return s ? AbortSignal.any([s, t]) : t; };
  return {
    id: "ollama", label: `Ollama · ${cfg.model}`, free: true, quality: "buena", note: "Modelo local (sin conexión tras descargarlo)",
    model: cfg.model, contextTokens: cfg.contextTokens,
    async available() {
      try {
        const r = await f(url("/api/tags"), { signal: AbortSignal.timeout(5000) }); if (!r.ok) return false;
        const j = (await r.json()) as { models?: { name: string; model?: string }[] }, want = cfg.model.includes(":") ? cfg.model : `${cfg.model}:latest`;
        return (j.models ?? []).some((m) => m.name === want || m.model === want);
      } catch { return false; }
    },
    async generate(req: LlmRequest) {
      const body = {
        model: cfg.model, stream: false, think: false,   // sin «pensar»: más rápido y sin texto de razonamiento mezclado con la salida
        messages: [...(req.system ? [{ role: "system", content: req.system }] : []), { role: "user", content: req.prompt }],
        ...(req.jsonSchema ? { format: req.jsonSchema } : {}),   // salida estructurada: el motor restringe la generación al JSON Schema
        keep_alive: cfg.keepAlive ?? "30m",
        options: { ...SAMPLING, temperature: req.temperature ?? 0.7, num_ctx: cfg.contextTokens, ...(req.maxTokens ? { num_predict: req.maxTokens } : {}) },
      };
      const t0 = Date.now();
      const r = await f(url("/api/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: sig(req.signal) });
      if (!r.ok) throw new Error(`Ollama respondió ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      const j = (await r.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number; total_duration?: number; load_duration?: number; prompt_eval_duration?: number; eval_duration?: number; error?: string };
      if (j.error) throw new Error(`Ollama: ${j.error}`);
      const usage: LlmUsage = { promptTokens: j.prompt_eval_count ?? 0, outputTokens: j.eval_count ?? 0, totalMs: j.total_duration ? j.total_duration / 1e6 : Date.now() - t0, loadMs: (j.load_duration ?? 0) / 1e6, promptMs: (j.prompt_eval_duration ?? 0) / 1e6, evalMs: (j.eval_duration ?? 0) / 1e6 };
      return { text: j.message?.content ?? "", usage };
    },
  };
}
