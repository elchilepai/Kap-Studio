/**
 * STORYBOARD de un mini-relato (sin vídeo): Qwen3-14B por Ollama escribe 5 escenas (narración + descripción visual + plano + emoción + propósito); el código comprueba el contenido
 * y escribe el paquete para generar las imágenes FUERA (prompts con style bible y fichas de KAP y del hermano, narración para ElevenLabs). Todo en un directorio temporal.
 *   AI_MODEL=qwen3:14b npx tsx --no-warnings scripts/storyboard.mts
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-real-")), media = path.join(root, "media"), cache = path.join(root, "cache"), OUT = path.join(import.meta.dirname, "..", "docs", "storyboard-concept");
process.env.KAP_DATA_DIR = root; await fs.mkdir(media, { recursive: true }); await fs.mkdir(OUT, { recursive: true });
const MODEL = process.env.AI_MODEL ?? "qwen3:14b", QUALITY = (process.env.REAL_QUALITY ?? "480p") as "480p" | "720p" | "1080p", NUMBER = 1;
const REQUEST = "Crea un Short de KAP. Tema: «¿Por qué sentimos que todos avanzan menos nosotros?». KAP lo descubre mediante una pequeña historia visual, no mediante un discurso. Puede aparecer su hermano pequeño.";

const { createSqliteStorage } = await import("../src/adapters/local/sqlite-storage");
const { createSqliteRender } = await import("../src/adapters/local/sqlite-render");
const { createOllamaClient } = await import("../src/server/ai/ollama");
const { generateStoryboard } = await import("../src/server/ai/storyboard"); const { writeImagePack } = await import("../src/server/images/pack");
const { validateIR } = await import("../src/domain/screenplay");
const { irToScenes, parsedToIR } = await import("../src/server/studio/interpreter");
const { parseScript } = await import("../src/server/studio/script");
const { draftSeconds } = await import("../src/server/ai/episode");
const { RenderQueue } = await import("../src/server/render/queue");
const { createExecutor } = await import("../src/server/render/executor");
const { ffprobe } = await import("../src/server/render/ffmpeg");
const { espeakProvider } = await import("../src/server/studio/voice");
const { afterRender } = await import("../src/server/studio/after");
const M = await import("../src/server/memory/service");

const llm = createOllamaClient({ baseUrl: process.env.KAP_OLLAMA_URL ?? "http://127.0.0.1:11434", model: MODEL, contextTokens: 8192, timeoutMs: 45 * 60_000 });
console.log(`== Short real · ${MODEL} · contexto ${llm.contextTokens} · SHORT MODE · render ${QUALITY} ==`);
if (!(await llm.available())) { console.error(`El modelo ${MODEL} no está disponible`); process.exit(2); }

const st = createSqliteStorage(path.join(root, "kap.db")), store = createSqliteRender(st.db), NAMES = ["KAP", "Hermano de KAP", "Dani", "Ramiro", "Profesora"];
for (const [i, n] of NAMES.entries()) await st.characters.save({ id: `c${i}`, name: n, description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });
const base = { storage: st, now: () => "2026-04-01T00:00:00Z" } as any;
await M.registerKapCanon(base);
const chars = await st.characters.list(), bible = { characters: NAMES, places: [] as string[] };
const parse = (script: string) => validateIR(parsedToIR(parseScript(script, chars.map((c, i) => ({ id: String(i), name: c.name })))), bible);
const mk = async (id: string, number: number, script: string, status: "REVIEW" | "APPROVED", extra: Record<string, unknown> = {}) => { const r = parse(script); if (!r.ir) throw new Error(`guion inválido: ${r.errors.join("; ")}`);
  const p = { id, kind: "episode" as const, number, season: 1, title: `Episodio ${number}`, status, synopsis: "", script, scenes: irToScenes(r.ir, chars), assetIds: [], durationSec: 300, cast: [], storyTime: "", generated: true, brief: "", createdAt: "x", updatedAt: "x", ...extra }; await st.productions.save(p as never); return p; };
for (let n = 1; n <= 3; n++) {   // memoria permitida: los episodios 1-3 de demostración (fixtures), igual que en las pruebas ciegas
  await mk(`demo${n}`, n, await fs.readFile(path.join(import.meta.dirname, "fixtures", "kap-demo", `ep${n}.txt`), "utf8"), "REVIEW", n > 1 ? { continuesFrom: 1000 + n - 1 } : {});
  await M.proposeMemory(base, `demo${n}`); await M.saveDecisions(base, `demo${n}`, { all: "accepted" }); await st.productions.save({ ...(await st.productions.get(`demo${n}`))!, status: "APPROVED" }); await M.commitMemory(base, `demo${n}`);
}

// STORYBOARD (no genera vídeo ni imágenes): 5 escenas con narración, descripción visual y prompt de imagen por escena
const t0 = Date.now(); const { request, pack } = await M.requestContext(st, REQUEST);
const cast = ["KAP", ...(/hermano/i.test(REQUEST) ? ["Hermano de KAP"] : [])];
const r = await generateStoryboard(llm, { context: pack, cast });
console.log(`generado en ${((Date.now() - t0) / 60000).toFixed(1)} min · llamadas ${r.calls} · reescrituras ${r.rewrites} · avisos ${r.reasons.length}`);
const { files } = await writeImagePack(OUT, r.storyboard, { aspect: "9:16" });
await fs.writeFile(path.join(OUT, "avisos.json"), JSON.stringify({ reasons: r.reasons, warnings: r.warnings, rewrites: r.rewrites, calls: r.calls, usage: r.usage }, null, 1));
console.log("PACK " + files.length + " ficheros en " + OUT); console.log("REASONS " + JSON.stringify(r.reasons));
