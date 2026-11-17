/**
 * Demostración TÉCNICA de la serie sobre el pipeline REAL: episodios consecutivos de ≈ 5 min (voz eSpeak, animación 2D, subtítulos)
 * con la memoria narrativa en el bucle: canon inicial → petición → contexto → (guion de demostración) → render → propuesta de memoria
 * → aprobación → confirmación → canon → siguiente episodio. Los textos son de `scripts/fixtures/kap-demo/` y NO son canon.
 *   SERIES_EPISODES=3 SERIES_QUALITY=480p npx tsx --no-warnings scripts/series-demo.mts
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-series-")), media = path.join(root, "media"), cache = path.join(root, "cache");
process.env.KAP_DATA_DIR = root;   // todo (incluida la auditoría) dentro del directorio temporal: no se toca ./data
await fs.mkdir(media, { recursive: true });
const { createSqliteStorage } = await import("../src/adapters/local/sqlite-storage");
const { createSqliteRender } = await import("../src/adapters/local/sqlite-render");
const { RenderQueue } = await import("../src/server/render/queue");
const { createExecutor } = await import("../src/server/render/executor");
const { ffprobe } = await import("../src/server/render/ffmpeg");
const { espeakProvider } = await import("../src/server/studio/voice");
const { afterRender } = await import("../src/server/studio/after");
const M = await import("../src/server/memory/service");

const N = Number(process.env.SERIES_EPISODES ?? 3), QUALITY = (process.env.SERIES_QUALITY ?? "480p") as "480p" | "720p" | "1080p";
const st = createSqliteStorage(path.join(root, "kap.db")), store = createSqliteRender(st.db), deps = { storage: st };
const q = new RenderQueue({ store, storage: st, mediaDir: media, tmpRoot: path.join(root, "tmp"), concurrency: 1, timeoutMs: 3 * 3600_000, minFreeMb: 0, pollMs: 100, heartbeatMs: 200,
  execute: createExecutor(st, { threads: 0, concurrency: 1, studio: { mediaDir: media, cacheDir: cache, voice: espeakProvider(), clipCacheMb: 2000, clipWorkers: 1, composeMode: "segmentos", segmentScenes: 4 } }),
  afterSuccess: (j, id) => afterRender(j, id, st, store, media, 1) }).start();
const tree = () => { try { const rows = execFileSync("ps", ["-eo", "pid,ppid,rss,comm"]).toString().split("\n").slice(1).map((l) => l.trim().split(/\s+/)); const kids = new Set([String(process.pid)]); let g = true; while (g) { g = false; for (const [p, pp] of rows) if (kids.has(pp) && !kids.has(p)) { kids.add(p); g = true; } } return rows.filter((r) => kids.has(r[0])).reduce((n, r) => n + Number(r[2] || 0), 0) / 1024; } catch { return 0; } };

console.log(`\n== Serie de KAP · demostración técnica · ${N} episodios consecutivos · ${QUALITY} · voz eSpeak · animación 2D ==`);
const reg = await M.registerKapCanon(deps); console.log(`Canon inicial de KAP: ${reg.added} cambios registrados`);
console.log("\n[Antes del episodio 1]"); console.log((await M.answerStory(st, "antes")).text.split("\n").slice(0, 14).join("\n"));
const report: Record<string, unknown>[] = [];
for (let n = 1; n <= N; n++) {
  const request = n === 1 ? "Crea el episodio 1" : `Crea el episodio ${n} continuando exactamente donde terminó el episodio ${n - 1}`;
  const r = await M.createEpisodeFromRequest(deps, request);
  console.log(`\n=== Episodio ${n} · «${request}» ===`);
  console.log(`contexto: ${r.pack.usedTokens}/${r.pack.budgetTokens} tokens · secciones: ${r.pack.sections.map((s) => `${s.id}(${s.itemsIncluded}/${s.itemsTotal})`).join(" ")}${r.pack.dropped.length ? ` · recortado: ${r.pack.dropped.map((d) => d.section).join(", ")}` : ""}`);
  const script = await fs.readFile(path.join(import.meta.dirname, "fixtures", "kap-demo", `ep${n}.txt`), "utf8");
  await st.productions.save({ ...(await st.productions.get(r.production.id))!, script, title: `Demo ${n}` });
  await store.enqueue({ id: `ep${n}`, kind: "episode", format: "16:9", quality: QUALITY, productionId: r.production.id, params: { mode: "full", voice: "espeak", animation: "2d", shortsCount: 0 }, maxAttempts: 1 }, Date.now());
  const t0 = Date.now(); let peak = 0;
  for (;;) { peak = Math.max(peak, tree()); const j = (await store.get(`ep${n}`))!; if (["done", "failed", "canceled"].includes(j.status)) { if (j.status !== "done") throw new Error(`episodio ${n} ${j.status}: ${j.error}`); break; } await new Promise((x) => setTimeout(x, 250)); }
  const wall = (Date.now() - t0) / 1000, prod = (await st.productions.get(r.production.id))!, vid = (await st.assets.get(prod.videoAssetId!))!, pr = await ffprobe(path.join(media, vid.path));
  const ms = (await M.memoryStatus(st, prod.id))!, by = (s: string) => ms.findings.filter((f) => f.severity === s);
  console.log(`vídeo: ${pr.width}×${pr.height} ${pr.videoCodec}/${pr.audioCodec} · ${(pr.durationSec / 60).toFixed(2)} min (${pr.durationSec.toFixed(1)} s) · ${prod.scenes.length} escenas · render ${wall.toFixed(0)} s · RAM pico ${peak.toFixed(0)} MB`);
  console.log(`memoria propuesta: ${ms.proposal?.changes.length} cambios (${ms.proposal?.changes.filter((c) => c.origin === "declared").length} declarados, ${ms.proposal?.changes.filter((c) => c.origin === "rules").length} deducidos) · estructura: ${ms.proposal?.acts?.map((a) => a.kind).join("/")}`);
  console.log(`continuidad: ${by("error").length} crítico(s) · ${by("warning").length} aviso(s) · ${by("info").length} info`); for (const f of [...by("error"), ...by("warning")]) console.log(`   ${f.severity === "error" ? "✗" : "!"} [${f.rule}] ${f.text}`);
  await st.productions.save({ ...prod, status: "APPROVED" });
  await M.saveDecisions(deps, prod.id, { all: "accepted" }); const em = await M.commitMemory(deps, prod.id);
  const arc = (await M.seriesStatus(st)).arc;
  console.log(`confirmado en el canon · hitos ${arc.achieved}/${arc.total} · etapa «${arc.stage?.title}» · estado final: ${em.endingSituation.slice(0, 160)}…`);
  report.push({ episode: n, minutes: +(pr.durationSec / 60).toFixed(2), scenes: prod.scenes.length, renderSec: +wall.toFixed(0), peakMb: +peak.toFixed(0), sizeMb: +(vid.size / 1048576).toFixed(1), tokens: r.pack.usedTokens, changes: ms.proposal?.changes.length, critical: by("error").length, warnings: by("warning").length });
}
console.log("\n[Tras el último episodio aprobado]\n" + (await M.answerStory(st, "vivido")).text.split("\n").slice(0, 40).join("\n"));
console.log("\n" + (await M.answerStory(st, "terminado")).text);
console.log("\nRESUMEN " + JSON.stringify(report));
await q.shutdown(); if (!process.env.SERIES_KEEP) await fs.rm(root, { recursive: true, force: true });
