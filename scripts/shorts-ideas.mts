/**
 * PASO 2 — IDEAS Y HOOKS REALES con Qwen3-14B (Ollama), por etapas recuperables. Sin guion, storyboard, imágenes ni vídeo.
 *   AI_MODEL=qwen3:14b npx tsx --no-warnings scripts/shorts-ideas.mts [directorio]
 * Si se interrumpe, al repetirlo continúa donde se quedó (lotes de ideas y hooks por idea guardados en <dir>/stages).
 */
import path from "node:path";
const DIR = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "shorts-ideas-run")), MODEL = process.env.AI_MODEL ?? "qwen3:14b", URL = process.env.KAP_OLLAMA_URL ?? "http://127.0.0.1:11434";
const { createOllamaClient } = await import("../src/server/ai/ollama"); const { runStages } = await import("../src/server/shorts/stages"); const { ideaStage, hooksStage } = await import("../src/server/shorts/ideasStage");
const base = createOllamaClient({ baseUrl: URL, model: MODEL, contextTokens: 8192, timeoutMs: 60 * 60_000 });
if (!(await base.available())) { console.error(`El modelo ${MODEL} no está disponible`); process.exit(2); }
let n = 0; const llm = { ...base, generate: async (req: Parameters<typeof base.generate>[0]) => { if (n > 0 && n % 3 === 0) { try { await fetch(`${URL}/api/generate`, { method: "POST", body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }); await new Promise((r) => setTimeout(r, 4000)); } catch { /* no crítico */ } } n++; return base.generate(req); }, available: () => base.available() } as typeof base;   // descarga el modelo cada 3 llamadas (el servidor de Ollama crece en RAM)
const log = (m: string) => console.log(`LOG ${new Date().toISOString().slice(11, 19)} ${m}`);
log(`== Ideas y hooks · ${MODEL} · ${DIR} ==`);
const r = await runStages(DIR, "Ideas y hooks para Shorts de KAP", { idea: ideaStage(llm, DIR, { log }), hooks: hooksStage(llm, DIR, { log }) }, { stopAfter: "hooks" });
console.log("RESULT " + JSON.stringify({ ran: r.ran, skipped: r.skipped, failed: r.failed ?? null, llmCalls: n }));
