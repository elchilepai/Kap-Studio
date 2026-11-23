/**
 * ETAPAS 1-2 V2 (IDEA y HOOKS), recuperables, con la dirección «idea nacida de una acción para 8-14 ilustraciones». La etapa «idea» pide las candidatas en lotes de 2 (guardando cada lote en disco),
 * evalúa TODAS juntas (puertas de calidad, duplicados entre lotes, puntuación propia) y selecciona las k mejores NO descartadas. La etapa «hooks» pide 5 hooks por idea seleccionada y deja los mejores.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { LlmClient } from "@/ports/studio";
import { evaluateIdeas, rankHooks, selectIdeasV2, type CategoryV2, type EvalIdea, type HookV2, type IdeaV2 } from "@/narrative/ideasV2";
import { generateHooksV2, generateIdeaBatchV2 } from "@/server/ai/ideasV2";
import type { StageFn } from "./stages";

/** 13 categorías candidatas en lotes de 2 (llamadas cortas en CPU); se seleccionan las 10 mejores. */
export const BATCHES_V2: (readonly CategoryV2[])[] = [["limites-decir-no", "aprobacion"], ["disciplina", "responsabilidad"], ["comparacion", "rechazo"], ["independencia-emocional", "proposito"], ["decisiones", "caracter"], ["habitos", "autoestima"], ["relaciones"]];
const partFile = (dir: string, name: string) => path.join(dir, "stages", "parts", `${name}.json`);
const readPart = async <T>(dir: string, name: string): Promise<T | undefined> => { try { return JSON.parse(await fs.readFile(partFile(dir, name), "utf8")) as T; } catch { return undefined; } };
const writePart = async (dir: string, name: string, data: unknown) => { const f = partFile(dir, name); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f + ".tmp", JSON.stringify(data, null, 1)); await fs.rename(f + ".tmp", f); };
export type Log = (msg: string) => void;
export type IdeaStageOutV2 = { ideas: EvalIdea[]; selected: string[]; stats: { batches: number; resumedBatches: number; calls: number; dropped: number; regenerated: number; ms: number } };

export function ideaStageV2(llm: LlmClient, dir: string, o: { log?: Log; k?: number; batches?: (readonly CategoryV2[])[] } = {}): StageFn {
  const batches = o.batches ?? BATCHES_V2, log = o.log ?? (() => {});
  return async ({ signal }) => {
    const t0 = Date.now(), ideas: IdeaV2[] = []; let calls = 0, dropped = 0, resumed = 0, regen = 0;
    for (const [n, cats] of batches.entries()) {
      const saved = await readPart<{ ideas: IdeaV2[] }>(dir, `idea-batch-${n + 1}`);
      if (saved) { ideas.push(...saved.ideas); resumed++; log(`lote ${n + 1}/${batches.length}: recuperado de disco (${saved.ideas.length} ideas)`); continue; }
      log(`lote ${n + 1}/${batches.length}: pidiendo ${cats.join(" + ")} a Qwen…`); const b = Date.now();
      const r = await generateIdeaBatchV2(llm, { categories: cats, prior: ideas, signal }); calls += r.calls; dropped += r.dropped; regen += r.regenerated.length;
      await writePart(dir, `idea-batch-${n + 1}`, { ideas: r.ideas, calls: r.calls, dropped: r.dropped, regenerated: r.regenerated, ms: Date.now() - b }); ideas.push(...r.ideas);
      log(`lote ${n + 1}/${batches.length}: ${r.ideas.length} ideas en ${((Date.now() - b) / 60000).toFixed(1)} min${r.regenerated.length ? ` · regeneradas ${r.regenerated.length} (${r.regenerated.map((x) => `${x.category}${x.improved ? "✓" : "✗"}`).join(",")})` : ""}`);
    }
    const ev = evaluateIdeas(ideas);
    return { ideas: ev, selected: selectIdeasV2(ev, o.k ?? 10), stats: { batches: batches.length, resumedBatches: resumed, calls, dropped, regenerated: regen, ms: Date.now() - t0 } } satisfies IdeaStageOutV2;
  };
}

export type HooksStageOutV2 = { byIdea: Record<string, { titulo: string; hooks: HookV2[]; best: HookV2[]; issues: string[]; repaired: boolean }>; stats: { ideas: number; resumed: number; calls: number; ms: number } };
export function hooksStageV2(llm: LlmClient, dir: string, o: { log?: Log } = {}): StageFn {
  const log = o.log ?? (() => {});
  return async ({ load, signal }) => {
    const t0 = Date.now(), { ideas, selected } = await load<IdeaStageOutV2>("idea"), byIdea: HooksStageOutV2["byIdea"] = {}; let calls = 0, resumed = 0;
    for (const id of selected) {
      const idea = ideas.find((i) => i.id === id)!, saved = await readPart<HooksStageOutV2["byIdea"][string]>(dir, `hooks-${id}`);
      if (saved) { byIdea[id] = saved; resumed++; log(`hooks ${id}: recuperados de disco`); continue; }
      log(`hooks ${id} «${idea.titulo}»: pidiendo 5 hooks…`); const b = Date.now(), r = await generateHooksV2(llm, idea, { signal }); calls += r.calls;
      byIdea[id] = { titulo: idea.titulo, hooks: r.hooks, best: rankHooks(r.hooks, idea).slice(0, 2).map((x) => x.hook), issues: r.issues, repaired: r.repaired }; await writePart(dir, `hooks-${id}`, byIdea[id]);
      log(`hooks ${id}: ${r.hooks.length} hooks en ${((Date.now() - b) / 60000).toFixed(1)} min${r.issues.length ? ` · avisos: ${r.issues.length}` : ""}`);
    }
    return { byIdea, stats: { ideas: selected.length, resumed, calls, ms: Date.now() - t0 } } satisfies HooksStageOutV2;
  };
}
