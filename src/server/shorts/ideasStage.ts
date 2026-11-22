/**
 * ETAPAS 1-2 (IDEA y HOOKS) del Short, recuperables. La etapa «idea» genera las ideas por LOTES y guarda cada lote en disco en cuanto termina: si el proceso se interrumpe a mitad,
 * al repetirlo solo se piden los lotes que faltan. Después puntúa, selecciona (sin ideas mediocres) y deja el resultado como salida de la etapa. La etapa «hooks» pide 5 hooks por
 * cada idea seleccionada y también guarda cada idea en cuanto termina.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { LlmClient } from "@/ports/studio";
import { CATEGORIES, scoreIdeas, selectIdeas, type Hook, type Idea, type ScoredIdea } from "@/narrative/ideas";
import { generateHooks, generateIdeaBatch } from "@/server/ai/ideas";
import type { StageFn } from "./stages";

/** 15 categorías repartidas en 3 lotes de 5 (cada llamada es corta: en CPU, ≈ 1,5 tok/s). */
export const BATCHES: (readonly string[])[] = [CATEGORIES.slice(0, 5), CATEGORIES.slice(5, 10), CATEGORIES.slice(10, 15)];
const partFile = (dir: string, name: string) => path.join(dir, "stages", "parts", `${name}.json`);
const readPart = async <T>(dir: string, name: string): Promise<T | undefined> => { try { return JSON.parse(await fs.readFile(partFile(dir, name), "utf8")) as T; } catch { return undefined; } };
const writePart = async (dir: string, name: string, data: unknown) => { const f = partFile(dir, name); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f + ".tmp", JSON.stringify(data, null, 1)); await fs.rename(f + ".tmp", f); };   // escritura atómica: un corte nunca deja un lote a medias
export type Log = (msg: string) => void;
export type IdeaStageOut = { ideas: ScoredIdea[]; selected: string[]; stats: { batches: number; resumedBatches: number; calls: number; dropped: number; ms: number } };

export function ideaStage(llm: LlmClient, dir: string, o: { log?: Log; select?: { k?: number; min?: number }; batches?: (readonly string[])[] } = {}): StageFn {
  const batches = o.batches ?? BATCHES, log = o.log ?? (() => {});
  return async ({ signal }) => {
    const t0 = Date.now(); const ideas: Idea[] = []; let calls = 0, dropped = 0, resumed = 0;
    for (const [n, cats] of batches.entries()) {
      const saved = await readPart<{ ideas: Idea[] }>(dir, `idea-batch-${n + 1}`);
      if (saved) { ideas.push(...saved.ideas); resumed++; log(`lote ${n + 1}/${batches.length}: recuperado de disco (${saved.ideas.length} ideas)`); continue; }
      log(`lote ${n + 1}/${batches.length}: pidiendo ${cats.length} ideas a Qwen…`); const b = Date.now();
      const r = await generateIdeaBatch(llm, { categories: cats, avoid: ideas.map((i) => i.titulo), signal }); calls += r.calls; dropped += r.dropped;
      await writePart(dir, `idea-batch-${n + 1}`, { ideas: r.ideas, calls: r.calls, dropped: r.dropped, ms: Date.now() - b }); ideas.push(...r.ideas); log(`lote ${n + 1}/${batches.length}: ${r.ideas.length} ideas en ${((Date.now() - b) / 60000).toFixed(1)} min`);
    }
    const scored = scoreIdeas(ideas), out: IdeaStageOut = { ideas: scored, selected: selectIdeas(scored, o.select), stats: { batches: batches.length, resumedBatches: resumed, calls, dropped, ms: Date.now() - t0 } };
    return out;
  };
}

export type HooksStageOut = { byIdea: Record<string, { titulo: string; hooks: Hook[]; issues: string[]; repaired: boolean }>; stats: { ideas: number; resumed: number; calls: number; ms: number } };
export function hooksStage(llm: LlmClient, dir: string, o: { log?: Log } = {}): StageFn {
  const log = o.log ?? (() => {});
  return async ({ load, signal }) => {
    const t0 = Date.now(), { ideas, selected } = await load<IdeaStageOut>("idea"), byIdea: HooksStageOut["byIdea"] = {}; let calls = 0, resumed = 0;
    for (const id of selected) {
      const idea = ideas.find((i) => i.id === id)!, saved = await readPart<HooksStageOut["byIdea"][string]>(dir, `hooks-${id}`);
      if (saved) { byIdea[id] = saved; resumed++; log(`hooks ${id}: recuperados de disco`); continue; }
      log(`hooks ${id} «${idea.titulo}»: pidiendo 5 hooks…`); const b = Date.now(); const r = await generateHooks(llm, idea, { signal }); calls += r.calls;
      byIdea[id] = { titulo: idea.titulo, hooks: r.hooks, issues: r.issues, repaired: r.repaired }; await writePart(dir, `hooks-${id}`, byIdea[id]); log(`hooks ${id}: ${r.hooks.length} hooks en ${((Date.now() - b) / 60000).toFixed(1)} min${r.issues.length ? ` · avisos: ${r.issues.length}` : ""}`);
    }
    return { byIdea, stats: { ideas: selected.length, resumed, calls, ms: Date.now() - t0 } } satisfies HooksStageOut;
  };
}
