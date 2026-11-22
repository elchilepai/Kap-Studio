import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { STAGES, loadStage, readState, runStages, type StageFn } from "./stages";

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "kap-run-"));
const counting = () => { const calls: Record<string, number> = {}; const fn = (id: string, out: unknown = { id }): StageFn => async () => { calls[id] = (calls[id] ?? 0) + 1; return out; }; return { calls, fn }; };

describe("producción por etapas, recuperable", () => {
  it("las 9 etapas, en orden, y cada resultado se guarda en disco", async () => {
    expect([...STAGES]).toEqual(["idea", "hooks", "script", "storyboard", "visual-prompts", "motion", "audio", "quality-check", "export"]);
    const dir = await tmp(), { calls, fn } = counting(), steps = Object.fromEntries(STAGES.map((s) => [s, fn(s)])); const r = await runStages(dir, "aprobación", steps);
    expect(r.ran).toEqual([...STAGES]); expect(r.failed).toBeUndefined(); expect(Object.values(calls).every((n) => n === 1)).toBe(true);
    expect((await readState(dir))!.stages.export.status).toBe("done"); expect(await loadStage(dir, "script")).toEqual({ id: "script" }); expect((await fs.readdir(path.join(dir, "stages"))).sort()[3]).toBe("04-storyboard.json");
  });
  it("si una etapa falla, la siguiente ejecución continúa DESDE ESA etapa sin regenerar lo anterior", async () => {
    const dir = await tmp(), { calls, fn } = counting(); let boom = true;
    const steps = { idea: fn("idea"), hooks: fn("hooks"), script: async () => { calls.script = (calls.script ?? 0) + 1; if (boom) throw new Error("Qwen se quedó sin memoria"); return { id: "script" }; }, storyboard: fn("storyboard") };
    const a = await runStages(dir, "t", steps); expect(a.failed).toEqual({ stage: "script", error: "Qwen se quedó sin memoria" }); expect(a.ran).toEqual(["idea", "hooks"]); expect((await readState(dir))!.stages.script).toMatchObject({ status: "failed", attempts: 1, error: "Qwen se quedó sin memoria" }); expect(calls.storyboard).toBeUndefined();
    boom = false; const b = await runStages(dir, "t", steps); expect(b.skipped).toEqual(["idea", "hooks"]); expect(b.ran).toEqual(["script", "storyboard"]); expect(calls.idea).toBe(1); expect(calls.hooks).toBe(1); expect(calls.script).toBe(2); expect((await readState(dir))!.stages.script.attempts).toBe(2);
  });
  it("una etapa lee el resultado guardado de las anteriores", async () => {
    const dir = await tmp(), seen: unknown[] = []; await runStages(dir, "t", { idea: async () => ({ topic: "x" }), hooks: async (c) => { seen.push(await c.load("idea")); return []; } }); expect(seen).toEqual([{ topic: "x" }]);
  });
  it("rehacer una etapa a propósito (force) invalida las posteriores, que dependen de ella, y no toca las anteriores", async () => {
    const dir = await tmp(), { calls, fn } = counting(), steps = { idea: fn("idea"), hooks: fn("hooks"), script: fn("script"), storyboard: fn("storyboard") }; await runStages(dir, "t", steps);
    const r = await runStages(dir, "t", steps, { force: ["script"] }); expect(r.skipped).toEqual(["idea", "hooks"]); expect(r.ran).toEqual(["script", "storyboard"]); expect(calls).toEqual({ idea: 1, hooks: 1, script: 2, storyboard: 2 });
  });
  it("stopAfter permite parar para que el usuario apruebe una etapa antes de seguir; si ya está hecha, no se rehace", async () => {
    const dir = await tmp(), { calls, fn } = counting(), steps = { idea: fn("idea"), hooks: fn("hooks"), script: fn("script") };
    const a = await runStages(dir, "t", steps, { stopAfter: "hooks" }); expect(a.ran).toEqual(["idea", "hooks"]); expect(calls.script).toBeUndefined(); const b = await runStages(dir, "t", steps); expect(b.skipped).toEqual(["idea", "hooks"]); expect(b.ran).toEqual(["script"]);
  });
  it("si falta el fichero de una etapa marcada como hecha, se rehace (no se confía solo en el estado)", async () => {
    const dir = await tmp(), { calls, fn } = counting(), steps = { idea: fn("idea"), hooks: fn("hooks") }; await runStages(dir, "t", steps); await fs.rm(path.join(dir, "stages", "01-idea.json"));
    const r = await runStages(dir, "t", steps); expect(r.ran).toContain("idea"); expect(calls.idea).toBe(2);
  });
});
