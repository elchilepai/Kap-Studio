import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Transition } from "@/domain/types";
import { encodeArgs, FPS } from "@/server/render/presets";
import { runFfmpeg } from "@/server/render/ffmpeg";

/** Cola fija de cada clip: así su caché no depende de las escenas vecinas (xfade descarta el sobrante). */
export const MAX_OVERLAP = 0.7;
export type ComposeClip = { file: string; dur: number; transition: Transition };
export type ComposeInput = {
  clips: ComposeClip[];                                  // clip i dura dur_i + overlap_i; las duraciones lógicas son dur_i
  narration: { file: string; start: number }[]; sfx: { file: string; start: number; volume?: number }[];
  music?: { file: string; volume: number };
  tmpDir: string; out: string; threads?: number; signal?: AbortSignal; onProgress?: (f: number) => void;
};

/** Solapamiento (s) entre la escena i y la i+1: "cut" ≈ 1 fotograma; el resto, hasta 0,7 s sin comerse las escenas. */
export function overlapBetween(a: { dur: number }, b: { dur: number; transition: Transition }): number {
  if (b.transition === "cut") return 1 / FPS;
  return Math.max(1 / FPS, Math.min(MAX_OVERLAP, a.dur * 0.4, b.dur * 0.4));
}

/** Instantes de inicio de cada escena en la línea de tiempo final. */
export function sceneStarts(durs: number[]): number[] { let t = 0; return durs.map((d) => { const s = t; t += d; return s; }); }

/** Parte de audio del grafo (pura): narración, efectos y música con «ducking» → normalizado a `[a]`. `first` = índice de la 1.ª entrada de audio. */
export function buildAudioGraph(inp: Pick<ComposeInput, "narration" | "sfx" | "music">, total: number, first: number): { lines: string[]; nInputs: number } {
  const g: string[] = []; const f = (x: number) => x.toFixed(3);
  let idx = first;
  const fmt = "aformat=sample_rates=48000:channel_layouts=stereo";
  const bus = (items: { file: string; start: number; volume?: number }[], name: string) => {
    items.forEach((it, i) => g.push(`[${idx + i}:a]${fmt},adelay=${Math.round(it.start * 1000)}|${Math.round(it.start * 1000)},volume=${it.volume ?? 1}[${name}${i}]`));
    const labels = items.map((_, i) => `[${name}${i}]`).join("");
    g.push(items.length === 1 ? `${labels}anull[${name}]` : `${labels}amix=inputs=${items.length}:normalize=0:duration=longest[${name}]`);
    idx += items.length;
  };
  if (inp.narration.length) bus(inp.narration, "nar");
  if (inp.sfx.length) bus(inp.sfx, "sfx");
  const mix: string[] = [];
  if (inp.music) {
    const base = inp.narration.length ? inp.music.volume : Math.min(1, inp.music.volume * 2.2);   // sin voz, la música es la protagonista
    g.push(`[${idx}:a]${fmt},atrim=0:${f(total)},asetpts=N/SR/TB,afade=t=in:d=1.5,afade=t=out:st=${f(Math.max(0, total - 2))}:d=2,volume=${base.toFixed(3)}[mus]`);
    idx++;
    if (inp.narration.length) {
      g.push("[nar]asplit=2[nar1][nar2]", "[mus][nar1]sidechaincompress=threshold=0.015:ratio=12:attack=15:release=400:makeup=1[duck]");
      mix.push("[duck]", "[nar2]");
    } else mix.push("[mus]");
  } else if (inp.narration.length) mix.push("[nar]");
  if (inp.sfx.length) mix.push("[sfx]");
  if (mix.length) g.push(`${mix.join("")}${mix.length > 1 ? `amix=inputs=${mix.length}:normalize=0,` : ""}alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${f(total)},atrim=0:${f(total)}[a]`);
  else { g.push(`[${idx}:a]atrim=0:${f(total)}[a]`); idx++; }
  return { lines: g, nInputs: idx };
}

