import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Asset, Character, Place, Production, Scene, Settings } from "@/domain/types";
import type { RenderJob } from "@/domain/render";
import type { Storage } from "@/ports";
import type { VoiceProvider } from "@/ports/studio";
import { RenderError, ffprobe, resolveFont } from "@/server/render/ffmpeg";
import { dimensions } from "@/server/render/presets";
import type { ExecContext, ExecResult } from "@/server/render/queue";
import { validateOutput } from "@/server/render/executor";
import { parseBrief } from "./brief";
import { ruleInterpreter, irToScenes } from "./interpreter";
import { validateIR } from "@/domain/screenplay";
import { resolveSet } from "@/animation/director";
import { defaultElements } from "@/animation/sets";
import { assignAll } from "./visuals";
import { DEFAULT_SUB_STYLE, buildSceneCues, toASS, toSRT, toVTT, type Cue, type SubStyle } from "./subtitles";
import { pruneClipCache, renderSceneClip, type Visual } from "./clip";
import { composeVideo, MAX_OVERLAP, sceneStarts, type ComposeMode } from "./compose";
import { mapLimit } from "./pool";
import { sceneAudio, type SceneAudio } from "./voice";
import { SOUND_VOLUME, synthSound } from "./sfx";
import { norm } from "./text";
import { renderAnimatedClip } from "@/server/animation/clip2d";
import { buildSceneStage } from "@/server/animation/stage";
import { audioEnvelope } from "@/server/animation/lipsync";

export type ProduceParams = {
  mode?: "full" | "rerender"; brief?: string; voice?: "none" | "espeak"; musicAssetId?: string; musicVolume?: number;
  sceneId?: string; shortsCount?: number; targetSec?: number;
  /** Estrategia de clip: animación 2D (personajes, cámara, escenarios) o imágenes fijas con zoom (alternativa). */
  animation?: "2d" | "still";
};
/** `clipWorkers`: clips que se animan a la vez (1 = secuencial, el modo que menos memoria usa). `compose`: montaje por tramos (por defecto) o en una sola pasada. */
export type ProduceDeps = { storage: Storage; mediaDir: string; cacheDir: string; voice?: VoiceProvider; threads: number; clipCacheMb: number; clipWorkers?: number; composeMode?: ComposeMode; segmentScenes?: number };

const now = () => new Date().toISOString();
const LEAD = 0.3, TAIL = 0.5, MIN_SCENE = 2.5;

/** Intérprete activo. Hoy solo existe el de reglas; un LLM se enchufaría aquí devolviendo la misma IR (se valida igual). */
export const activeInterpreter = () => ruleInterpreter;

/** Crea (con diseño/escenario provisional) los personajes que hablan y los lugares nuevos de una IR, y los guarda en la biblia. */
export async function ensureBible(st: Storage, p: Production, rep: { ir?: import("@/domain/screenplay").ScreenplayIR; newCharacters: string[]; newPlaces: string[] }) {
  const created = { characters: [] as string[], places: [] as string[] };
  if (rep.ir) {
    const speakers = new Set(rep.ir.scenes.flatMap((sc) => sc.lines.map((l) => l.speaker).filter(Boolean) as string[]).map((n) => norm(n)));
    for (const name of rep.newCharacters) if (speakers.has(norm(name))) {
      const nice = name === name.toUpperCase() ? name[0] + name.slice(1).toLowerCase() : name;
      await st.characters.save({ id: crypto.randomUUID(), name: nice, description: `Creado automáticamente desde el guion de «${p.title}»`, traits: [], voiceNotes: "", referenceAssetIds: [] }); created.characters.push(nice);
    }
    for (const name of rep.newPlaces) { const sp = resolveSet(name, [], rep.ir.scenes.find((sc) => sc.location === name)?.mood ?? ""); await st.places.save({ id: crypto.randomUUID(), name, description: "Creado automáticamente desde el guion", createdAt: now(), set: { preset: sp.preset, timeOfDay: sp.timeOfDay, ...defaultElements(sp.preset, sp.seed) } }); created.places.push(name); }   // el decorado se CONGELA con el lugar
  }
  return { created, characters: await st.characters.list(), places: await st.places.list() };
}

export type PlanResult = { scenes: Scene[]; hints: ReturnType<typeof parseBrief>; created: { characters: string[]; places: string[] }; warnings: string[] };

/**
 * GUION → IR validada → escenas → personajes y escenarios. Conserva las escenas bloqueadas (corregidas a mano).
 * Los personajes que hablan y los lugares que aparecen por primera vez se CREAN con diseño/escenario provisional y se
 * guardan en la biblia: en el siguiente episodio se reutilizan idénticos (continuidad).
 */
