/**
 * PRIMER EPISODIO REAL (candidato a oficial): el sistema validado tal cual, sin cambios — Qwen3-14B por Ollama, canon inicial de KAP, memoria de
 * los episodios 1-3 de demostración (la misma que las pruebas ciegas), generador por arco (behaviorBeats, heredaDeLaEscenaAnterior, cadena causal,
 * KAP_REALISM_CHECK, cierre y rima de apertura), y después memoria/continuidad → IR → animación 2D → render real (voz eSpeak). Todo en un directorio
 * temporal: no toca ./data ni confirma nada en el canon (el episodio queda como CANDIDATO a la espera de aprobación manual).
 *   AI_MODEL=qwen3:14b npx tsx --no-warnings scripts/real-episode.mts
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-real-")), media = path.join(root, "media"), cache = path.join(root, "cache"), OUT = path.join(import.meta.dirname, "..", "docs", "short-real");
process.env.KAP_DATA_DIR = root; await fs.mkdir(media, { recursive: true }); await fs.mkdir(OUT, { recursive: true });
const MODEL = process.env.AI_MODEL ?? "qwen3:14b", QUALITY = (process.env.REAL_QUALITY ?? "480p") as "480p" | "720p" | "1080p", NUMBER = 1;
const REQUEST = "Crea un Short de KAP. Tema: «¿Por qué sentimos que todos avanzan menos nosotros?». KAP lo descubre mediante una pequeña historia visual, no mediante un discurso. Puede aparecer su hermano pequeño.";

const { createSqliteStorage } = await import("../src/adapters/local/sqlite-storage");
const { createSqliteRender } = await import("../src/adapters/local/sqlite-render");
const { createOllamaClient } = await import("../src/server/ai/ollama");
const { llmShortAuthor } = await import("../src/server/ai/short");
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

// 1) GENERACIÓN por el camino real de la app (createEpisodeFromRequest con el autor por arco); se observa lo que devuelve sin tocarlo
const author: any = llmShortAuthor(llm); let captured: any;
const observed = { ...author, available: () => author.available(), write: async (a: any) => { captured = await author.write(a); return captured; } };
const deps = { ...base, ai: { author: observed } } as any;
const t0 = Date.now();
const r = await M.createEpisodeFromRequest(deps, REQUEST, { mode: "short" });
const genMin = (Date.now() - t0) / 60000; console.log(`generado en ${genMin.toFixed(1)} min · autor IA: ${r.authored}`);
if (!r.authored || !captured) { console.error("El autor no produjo guion:", r.warnings); process.exit(3); }
const draft = author.lastDraft, scenesPlan = author.lastScenes, beats = author.lastBeats, retention = author.lastRetention, st0 = captured.stats, title = draft.title as string;
const words = draft.scenes.reduce((n: number, s: any) => n + s.lines.reduce((k: number, l: any) => k + (l.text.match(/[a-záéíóúñü]+/gi) ?? []).length, 0), 0);
await st.productions.save({ ...(await st.productions.get(r.production.id))!, title, status: "REVIEW" });
const ir = parse(captured.script); const ms = { findings: [] as any[] };   // la memoria narrativa solo se propone para episodios
const gen = { number: NUMBER, title, request: REQUEST, request_parsed: { number: r.request.number, continuesFrom: r.request.continuesFrom, exact: r.request.exact, cast: r.request.cast }, generationMin: +genMin.toFixed(1), scenes: draft.scenes.length, words, estimatedSec: draftSeconds(draft), irValid: ir.errors.length === 0, irErrors: ir.errors,
  retention, beats, scenesPlan, checks: st0.realism, gate: { regenerated: st0.scenesRegenerated, localPatches: st0.localPatches, codeRepairs: st0.codeRepairs, dropped: st0.scenesDropped, patchKinds: st0.patchKinds, gateIssues: st0.gateIssues, arcRevisions: st0.arcRevisions, endingRevisions: st0.endingRevisions, varietyRevisions: st0.varietyRevisions, rhymeValid: st0.rhymeValid },
  usage: st0.usage, calls: st0.attempts, retries: st0.retries, warnings: r.warnings, story: author.lastStory,
  continuity: { critical: ms.findings.filter((f: any) => f.severity === "error").map((f: any) => `${f.rule}: ${f.text}`), warnings: ms.findings.filter((f: any) => f.severity === "warning").map((f: any) => `${f.rule}: ${f.text}`), info: ms.findings.filter((f: any) => f.severity === "info").length }, script: captured.script };
await fs.writeFile(path.join(OUT, "short-04-candidato.json"), JSON.stringify(gen, null, 1));
await fs.writeFile(path.join(OUT, "short-04-candidato.txt"), `Short 4 · «${title}» (CANDIDATO, sin aprobar)\nPetición: ${REQUEST}\n\n${captured.script}\n`);
console.log(`escenas ${gen.scenes} · palabras ${words} · ≈ ${(gen.estimatedSec / 60).toFixed(2)} min · IR ${gen.irValid ? "válida" : "INVÁLIDA"} · realismo ${st0.realism?.passed}/${st0.realism?.total}`);

// 2) RENDER real (el modelo se descarga antes: la animación y FFmpeg necesitan la RAM)
try { await fetch("http://127.0.0.1:11434/api/generate", { method: "POST", body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }); await new Promise((x) => setTimeout(x, 5000)); } catch { /* no crítico */ }
const q = new RenderQueue({ store, storage: st, mediaDir: media, tmpRoot: path.join(root, "tmp"), concurrency: 1, timeoutMs: 3 * 3600_000, minFreeMb: 0, pollMs: 100, heartbeatMs: 200,
  execute: createExecutor(st, { threads: 0, concurrency: 1, studio: { mediaDir: media, cacheDir: cache, voice: espeakProvider(), clipCacheMb: 2000, clipWorkers: 1, composeMode: "segmentos", segmentScenes: 4 } }),
  afterSuccess: (j: any, id: any) => afterRender(j, id, st, store, media, 1) }).start();
