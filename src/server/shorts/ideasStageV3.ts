/**
 * ETAPAS 1-2 V3 (IDEA y HOOKS), recuperables. Idea: UNA llamada por candidata (sin regenerar: mide si Qwen entiende la dirección) → bloqueos de código → crítico de coherencia (solo a las que pasan el código)
 * → duplicados entre todas → puntuación (solo supervivientes) → selección. Cada candidata se guarda en disco al terminar. Hooks: 5 candidatos por idea seleccionada → 3 finales.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { LlmClient } from "@/ports/studio";
import { CATEGORIES_V3, blocks, criticBlocks, duplicateV3, pickHooks, scoreV3, type Block, type CategoryV3, type Critic, type HookV3, type IdeaV3 } from "@/narrative/ideasV3";
import { criticV3, generateHooksV3, generateIdeaV3 } from "@/server/ai/ideasV3";
import type { StageFn } from "./stages";

const partFile = (dir: string, name: string) => path.join(dir, "stages", "parts", `${name}.json`);
const readPart = async <T>(dir: string, name: string): Promise<T | undefined> => { try { return JSON.parse(await fs.readFile(partFile(dir, name), "utf8")) as T; } catch { return undefined; } };
const writePart = async (dir: string, name: string, data: unknown) => { const f = partFile(dir, name); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f + ".tmp", JSON.stringify(data, null, 1)); await fs.rename(f + ".tmp", f); };
export type Log = (msg: string) => void;
export type CandidateV3 = { id: string; idea: IdeaV3; blocks: Block[]; critic?: Critic; duplicateOf?: string; duplicateWhy?: string; rejected: boolean; subs?: Record<string, number>; score?: number };
export type IdeaStageOutV3 = { candidates: CandidateV3[]; selected: string[]; stats: { calls: number; criticCalls: number; resumed: number; ms: number } };

export function ideaStageV3(llm: LlmClient, dir: string, o: { log?: Log; categories?: readonly CategoryV3[]; k?: number } = {}): StageFn {
  const cats = o.categories ?? CATEGORIES_V3, log = o.log ?? (() => {});
  return async ({ signal }) => {
    const t0 = Date.now(), raw: { idea: IdeaV3; critic?: Critic; blocks: Block[] }[] = []; let calls = 0, criticCalls = 0, resumed = 0;
    for (const [n, category] of cats.entries()) {
      const saved = await readPart<{ idea: IdeaV3; critic?: Critic; blocks: Block[] }>(dir, `idea-${n + 1}`);
      if (saved) { raw.push(saved); resumed++; log(`idea ${n + 1}/${cats.length} (${category}): recuperada de disco`); continue; }
      log(`idea ${n + 1}/${cats.length} (${category}): pidiendo a Qwen…`); const b = Date.now(), g = await generateIdeaV3(llm, { category, avoid: raw.map((r) => r.idea.titulo), signal }); calls += g.calls;
      const code = blocks(g.idea); let critic: Critic | undefined, all = code;
      if (!code.length) { log(`idea ${n + 1}: «${g.idea.titulo}» pasa los bloqueos de código; pidiendo veredicto al crítico…`); const c = await criticV3(llm, g.idea, { signal }); criticCalls += c.calls; critic = c.critic; all = criticBlocks(c.critic); }
      const rec = { idea: g.idea, ...(critic ? { critic } : {}), blocks: all }; await writePart(dir, `idea-${n + 1}`, rec); raw.push(rec);
      log(`idea ${n + 1}/${cats.length}: «${g.idea.titulo}» ${all.length ? `DESCARTADA (${all.map((x) => x.id).join(", ")})` : "supera todos los bloqueos"} · ${((Date.now() - b) / 60000).toFixed(1)} min`);
    }
    const cs: CandidateV3[] = raw.map((r, n) => ({ id: `idea-${String(n + 1).padStart(2, "0")}`, idea: r.idea, blocks: r.blocks, ...(r.critic ? { critic: r.critic } : {}), rejected: r.blocks.length > 0 }));
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) { const w = duplicateV3(cs[a].idea, cs[b].idea); if (w && !cs[b].duplicateOf) { cs[b].duplicateOf = cs[a].id; cs[b].duplicateWhy = w; cs[b].rejected = true; } }
    for (const c of cs) if (!c.rejected) { const r = scoreV3(c.idea, cs.filter((x) => x !== c).map((x) => x.idea), c.critic); c.subs = r.subs; c.score = r.score; }
    const selected = cs.filter((c) => !c.rejected).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, o.k ?? 5).map((c) => c.id);
    return { candidates: cs, selected, stats: { calls, criticCalls, resumed, ms: Date.now() - t0 } } satisfies IdeaStageOutV3;
  };
}

export type HooksStageOutV3 = { byIdea: Record<string, { titulo: string; candidates: HookV3[]; final: HookV3[]; issues: string[]; repaired: boolean }>; stats: { ideas: number; resumed: number; calls: number; ms: number } };
export function hooksStageV3(llm: LlmClient, dir: string, o: { log?: Log } = {}): StageFn {
  const log = o.log ?? (() => {});
  return async ({ load, signal }) => {
    const t0 = Date.now(), { candidates, selected } = await load<IdeaStageOutV3>("idea"), byIdea: HooksStageOutV3["byIdea"] = {}; let calls = 0, resumed = 0;
    for (const id of selected) {
      const c = candidates.find((x) => x.id === id)!, saved = await readPart<HooksStageOutV3["byIdea"][string]>(dir, `hooks-${id}`);
      if (saved) { byIdea[id] = saved; resumed++; log(`hooks ${id}: recuperados de disco`); continue; }
      log(`hooks ${id} «${c.idea.titulo}»: pidiendo 5 hooks…`); const b = Date.now(), r = await generateHooksV3(llm, c.idea, { signal }); calls += r.calls;
      byIdea[id] = { titulo: c.idea.titulo, candidates: r.hooks, final: pickHooks(r.hooks, c.idea, 3), issues: r.issues, repaired: r.repaired }; await writePart(dir, `hooks-${id}`, byIdea[id]); log(`hooks ${id}: listos en ${((Date.now() - b) / 60000).toFixed(1)} min${r.issues.length ? ` · avisos: ${r.issues.length}` : ""}`);
    }
    return { byIdea, stats: { ideas: selected.length, resumed, calls, ms: Date.now() - t0 } } satisfies HooksStageOutV3;
  };
}