export async function planProduction(p: Production, st: Storage, brief: string, o: { autoCreate?: boolean } = {}): Promise<PlanResult> {
  let [characters, assets, places] = await Promise.all([st.characters.list(), st.assets.list(), st.places.list()]);
  const hints = parseBrief(brief);
  const raw = await activeInterpreter().interpret({ script: p.script, brief, characters, places });
  const rep = validateIR(raw, { characters: characters.map((c) => c.name), places: places.map((x) => x.name) });
  if (!rep.ir) throw new RenderError("La estructura del guion no es válida: " + rep.errors.join("; "), false);
  let created = { characters: [] as string[], places: [] as string[] };
  if (o.autoCreate !== false) { const r = await ensureBible(st, p, rep); created = r.created; characters = r.characters; places = r.places; }
  let scenes = irToScenes(rep.ir, characters);
  const locked = new Map(p.scenes.filter((s) => s.locked).map((s) => [norm(s.title), s]));
  scenes = scenes.map((s) => locked.get(norm(s.title)) ?? s).map((s, i) => ({ ...s, order: i, mood: s.mood || hints.mood || "" }));
  const { scenes: assigned, remember } = assignAll(scenes, { assets, characters, places });
  for (const [name, assetId] of remember) {
    const ex = places.find((pl) => norm(pl.name) === norm(name));
    if (ex) { if (!ex.visualAssetId) await st.places.save({ ...ex, visualAssetId: assetId }); }
    else await st.places.save({ id: crypto.randomUUID(), name, description: "Creado automáticamente al asignar su imagen", createdAt: now(), visualAssetId: assetId });
  }
  return { scenes: assigned.map((s, i) => ({ ...s, order: i })), hints, created, warnings: [...rep.ir.warnings, ...rep.warnings] };
}