/**
 * Plan del filtro (puro, testable): cadena de `xfade` entre clips + banda sonora (narración, efectos, música con
 * «ducking» bajo la voz) normalizada. Devuelve el grafo completo y el nº de entradas por tipo.
 */
export function buildFilterGraph(inp: Pick<ComposeInput, "clips" | "narration" | "sfx" | "music">): { graph: string; total: number; nInputs: number } {
  const n = inp.clips.length; const durs = inp.clips.map((c) => c.dur); const S = sceneStarts(durs);
  const total = durs.reduce((a, b) => a + b, 0); const f = (x: number) => x.toFixed(3);
  const g: string[] = [];

  // ---- vídeo ----
  if (n === 1) g.push("[0:v]null[vx]");
  else for (let i = 1; i < n; i++) {
    const x = overlapBetween(inp.clips[i - 1], inp.clips[i]);
    const t = inp.clips[i].transition === "cut" ? "fade" : inp.clips[i].transition;
    g.push(`[${i === 1 ? "0:v" : `v${i - 1}`}][${i}:v]xfade=transition=${t}:duration=${f(x)}:offset=${f(S[i])}[${i === n - 1 ? "vx" : `v${i}`}]`);
  }
  g.push(`[vx]fade=t=in:st=0:d=0.4,fade=t=out:st=${f(Math.max(0, total - 0.8))}:d=0.8,format=yuv420p[v]`);

  const au = buildAudioGraph(inp, total, n);
  g.push(...au.lines);
  const idx = au.nInputs;
  return { graph: g.join(";\n"), total, nInputs: idx };
}