const rt0 = Date.now(); await store.enqueue({ id: "ep4", kind: "short", format: "9:16", quality: QUALITY, productionId: r.production.id, params: { mode: "full", voice: "espeak", animation: "2d", shortsCount: 0 }, maxAttempts: 1 }, Date.now());
let job: any; for (;;) { job = (await store.get("ep4"))!; if (["done", "failed", "canceled"].includes(job.status)) break; await new Promise((x) => setTimeout(x, 500)); }
const render: any = { status: job.status, error: job.error ?? null, renderSec: +((Date.now() - rt0) / 1000).toFixed(0), quality: QUALITY };
if (job.status === "done") {
  const prod = (await st.productions.get(r.production.id))!, vid = (await st.assets.get(prod.videoAssetId!))!, file = path.join(media, vid.path), pr = await ffprobe(file);
  Object.assign(render, { width: pr.width, height: pr.height, video: pr.videoCodec, audio: pr.audioCodec, durationSec: +pr.durationSec.toFixed(1), sizeMb: +(vid.size / 1048576).toFixed(1), scenes: prod.scenes.length });
  const dir = path.join(OUT, "frames-04"); await fs.mkdir(dir, { recursive: true }); const n = 12;
  for (let i = 0; i < n; i++) { const t = (pr.durationSec * (i + 0.5)) / n; try { execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", t.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=270:-1", path.join(dir, `f${i + 1}.png`)]); } catch { /* sigue */ } }
  try { execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(dir, "f%d.png"), "-filter_complex", "tile=6x2", "-frames:v", "1", path.join(OUT, "short-04-hoja-contacto.png")]); } catch { /* sigue */ }
  await fs.copyFile(file, path.join(root, "short-04.mp4")); render.videoPath = path.join(root, "short-04.mp4");
  try { const vol = execFileSync("ffmpeg", ["-v", "info", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] }); void vol; } catch (e: any) { render.audio_stats = String(e.stderr ?? "").split("\n").filter((l: string) => /mean_volume|max_volume/.test(l)).map((l: string) => l.trim()); }
}
gen.render = render; await fs.writeFile(path.join(OUT, "short-04-candidato.json"), JSON.stringify(gen, null, 1));
console.log("RENDER " + JSON.stringify(render)); await q.shutdown();
console.log(`DIR ${root}`);