export async function produce(job: RenderJob, ctx: ExecContext, d: ProduceDeps): Promise<ExecResult> {
  const prm = job.params as ProduceParams;
  const st = d.storage;
  const prod = job.productionId ? await st.productions.get(job.productionId) : undefined;
  if (!prod) throw new RenderError("La producción asociada ya no existe", false);
  if (prod.status === "PUBLISHED") throw new RenderError("Esta producción ya está publicada: no se puede regenerar", false);
  if (!resolveFont()) throw new RenderError("No hay ninguna fuente disponible (instala fonts-inter o define KAP_FONT_FILE)", false);
  const step = (k: number, f: number, label: string) => ctx.onProgress(f, `Paso ${k}/5 · ${label}`);
  const { width, height } = dimensions(job.format, job.quality);
  const vertical = height > width;
  const settings: Settings | undefined = await st.settings.get("settings");
  const style: SubStyle = { ...DEFAULT_SUB_STYLE, enabled: settings?.subtitlesEnabled ?? true, scale: settings?.subtitleScale ?? 1, position: settings?.subtitlePosition ?? "bottom" };
  const assetFile = async (id?: string) => { const a = id ? await st.assets.get(id) : undefined; if (!a) return undefined; const f = path.join(d.mediaDir, path.basename(a.path)); try { await fs.access(f); return { a, f }; } catch { return undefined; } };

  // ① Analizar y planificar
  step(1, 0.01, "Analizando el guion");
  let scenes: Scene[];
  if ((job.kind === "episode" || (job.kind === "short" && !!prod.script.trim() && !prod.parentId)) && prm.mode === "full") {
    if (!prod.script.trim()) throw new RenderError("Este episodio no tiene guion. Escríbelo o pégalo en la ficha del episodio (la redacción automática requiere un proveedor de IA que aún no está conectado).", false);
    scenes = (await planProduction(prod, st, prm.brief ?? prod.brief)).scenes;
    if (!scenes.length) throw new RenderError("No se pudo extraer ninguna escena del guion", false);
    await st.productions.save({ ...prod, scenes, brief: prm.brief ?? prod.brief, updatedAt: now() });
  } else {
    scenes = prod.scenes;
    if (job.kind === "preview") scenes = scenes.filter((s) => s.id === prm.sceneId);
    if (!scenes.length) throw new RenderError("No hay escenas planificadas: genera el episodio primero o analiza el guion", false);
  }
  step(1, 0.05, `${scenes.length} escenas planificadas`);

  // ② Narración y duraciones reales
  const audios: (SceneAudio | undefined)[] = [];
  const voice = prm.voice === "espeak" && d.voice && (await d.voice.available()) ? d.voice : undefined;
  for (const [i, s] of scenes.entries()) {
    step(2, 0.05 + 0.2 * (i / scenes.length), `Narración ${i + 1}/${scenes.length}`);
    audios.push(await sceneAudio(s, { assetPath: async (id) => (await assetFile(id))?.f, voice, cacheDir: d.cacheDir, tmpDir: path.join(ctx.tmpDir, `tts${i}`), signal: ctx.signal }));
  }
  const durs = scenes.map((s, i) => {
    const a = audios[i];
    if (a) { const need = Math.max(MIN_SCENE, a.durationSec + LEAD + TAIL); return s.durationSource === "manual" && s.durationSec > need ? s.durationSec : need; }
    return Math.max(MIN_SCENE, s.durationSec);
  });
  scenes = scenes.map((s, i) => ({ ...s, durationSec: Math.round(durs[i] * 100) / 100, durationSource: audios[i] ? "audio" : s.durationSource }));
  if (job.kind === "episode" || job.kind === "short") await st.productions.save({ ...(await st.productions.get(prod.id))!, scenes, updatedAt: now() });
  const starts = sceneStarts(durs);

  // ③ Clips por escena (caché por contenido: solo se renderiza lo que cambió)
  const styleBible = await st.style.get("style");
  const animation = prm.animation ?? (styleBible?.defaultMode === "animated2d" ? "2d" : "still");
  const [bibleChars, bibleKnownPlaces] = animation === "2d" ? await Promise.all([st.characters.list(), st.places.list()]) : [[], []];
  const prodNow = (await st.productions.get(prod.id)) ?? prod;
  const cuesAll: { cue: Cue; at: number }[] = [], soundsOf: import("@/animation/types").SoundCue[][] = scenes.map(() => []);
  const cuesOf = scenes.map((s, i) => (style.enabled ? buildSceneCues(s.lines, durs[i], { items: audios[i]?.items, maxChars: vertical ? 22 : 44, lead: LEAD, tail: TAIL, splitLong: vertical }) : []));
  cuesOf.forEach((cs, i) => cs.forEach((c) => cuesAll.push({ cue: c, at: starts[i] })));
  const workers = Math.max(1, Math.min(d.clipWorkers ?? 1, scenes.length));
  // con varios clips a la vez cada FFmpeg recibe su parte de los núcleos (no se satura la CPU ni se multiplica la memoria)
  const clipThreads = workers > 1 ? Math.max(1, Math.floor((d.threads || os.cpus().length) / workers)) : d.threads;
  const frac = new Array<number>(scenes.length).fill(0); let started = 0;
  const report = () => step(3, 0.25 + 0.55 * (frac.reduce((a, b) => a + b, 0) / scenes.length), animation === "2d" ? `Animando escena ${Math.min(started, scenes.length)}/${scenes.length} (2D)` : `Componiendo escena ${Math.min(started, scenes.length)}/${scenes.length}`);
  const clips = await mapLimit(scenes, workers, async (s, i) => {
    const D = durs[i]; started++; report();
    const vis = await assetFile(s.visualAssetId);
    const visual: Visual | undefined = vis && (vis.a.kind === "image" || vis.a.kind === "video") ? { path: vis.f, kind: vis.a.kind, sig: `${vis.a.id}:${vis.a.size}:${vis.a.createdAt}` } : undefined;
    const cues = cuesOf[i];
    const onP = (f: number) => { frac[i] = f; report(); };
    const assText = cues.length ? toASS(cues, { width, height, style }) : undefined;
    let r: { file: string; cached: boolean };
    if (animation === "2d") {
      const env = audios[i] ? await audioEnvelope(audios[i]!.file, 30, ctx.signal).catch(() => undefined) : undefined;
      const built = await buildSceneStage(s, { durationSec: D, tail: MAX_OVERLAP, width, height, envelope: env, index: i, subtitles: style, items: audios[i]?.items }, {
        production: prodNow, characters: bibleChars, places: bibleKnownPlaces, style: styleBible,
        assetInfo: async (id) => { const f = await assetFile(id); return f ? { path: f.f, sig: `${f.a.id}:${f.a.size}:${f.a.createdAt}`, kind: f.a.kind } : undefined; },
      });
      soundsOf[i] = built.stage.sounds ?? [];   // sonido con función: lo propone el director a partir de la narración
      r = await renderAnimatedClip({ stage: built.stage, width, height, durationSec: D + MAX_OVERLAP, images: built.images, assText, fontsDir: path.dirname(resolveFont()!), threads: clipThreads },
        { cacheDir: d.cacheDir, tmpDir: path.join(ctx.tmpDir, `clip${i}`), signal: ctx.signal, onProgress: onP });
    } else {
      r = await renderSceneClip(
      { scene: s, visual, width, height, durationSec: D + MAX_OVERLAP, sceneNumber: i + 1, threads: clipThreads, fontsDir: path.dirname(resolveFont()!),
        assText },
      { cacheDir: d.cacheDir, tmpDir: path.join(ctx.tmpDir, `clip${i}`), signal: ctx.signal, onProgress: onP });
    }
    frac[i] = 1; report();
    await fs.rm(path.join(ctx.tmpDir, `clip${i}`), { recursive: true, force: true });   // libera disco en cuanto el clip está en caché
    return { file: r.file, dur: D, transition: s.transition };
  });

  // ④ Montaje: transiciones + narración + efectos + música con ducking
  const narration = audios.flatMap((a, i) => (a ? [{ file: a.file, start: starts[i] + LEAD }] : []));
  const sfx: { file: string; start: number; volume: number }[] = [];
  for (const [i, s] of scenes.entries()) { const f = await assetFile(s.sfxAssetId); if (f) sfx.push({ file: f.f, start: starts[i], volume: 0.8 }); }
  for (const [i, list] of soundsOf.entries()) for (const x of list.slice(0, 12)) {   // una escena sin diálogo sigue teniendo vida: ambiente, pasos, puertas, golpes, llamadas
    const left = durs[i] - x.t, dur = x.kind === "steps" || x.kind === "ambience" ? Math.min(x.dur ?? 2, left - 0.1) : undefined; if (left < 0.3 || (dur !== undefined && dur < 0.5)) continue;
    try { sfx.push({ file: await synthSound(x.kind, dur, { cacheDir: d.cacheDir, signal: ctx.signal }), start: starts[i] + x.t, volume: SOUND_VOLUME(x.kind) }); } catch (e) { if (ctx.signal?.aborted) throw e; /* un sonido que no se pueda sintetizar no rompe el render */ }
  }
  const mus = await assetFile(prm.musicAssetId ?? prod.musicAssetId);
  const out = path.join(ctx.tmpDir, "episode.mp4");
  step(4, 0.8, "Montando vídeo, transiciones y audio");
  const comp = await composeVideo({
    clips, narration, sfx, music: mus ? { file: mus.f, volume: prm.musicVolume ?? 0.22 } : undefined,
    tmpDir: path.join(ctx.tmpDir, "compose"), out, threads: d.threads, mode: d.composeMode, segmentScenes: d.segmentScenes, cacheDir: d.cacheDir, signal: ctx.signal, onProgress: (f) => step(4, 0.8 + 0.17 * f, "Montando vídeo, transiciones y audio"),
  });

  // ⑤ Verificación + subtítulos sueltos (.srt/.vtt) para subir a YouTube
  step(5, 0.97, "Verificando la salida");
  const probe = await validateOutput(out, { width, height, durationSec: comp.totalSec });
  if ((job.kind === "episode" || job.kind === "short") && style.enabled && cuesAll.length) {
    const global = cuesAll.map(({ cue, at }) => ({ ...cue, start: cue.start + at, end: cue.end + at }));
    const cur = await st.productions.get(prod.id);
    for (const old of await st.assets.list()) if (old.origin === "generated" && old.role === "other" && old.name.startsWith(`subs-${prod.id}`)) { await fs.rm(path.join(d.mediaDir, path.basename(old.path)), { force: true }); await st.assets.remove(old.id); }
    await fs.mkdir(/*turbopackIgnore: true*/ d.mediaDir, { recursive: true, mode: 0o700 });   // en una instalación limpia aún no existe
    const ids: string[] = [];
    for (const [ext, body, mime] of [["srt", toSRT(global), "text/plain"], ["vtt", toVTT(global), "text/vtt"]] as const) {
      const id = crypto.randomUUID(); await fs.writeFile(path.join(/*turbopackIgnore: true*/ d.mediaDir, `${id}.${ext}`), body, { mode: 0o600 });
      await st.assets.save({ id, kind: "subtitle", path: `${id}.${ext}`, origin: "generated", license: "propio", createdAt: now(), name: `subs-${prod.id}.${ext}`, mime, size: Buffer.byteLength(body), role: "other" }); ids.push(id);
    }
    if (cur) await st.productions.save({ ...cur, assetIds: [...new Set([...cur.assetIds.filter((a) => !ids.includes(a)), ...ids])], updatedAt: now() });
  }
  await pruneClipCache(d.cacheDir, d.clipCacheMb);
  await pruneClipCache(d.cacheDir, Math.max(50, Math.round(d.clipCacheMb / 4)), "segments");   // tramos de montaje: caché más pequeña
  return { file: out, durationSec: probe.durationSec, width: probe.width, height: probe.height, sizeBytes: probe.sizeBytes };
}