/** Montaje en UNA sola pasada de FFmpeg (todas las escenas como entradas). Se conserva como modo `unico`. */
export async function composeSinglePass(inp: ComposeInput): Promise<{ file: string; totalSec: number }> {
  const { graph, total } = buildFilterGraph(inp);
  await fs.mkdir(inp.tmpDir, { recursive: true, mode: 0o700 });
  const script = path.join(inp.tmpDir, "graph.txt"); await fs.writeFile(script, graph, { mode: 0o600 });
  const args: string[] = [];
  for (const c of inp.clips) args.push("-i", c.file);
  for (const a of inp.narration) args.push("-i", a.file);
  for (const a of inp.sfx) args.push("-i", a.file);
  if (inp.music) args.push("-stream_loop", "-1", "-i", inp.music.file);
  if (!inp.narration.length && !inp.sfx.length && !inp.music) args.push("-f", "lavfi", "-t", total.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
  await runFfmpeg([...args, "-filter_complex_script", script, "-map", "[v]", "-map", "[a]", "-t", total.toFixed(3), ...encodeArgs({ threads: inp.threads, crf: 20, preset: "veryfast" }), inp.out],
    { signal: inp.signal, expectedSec: total, onProgress: (p) => inp.onProgress?.(p.fraction) });
  return { file: inp.out, totalSec: total };
}

// =====================================================================================================================
// Montaje POR TRAMOS (por defecto): en vez de un único `xfade` con todas las escenas como entradas, el vídeo se monta
// en tramos de pocas escenas (cada uno es un FFmpeg independiente que termina y libera su memoria), se cachean por
// contenido y se unen sin recodificar (`-c copy`). El audio se mezcla en su propia pasada y se une al final.
// Equivale a la pasada única: mismas transiciones, mismos solapes, mismos fundidos y la misma banda sonora.
// =====================================================================================================================
export const SEGMENT_VERSION = 1;
export type Segment = {
  /** Escenas «propias» del tramo (a..b-1); la escena b (la 1.ª del siguiente tramo) entra solo para la transición. */
  a: number; b: number;
  /** Clips que se leen: a..last (last = b si hay tramo siguiente). */
  last: number;
  /** Fotogramas globales [startFrame, endFrame) que aporta el tramo. */
  startFrame: number; endFrame: number;
  /** Recorte (s) del primer clip: el tramo anterior ya mostró hasta aquí (solapamiento con la transición de entrada). */
  trim: number;
  /** Desfase de cada unión (xfade) respecto al inicio local del tramo. */
  offsets: number[];
};

/** Plan de tramos (puro y testable). `per` = escenas por tramo (≥1). Las fronteras se alinean a fotogramas enteros. */
export function planSegments(clips: Pick<ComposeClip, "dur" | "transition">[], per: number): { segments: Segment[]; totalFrames: number; total: number } {
  const n = clips.length, S = sceneStarts(clips.map((c) => c.dur)), total = clips.reduce((x, c) => x + c.dur, 0);
  const totalFrames = Math.max(1, Math.ceil(total * FPS - 1e-6));
  const step = Math.max(1, Math.floor(per)), firsts: number[] = [];
  for (let i = 0; i < n; i += step) firsts.push(i);
  const boundary = (i: number) => (i >= n ? totalFrames : Math.ceil((S[i] + overlapBetween(clips[i - 1], clips[i])) * FPS - 1e-6));
  const segments: Segment[] = firsts.map((a, g) => {
    const b = g + 1 < firsts.length ? firsts[g + 1] : n;
    const startFrame = g === 0 ? 0 : boundary(a), endFrame = boundary(b), last = Math.min(b, n - 1);
    const T0 = startFrame / FPS;
    return { a, b, last, startFrame, endFrame, trim: g === 0 ? 0 : T0 - S[a], offsets: Array.from({ length: last - a }, (_, k) => S[a + k + 1] - T0) };
  });
  return { segments, totalFrames, total };
}

/** Grafo de vídeo de UN tramo (puro). Entradas 0..(last-a) = clips a..last. */
export function buildSegmentGraph(clips: ComposeClip[], seg: Segment, total: number): string {
  const f = (x: number) => x.toFixed(3), g: string[] = [], T0 = seg.startFrame / FPS, n = seg.last - seg.a + 1;
  const first = seg.trim > 0 ? (g.push(`[0:v]trim=start=${f(seg.trim)},setpts=PTS-STARTPTS[s0]`), "s0") : "0:v";
  if (n === 1) g.push(`[${first}]null[vx]`);
  else for (let k = 1; k < n; k++) {
    const i = seg.a + k, x = overlapBetween(clips[i - 1], clips[i]), t = clips[i].transition === "cut" ? "fade" : clips[i].transition;
    g.push(`[${k === 1 ? first : `v${k - 1}`}][${k}:v]xfade=transition=${t}:duration=${f(x)}:offset=${f(seg.offsets[k - 1])}[${k === n - 1 ? "vx" : `v${k}`}]`);
  }
  const fades: string[] = [];
  if (seg.startFrame === 0) fades.push("fade=t=in:st=0:d=0.4");
  if (seg.b >= clips.length) fades.push(`fade=t=out:st=${f(Math.max(0, total - 0.8) - T0)}:d=0.8`);
  g.push(`[vx]${[...fades, "format=yuv420p"].join(",")}[v]`);
  return g.join(";\n");
}

const sha = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 32);

