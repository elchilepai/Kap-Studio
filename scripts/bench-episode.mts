/**
 * Prueba de rendimiento representativa: episodio de ~5 min a 1080p con varios personajes, escenarios, movimiento, paralaje,
 * narración real (eSpeak), música con ducking y subtítulos quemados. Mide etapas, memoria y eficiencia de la caché.
 *   KAP_DATA_DIR no se usa: trabaja en un directorio temporal y lo borra al terminar (BENCH_KEEP=1 para conservarlo).
 *   BENCH_SCENES=28 BENCH_QUALITY=1080p npx tsx --no-warnings scripts/bench-episode.mts
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createCanvas } from "@napi-rs/canvas";
import { createSqliteStorage } from "../src/adapters/local/sqlite-storage";
import { createSqliteRender } from "../src/adapters/local/sqlite-render";
import { RenderQueue } from "../src/server/render/queue";
import { createExecutor } from "../src/server/render/executor";
import { ffprobe } from "../src/server/render/ffmpeg";
import { espeakProvider } from "../src/server/studio/voice";
import { afterRender } from "../src/server/studio/after";
import { applyDesignChange, autoDesign } from "../src/server/animation/design";

const SCENES = Number(process.env.BENCH_SCENES ?? 22), QUALITY = (process.env.BENCH_QUALITY ?? "1080p") as "480p" | "720p" | "1080p";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-bench-")), media = path.join(root, "media"), cache = path.join(root, "cache");
await fs.mkdir(media, { recursive: true });
const st = createSqliteStorage(path.join(root, "kap.db")), store = createSqliteRender(st.db);
const now = () => new Date().toISOString();

// ---- recursos: música (330 s) y dos capas de paralaje PNG propias (siluetas tileables) ----
const ff = (...a: string[]) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a]); if (r.status !== 0) throw new Error(r.stderr.toString()); };
ff("-f", "lavfi", "-i", "sine=f=196:d=330", "-f", "lavfi", "-i", "anoisesrc=d=330:c=pink:a=0.02", "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0", "-c:a", "libmp3lame", path.join(media, "tema.mp3"));
await st.assets.save({ id: "mus", kind: "audio", path: "tema.mp3", origin: "uploaded", license: "propio", createdAt: now(), name: "tema.mp3", mime: "audio/mpeg", size: 1, role: "music" });
for (const [id, col, hMin, hMax] of [["ly-far", "#1b2644", 1.2, 3.2], ["ly-near", "#0e1528", 0.6, 2]] as const) {
  const cv = createCanvas(2400, 600), c = cv.getContext("2d"); c.fillStyle = col; let x = 0, k = 0;
  while (x < 2400) { const w = 90 + ((k * 53) % 120), h = (hMin + ((k * 37) % 100) / 100 * (hMax - hMin)) * 100; c.fillRect(x, 600 - h, w, h); x += w; k++; }
  await fs.writeFile(path.join(media, `${id}.png`), cv.toBuffer("image/png"));
  await st.assets.save({ id, kind: "image", path: `${id}.png`, origin: "uploaded", license: "propio", createdAt: now(), name: `${id}.png`, mime: "image/png", size: 1, width: 2400, height: 600, role: "background" });
}

// ---- biblia: 4 personajes diseñados y 6 escenarios (2 con capas de paralaje personalizadas) ----
const looks: Record<string, Partial<ReturnType<typeof autoDesign>>> = {
  KAP: { skin: "#f1c9a5", hairStyle: "spiky", hairColor: "#2b2a33", eyeColor: "#3b6ea8" }, Mira: { skin: "#b9805b", hairStyle: "long", hairColor: "#4a2a1f", eyeColor: "#2f7d5b", body: "slim" },
  Vega: { skin: "#8a5a3c", hairStyle: "curly", hairColor: "#1b1b22", eyeColor: "#6b4a2a", body: "broad", height: 1.08 }, Nico: { skin: "#e0ac84", hairStyle: "ponytail", hairColor: "#a0382b", eyeColor: "#4a4f8a", height: 0.9 },
};
const tops: Record<string, string> = { KAP: "#E9B949", Mira: "#7a4ea8", Vega: "#3b7a6f", Nico: "#b5543c" };
for (const [name, l] of Object.entries(looks)) { const d = { ...autoDesign(name), ...l } as ReturnType<typeof autoDesign>; d.outfits = [{ ...d.outfits[0], top: tops[name] }]; await st.characters.save({ id: name.toLowerCase(), name, description: "", traits: [], voiceNotes: "", referenceAssetIds: [], design: applyDesignChange(undefined, d, "Diseño inicial", now()) }); }
const places: [string, "room" | "rooftop" | "street" | "forest" | "city" | "abstract", "day" | "dusk" | "night", boolean][] = [["Refugio", "room", "night", false], ["Azotea", "rooftop", "dusk", true], ["Calle vacía", "street", "night", true], ["Puente", "street", "dusk", false], ["Bosque", "forest", "day", false], ["Faro", "city", "night", false]];
for (const [name, preset, tod, layers] of places) await st.places.save({ id: name, name, description: "", createdAt: now(), set: { preset, timeOfDay: tod, ...(layers ? { layers: [{ image: "ly-far", depth: 0.7, tile: true, height: 5, y: 2.2, alpha: 0.9 }, { image: "ly-near", depth: -0.25, tile: true, height: 3, y: 6.2, alpha: 0.85 }] } : {}) } });

// ---- guion: SCENES escenas con narración, diálogo y direcciones (movimiento, cámara, gestos, efectos) ----
const N = ["El viento cruza la ciudad vacía y nadie parece recordar cómo era antes de la noche larga.", "Las luces de los edificios parpadean sin motivo mientras el eco de los pasos se pierde entre las calles.", "Hace tiempo que nadie enciende las farolas del puente, pero algo todavía vigila desde la orilla.", "El camino se estrecha entre los árboles y el aire huele a lluvia, a metal y a ceniza fría.", "Desde lo alto se ve el mar, inmóvil, como si también esperase una respuesta que nunca llega."];
const D: [string, string, string, string][] = [["KAP", "No recuerdo cómo llegué hasta aquí.", "Mira", "Entonces tenemos que averiguarlo juntos."], ["Vega", "Las señales llevan días apagadas.", "KAP", "Alguien tuvo que apagarlas a propósito."], ["Nico", "He visto una luz en el faro.", "Mira", "¡Eso es imposible, está abandonado!"], ["Mira", "No podemos quedarnos aquí mucho más.", "Vega", "Lo sé, pero el puente es la única salida."]];
const dirs = (i: number) => [i % 7 === 0 ? "entra: KAP izquierda" : "", i % 5 === 1 ? "gesto: Mira señala en 2s" : "", i % 6 === 2 ? "camara: paneo derecha" : "", i % 4 === 3 ? "vfx: lluvia" : "", i % 9 === 4 ? "pose: Vega brazos cruzados en 1s" : "", i % 8 === 5 ? "camina: Nico a derecha" : "", i % 11 === 6 ? "expresion: KAP preocupado en 1s" : ""].filter(Boolean).map((d) => `[${d}]`);
const script = Array.from({ length: SCENES }, (_, i) => { const [p] = places[i % places.length], d = D[i % D.length]; return [`# ${p}`, ...dirs(i), N[i % N.length], `${d[0].toUpperCase()}: ${d[1]}`, `${d[2].toUpperCase()}: ${d[3]}`].join("\n"); }).join("\n\n");
await st.productions.save({ id: "ep1", kind: "episode", number: 1, season: 1, title: "La noche larga", status: "ASSETS", synopsis: "", script, scenes: [], assetIds: [], durationSec: 0, createdAt: now(), updatedAt: now(), generated: false, brief: "", cast: [], storyTime: "Día 1" } as never);

// ---- ejecución con medición ----
const q = new RenderQueue({ store, storage: st, mediaDir: media, tmpRoot: path.join(root, "tmp"), concurrency: 1, timeoutMs: 3 * 3600_000, minFreeMb: 0, pollMs: 100, heartbeatMs: 200,
  execute: createExecutor(st, { threads: 0, concurrency: 1, studio: { mediaDir: media, cacheDir: cache, voice: espeakProvider(), clipCacheMb: 4000, clipWorkers: Number(process.env.BENCH_WORKERS ?? 1), composeMode: (process.env.BENCH_COMPOSE ?? "segmentos") as "segmentos" | "unico", segmentScenes: Number(process.env.BENCH_SEG ?? 4) } }), afterSuccess: (j, id) => afterRender(j, id, st, store, media, 1) }).start();
const cpuNow = () => { const [, ...v] = fsSync.readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).map(Number); const idle = v[3] + (v[4] || 0); return { busy: (v.reduce((a, b) => a + b, 0) - idle) / 100, wall: Date.now() / 1000 }; };   // CPU-segundos de toda la máquina (equipo en reposo)
const tree = () => { try { const rows = execFileSync("ps", ["-eo", "pid,ppid,rss,comm"]).toString().split("\n").slice(1).map((l) => l.trim().split(/\s+/)); const kids = new Set([String(process.pid)]); let grew = true; while (grew) { grew = false; for (const [pid, ppid] of rows) if (kids.has(ppid) && !kids.has(pid)) { kids.add(pid); grew = true; } } return rows.filter((r) => kids.has(r[0])).reduce((n, r) => n + Number(r[2] || 0), 0) / 1024; } catch { return 0; } };

async function run(id: string, params: Record<string, unknown>, format: "16:9" | "9:16" = "16:9") {
  await store.enqueue({ id, kind: "episode", format, quality: QUALITY, productionId: "ep1", params, maxAttempts: 1 }, Date.now());
  const t0 = Date.now(); const stages: Record<string, { first: number; last: number; peak: number; cpu0: number }> = {}; let peak = 0; let lastLog = ""; const c0 = cpuNow();
  for (;;) {
    const j = (await store.get(id))!; const t = (Date.now() - t0) / 1000; const mem = tree(); peak = Math.max(peak, mem);
    const m = /Paso (\d)\/5/.exec(j.log ?? ""); if (m) { const s = stages[m[1]] ??= { first: t, last: t, peak: 0, cpu0: cpuNow().busy }; s.last = t; s.peak = Math.max(s.peak, mem); }
    if (j.log && j.log !== lastLog && /escena (\d+)\/(\d+)/.test(j.log) && process.env.BENCH_VERBOSE) { console.log(`  [${t.toFixed(0)}s] ${j.log} ${(j.progress * 100).toFixed(0)}%`); lastLog = j.log; }
    if (["done", "failed", "canceled"].includes(j.status)) { if (j.status !== "done") throw new Error(`${id} ${j.status}: ${j.error}`); return { total: t, stages, peakMb: peak, cpuSec: cpuNow().busy - c0.busy, cpuEnd: cpuNow().busy, job: j }; }
    await new Promise((r) => setTimeout(r, 100));
  }
}
const NAMES = ["", "1 Analizar y planificar", "2 Narración (voz + duraciones)", "3 Animación 2D por escena", "4 Montaje + audio + subtítulos", "5 Verificación"];
console.log(`\n== Episodio de prueba: ${SCENES} escenas · ${QUALITY} · 4 personajes · 6 escenarios · voz eSpeak · música · subtítulos ==`);
const FORMAT = (process.env.BENCH_FORMAT ?? "16:9") as "16:9" | "9:16", SHORTS = Number(process.env.BENCH_SHORTS ?? 0);
const r1 = await run("run1", { mode: "full", voice: "espeak", animation: "2d", musicAssetId: "mus", shortsCount: SHORTS }, FORMAT);
const ep = (await st.productions.get("ep1"))!; const vid = (await st.assets.get(ep.videoAssetId!))!; const probe = await ffprobe(path.join(media, vid.path));
const dur = ep.scenes.reduce((n, s) => n + s.durationSec, 0);
console.log(`\nVÍDEO: ${probe.width}×${probe.height} ${probe.videoCodec}/${probe.audioCodec} · ${probe.durationSec.toFixed(1)} s (${(probe.durationSec / 60).toFixed(2)} min) · ${(vid.size / 1048576).toFixed(1)} MB · ${ep.scenes.length} escenas`);
console.log(`RENDER COMPLETO (sin caché): ${(r1.total / 60).toFixed(2)} min (${r1.total.toFixed(0)} s) · ${(r1.total / probe.durationSec).toFixed(2)}× tiempo real · pico de memoria (web+worker+ffmpeg): ${r1.peakMb.toFixed(0)} MB`);
const keys = Object.keys(r1.stages).sort(); keys.forEach((k, i) => { const s = r1.stages[k], next = keys[i + 1] ? r1.stages[keys[i + 1]].first : r1.total; const cpuNext = keys[i + 1] ? r1.stages[keys[i + 1]].cpu0 : r1.cpuEnd; console.log(`  etapa ${NAMES[Number(k)]}: ${(next - s.first).toFixed(0)} s · pico ${s.peak.toFixed(0)} MB · CPU ${(cpuNext - s.cpu0).toFixed(0)} s (${((cpuNext - s.cpu0) / Math.max(1, next - s.first)).toFixed(1)} núcleos de media)`); });
console.log(`  CPU total del render: ${r1.cpuSec.toFixed(0)} s (${(r1.cpuSec / r1.total).toFixed(2)} núcleos de media sobre ${os.cpus().length})`);
if (process.env.BENCH_OUT) { await fs.mkdir(process.env.BENCH_OUT, { recursive: true }); await fs.copyFile(path.join(media, vid.path), path.join(process.env.BENCH_OUT, "episode.mp4")); }
const frames = Math.round(probe.durationSec * 30); console.log(`  fotogramas: ${frames} → ${(r1.total / frames * 1000).toFixed(0)} ms/fotograma de extremo a extremo`);
const nClips = (await fs.readdir(path.join(cache, "clips"))).length; console.log(`  clips en caché: ${nClips} · caché ocupa ${(execFileSync("du", ["-sm", cache]).toString().split("\t")[0])} MB`);

if (SHORTS > 0) {   // los Shorts derivados los encola afterRender: se espera a que terminen y se mide su memoria/tiempo
  const t0 = Date.now(); let peak = 0;
  for (;;) { const js = (await store.list(200)).filter((j) => j.kind === "short"); peak = Math.max(peak, tree());
    if (js.length && js.every((j) => ["done", "failed", "canceled"].includes(j.status))) { const bad = js.filter((j) => j.status !== "done"); if (bad.length) throw new Error("short " + bad[0].status + ": " + bad[0].error); break; }
    if (Date.now() - t0 > 3600_000) throw new Error("timeout shorts"); await new Promise((r) => setTimeout(r, 100)); }
  const shorts = (await st.productions.list()).filter((p) => p.kind === "short");
  console.log(`\nSHORTS DERIVADOS: ${shorts.length} en ${((Date.now() - t0) / 1000).toFixed(0)} s · pico de memoria ${peak.toFixed(0)} MB`);
  for (const sh of shorts) { const a = (await st.assets.get(sh.videoAssetId!))!; const pr = await ffprobe(path.join(media, a.path)); console.log(`  ${sh.title}: ${pr.width}×${pr.height} ${pr.videoCodec}/${pr.audioCodec} · ${pr.durationSec.toFixed(1)} s · ${(a.size / 1048576).toFixed(1)} MB`);
    if (process.env.BENCH_OUT) await fs.copyFile(path.join(media, a.path), path.join(process.env.BENCH_OUT, `short-${sh.number}.mp4`)); }
}
if (process.env.BENCH_ONLY) { await q.shutdown(); if (!process.env.BENCH_KEEP) await fs.rm(root, { recursive: true, force: true }); process.exit(0); }
// segunda ejecución idéntica (todo en caché) y edición de UNA escena
const r2 = await run("run2", { mode: "rerender", voice: "espeak", animation: "2d", musicAssetId: "mus", shortsCount: 0 });
console.log(`\nRE-RENDER IDÉNTICO (todo en caché): ${r2.total.toFixed(0)} s (solo montaje y mezcla)`);
const cur = (await st.productions.get("ep1"))!; const mid = Math.floor(cur.scenes.length / 2);
await st.productions.save({ ...cur, scenes: cur.scenes.map((s, i) => (i === mid ? { ...s, locked: true, directions: [...s.directions, "camara: zoom 1.5 durante 2s"] } : s)) });
const before = new Set(await fs.readdir(path.join(cache, "clips")));
const r3 = await run("run3", { mode: "rerender", voice: "espeak", animation: "2d", musicAssetId: "mus", shortsCount: 0 });
const fresh = (await fs.readdir(path.join(cache, "clips"))).filter((f) => !before.has(f)).length;
console.log(`EDITAR 1 ESCENA Y RECOMPONER: ${r3.total.toFixed(0)} s · clips nuevos: ${fresh} de ${cur.scenes.length}`);
console.log(JSON.stringify({ scenes: SCENES, quality: QUALITY, videoSec: +probe.durationSec.toFixed(1), fullSec: +r1.total.toFixed(0), cachedSec: +r2.total.toFixed(0), editSec: +r3.total.toFixed(0), peakMb: +r1.peakMb.toFixed(0), cpuSec: +r1.cpuSec.toFixed(0), stagePeaks: Object.fromEntries(Object.entries(r1.stages).map(([k, v]) => [k, +v.peak.toFixed(0)])), r2Peak: +r2.peakMb.toFixed(0), r3Peak: +r3.peakMb.toFixed(0), sizeMb: +(vid.size / 1048576).toFixed(1), cpus: os.cpus().length, dur: +dur.toFixed(1) }));
await q.shutdown(); if (!process.env.BENCH_KEEP) await fs.rm(root, { recursive: true, force: true }); else console.log("datos en", root);
