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

  // ---- audio ----
  let idx = n; const fmt = "aformat=sample_rates=48000:channel_layouts=stereo";
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
  return { graph: g.join(";\n"), total, nInputs: idx };
}

export async function composeVideo(inp: ComposeInput): Promise<{ file: string; totalSec: number }> {
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
