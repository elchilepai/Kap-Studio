/**
 * PRODUCCIÓN POR ETAPAS, RECUPERABLE. Un Short se produce en 9 etapas (idea → hooks → guion → storyboard → prompts visuales → movimiento → audio → control de calidad → exportación).
 * Cada etapa guarda su resultado en `<dir>/stages/NN-etapa.json`; si una falla, la siguiente ejecución continúa DESDE ESA etapa sin regenerar lo anterior. Una etapa se puede
 * rehacer a propósito (`force`): entonces las posteriores se invalidan, porque dependen de ella. Las etapas son funciones inyectadas (el modelo se conecta después).
 */
import fs from "node:fs/promises";
import path from "node:path";

export const STAGES = ["idea", "hooks", "script", "storyboard", "visual-prompts", "motion", "audio", "quality-check", "export"] as const;
export type StageId = (typeof STAGES)[number];
export type StageState = { status: "pending" | "done" | "failed"; attempts: number; at?: string; error?: string };
export type RunState = { topic: string; created: string; stages: Record<StageId, StageState> };
export type StageCtx = { topic: string; /** resultado guardado de una etapa anterior */ load: <T = unknown>(id: StageId) => Promise<T>; signal?: AbortSignal };
export type StageFn = (ctx: StageCtx) => Promise<unknown>;
export type RunOptions = { force?: StageId[]; stopAfter?: StageId; now?: () => string; signal?: AbortSignal };

const file = (dir: string, id: StageId) => path.join(dir, "stages", `${String(STAGES.indexOf(id) + 1).padStart(2, "0")}-${id}.json`);
const statePath = (dir: string) => path.join(dir, "state.json");
const blank = (): Record<StageId, StageState> => Object.fromEntries(STAGES.map((s) => [s, { status: "pending", attempts: 0 }])) as Record<StageId, StageState>;
const exists = async (f: string) => { try { await fs.access(f); return true; } catch { return false; } };
export async function readState(dir: string): Promise<RunState | undefined> { try { return JSON.parse(await fs.readFile(statePath(dir), "utf8")) as RunState; } catch { return undefined; } }
export async function loadStage<T = unknown>(dir: string, id: StageId): Promise<T> { return JSON.parse(await fs.readFile(file(dir, id), "utf8")) as T; }

/** Ejecuta las etapas en orden; salta las ya hechas (con su resultado en disco) y se detiene en la primera que falla. */
export async function runStages(dir: string, topic: string, steps: Partial<Record<StageId, StageFn>>, o: RunOptions = {}): Promise<{ ran: StageId[]; skipped: StageId[]; failed?: { stage: StageId; error: string }; state: RunState }> {
  const now = o.now ?? (() => new Date().toISOString()); await fs.mkdir(path.join(dir, "stages"), { recursive: true });
  const state: RunState = (await readState(dir)) ?? { topic, created: now(), stages: blank() }; state.topic = topic; const save = () => fs.writeFile(statePath(dir), JSON.stringify(state, null, 1));
  const ran: StageId[] = [], skipped: StageId[] = []; let invalidated = false;
  for (const id of o.force ?? []) { state.stages[id] = { ...state.stages[id], status: "pending" }; invalidated = true; }
  for (const id of STAGES) {
    const st = state.stages[id], fn = steps[id];
    if (invalidated && o.force?.every((f) => STAGES.indexOf(f) < STAGES.indexOf(id)) && st.status === "done") state.stages[id] = { ...st, status: "pending" };   // lo que depende de una etapa rehecha se invalida
    const cur = state.stages[id];
    if (cur.status === "done" && (await exists(file(dir, id)))) { skipped.push(id); if (o.stopAfter === id) break; continue; }
    if (!fn) { if (o.stopAfter && STAGES.indexOf(id) > STAGES.indexOf(o.stopAfter)) break; continue; }
    try {
      const out = await fn({ topic, load: (x) => loadStage(dir, x), signal: o.signal }); await fs.writeFile(file(dir, id), JSON.stringify(out ?? null, null, 1));
      state.stages[id] = { status: "done", attempts: cur.attempts + 1, at: now() }; ran.push(id); await save();
    } catch (e) {
      const error = (e as Error).message; state.stages[id] = { status: "failed", attempts: cur.attempts + 1, at: now(), error }; await save(); return { ran, skipped, failed: { stage: id, error }, state };
    }
    if (o.stopAfter === id) break;
  }
  await save(); return { ran, skipped, state };
}
