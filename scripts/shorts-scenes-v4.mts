/**
 * PRUEBA V4 DE EXTREMO A EXTREMO (1/2): cadena APROBADA → guion de 30-45 s + 8-10 escenas con Qwen3-14B. Se detiene para revisión: sin prompts de imagen ni imágenes.
 *   AI_MODEL=qwen3:14b npx tsx --no-warnings scripts/shorts-scenes-v4.mts [cadena-02|cadena-04] [directorio]
 */
import fs from "node:fs/promises";
import path from "node:path";
const ID = process.argv[2] ?? "cadena-02", DIR = path.resolve(process.argv[3] ?? path.join(import.meta.dirname, "..", "docs", "shorts-v4-" + (ID === "cadena-02" ? "reloj" : "camiseta"))), MODEL = process.env.AI_MODEL ?? "qwen3:14b", URL = process.env.KAP_OLLAMA_URL ?? "http://127.0.0.1:11434";
const { createOllamaClient } = await import("../src/server/ai/ollama"); const { runStages, loadStage } = await import("../src/server/shorts/stages"); const { scriptStageV4, scriptMarkdown } = await import("../src/server/shorts/scenesStageV4");
const { chainIssues } = await import("../src/narrative/chainV4");
const chain = JSON.parse(await fs.readFile(path.join(import.meta.dirname, "..", "docs", "shorts-ideas-v4-run", "approved", `${ID}.json`), "utf8")); if (chainIssues(chain).length) { console.error("La cadena aprobada no pasa la validación estructural"); process.exit(2); }
const llm = createOllamaClient({ baseUrl: URL, model: MODEL, contextTokens: 8192, timeoutMs: 60 * 60_000 }); if (!(await llm.available())) { console.error(`El modelo ${MODEL} no está disponible`); process.exit(2); }
const log = (m: string) => console.log(`LOG ${new Date().toISOString().slice(11, 19)} ${m}`); log(`== Guion y escenas V4 · ${ID} · ${MODEL} · ${DIR} ==`);
const r = await runStages(DIR, chain.titulo, { script: scriptStageV4(llm, chain, { log }) }, { stopAfter: "script" });
if (!r.failed) { const out = await loadStage<import("../src/server/shorts/scenesStageV4").ScriptStageOut>(DIR, "script"); await fs.writeFile(path.join(DIR, "GUION-Y-ESCENAS.md"), scriptMarkdown(out)); }
console.log("RESULT " + JSON.stringify({ ran: r.ran, skipped: r.skipped, failed: r.failed ?? null }));
