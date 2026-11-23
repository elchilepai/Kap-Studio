/**
 * PASO 2 V4 — FASE A: 5 CADENAS NARRATIVAS con Qwen3-14B (Ollama). Valida solo la estructura y SE DETIENE para la aprobación humana. Sin viñetas, hooks, guion ni imágenes.
 *   AI_MODEL=qwen3:14b npx tsx --no-warnings scripts/shorts-chains-v4.mts [directorio]
 */
import fs from "node:fs/promises";
import path from "node:path";
const DIR = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "shorts-ideas-v4-run")), MODEL = process.env.AI_MODEL ?? "qwen3:14b", URL = process.env.KAP_OLLAMA_URL ?? "http://127.0.0.1:11434";
const { createOllamaClient } = await import("../src/server/ai/ollama"); const { runStages, loadStage } = await import("../src/server/shorts/stages"); const { chainStageV4, chainsMarkdown } = await import("../src/server/shorts/chainStageV4");
const base = createOllamaClient({ baseUrl: URL, model: MODEL, contextTokens: 8192, timeoutMs: 60 * 60_000 });
if (!(await base.available())) { console.error(`El modelo ${MODEL} no está disponible`); process.exit(2); }
let n = 0; const llm = { ...base, generate: async (req: Parameters<typeof base.generate>[0]) => { if (n > 0 && n % 3 === 0) { try { await fetch(`${URL}/api/generate`, { method: "POST", body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }); await new Promise((r) => setTimeout(r, 4000)); } catch { /* no crítico */ } } n++; return base.generate(req); }, available: () => base.available() } as typeof base;
const log = (m: string) => console.log(`LOG ${new Date().toISOString().slice(11, 19)} ${m}`);
log(`== Cadenas V4 · ${MODEL} · ${DIR} ==`);
const r = await runStages(DIR, "Cadenas narrativas para Shorts de KAP", { idea: chainStageV4(llm, DIR, { log }) }, { stopAfter: "idea" });
if (!r.failed) { const out = await loadStage<import("../src/server/shorts/chainStageV4").ChainStageOut>(DIR, "idea"); await fs.writeFile(path.join(DIR, "CADENAS-PARA-APROBAR.md"), chainsMarkdown(out)); }
console.log("RESULT " + JSON.stringify({ ran: r.ran, skipped: r.skipped, failed: r.failed ?? null, llmCalls: n }));