export async function composeSegmented(inp: ComposeInput & { segmentScenes?: number; cacheDir?: string }): Promise<{ file: string; totalSec: number; segments: number; reused: number }> {
  const { segments, totalFrames, total } = planSegments(inp.clips, inp.segmentScenes ?? 4);
  await fs.mkdir(inp.tmpDir, { recursive: true, mode: 0o700 });
  const segDir = inp.cacheDir ? path.join(inp.cacheDir, "segments") : path.join(inp.tmpDir, "segments");
  await fs.mkdir(segDir, { recursive: true, mode: 0o700 });
  const units = segments.length + 1;                              // + la pasada de audio
  let doneUnits = 0; const tick = (frac = 0) => inp.onProgress?.(Math.min(0.999, (doneUnits + frac) / units));
  const enc = encodeArgs({ threads: inp.threads, crf: 20, preset: "veryfast" });
  const noAudio = enc.filter((_, i, a) => !(a[i - 1] === "-c:a" || a[i] === "-c:a" || a[i] === "-b:a" || a[i - 1] === "-b:a" || a[i] === "-ar" || a[i - 1] === "-ar" || a[i] === "-ac" || a[i - 1] === "-ac"));

  const files: string[] = []; let reused = 0;
  for (const [si, seg] of segments.entries()) {
    const used = inp.clips.slice(seg.a, seg.last + 1);
    const graph = buildSegmentGraph(inp.clips, seg, total);
    const key = sha([SEGMENT_VERSION, graph, used.map((c) => path.basename(c.file)), seg.endFrame - seg.startFrame, noAudio.join(" ")]);
    const cached = path.join(segDir, `${key}.mp4`);
    try { const st = await fs.stat(cached); if (st.size > 1000) { await fs.utimes(cached, new Date(), new Date()); files.push(cached); reused++; doneUnits++; tick(); continue; } } catch { /* a montar */ }
    const script = path.join(inp.tmpDir, `seg${si}.txt`); await fs.writeFile(script, graph, { mode: 0o600 });
    const out = path.join(inp.tmpDir, `seg${si}.mp4`), args: string[] = [];
    used.forEach((c, k) => {
      if (k === used.length - 1 && seg.last === seg.b && seg.b < inp.clips.length && used.length > 1) args.push("-t", (overlapBetween(inp.clips[seg.b - 1], inp.clips[seg.b]) + 0.5).toFixed(3));   // de la escena siguiente solo se lee la transición
      args.push("-i", c.file);
    });
    await runFfmpeg([...args, "-filter_complex_script", script, "-map", "[v]", "-frames:v", String(seg.endFrame - seg.startFrame), ...noAudio, out],
      { signal: inp.signal, expectedSec: (seg.endFrame - seg.startFrame) / FPS, onProgress: (p) => tick(p.fraction) });
    await fs.rename(out, cached).catch(async () => { await fs.copyFile(out, cached); await fs.rm(out, { force: true }); });
    files.push(cached); doneUnits++; tick();
  }

  // audio: su propia pasada (sin vídeo), mismo grafo que en la pasada única
  const audioFile = path.join(inp.tmpDir, "audio.m4a"), aArgs: string[] = [];
  for (const a of inp.narration) aArgs.push("-i", a.file);
  for (const a of inp.sfx) aArgs.push("-i", a.file);
  if (inp.music) aArgs.push("-stream_loop", "-1", "-i", inp.music.file);
  const au = buildAudioGraph(inp, total, 0);
  if (!inp.narration.length && !inp.sfx.length && !inp.music) aArgs.push("-f", "lavfi", "-t", total.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
  const aScript = path.join(inp.tmpDir, "audio-graph.txt"); await fs.writeFile(aScript, au.lines.join(";\n"), { mode: 0o600 });
  await runFfmpeg([...aArgs, "-filter_complex_script", aScript, "-map", "[a]", "-t", total.toFixed(3), "-vn", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", audioFile],
    { signal: inp.signal, expectedSec: total, onProgress: (p) => tick(p.fraction) });
  doneUnits++;

  // unión sin recodificar: tramos de vídeo + audio
  const list = path.join(inp.tmpDir, "segments.txt");
  await fs.writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n", { mode: 0o600 });
  await runFfmpeg(["-f", "concat", "-safe", "0", "-i", list, "-i", audioFile, "-map", "0:v", "-map", "1:a", "-c", "copy", "-frames:v", String(totalFrames), "-movflags", "+faststart", inp.out],
    { signal: inp.signal, expectedSec: total });
  inp.onProgress?.(1);
  return { file: inp.out, totalSec: total, segments: segments.length, reused };
}

export type ComposeMode = "segmentos" | "unico";
export async function composeVideo(inp: ComposeInput & { mode?: ComposeMode; segmentScenes?: number; cacheDir?: string }): Promise<{ file: string; totalSec: number }> {
  return (inp.mode ?? "segmentos") === "unico" || inp.clips.length < 2 ? composeSinglePass(inp) : composeSegmented(inp);
}
