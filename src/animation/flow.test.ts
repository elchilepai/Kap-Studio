import { describe, expect, it } from "vitest";
import { evaluate } from "./timeline";
import { poseFor } from "./character";
import { direct } from "./director";
import type { ActorSpec, Cue, StageSpec } from "./types";

const actor = (id: string, slot: number): ActorSpec => ({ id, name: id.toUpperCase(), slot, facing: 1, appearance: { kind: "stickman" } as never } as never);
const stage = (cues: Cue[], flow: boolean, n = 1): StageSpec => ({ v: 1, width: 1080, height: 1920, fps: 30, duration: 6, seed: 1, set: { preset: "abstract", timeOfDay: "day", seed: 0 } as never, actors: [actor("a", 4), ...(n > 1 ? [actor("b", 10)] : [])], props: [], cues, style: { ink: "#000", line: 0.045, grade: "none", vignette: 0, shadow: true, bars: 0 } as never, warnings: [], ...(flow ? { flow: true } : {}) });
const st = (s: StageSpec, t: number) => evaluate(s, t).actors[0];

describe("movimiento continuo (flow, solo Shorts)", () => {
  it("la pose que termina se funde hacia fuera en vez de saltar a reposo; sin flow, no cambia nada", () => {
    const cues: Cue[] = [{ t: 1, type: "pose", actor: "a", value: "crouch", dur: 1 }];
    const f = st(stage(cues, true), 2.1), n = st(stage(cues, false), 2.1);
    expect(f.pose2).toBe("crouch"); expect(f.pose2P!).toBeGreaterThan(0.6); expect(poseFor(f, 2.1, 1).lean).toBeGreaterThan(poseFor(n, 2.1, 1).lean + 0.1);   // aún queda algo de la agachada
    expect(n.pose2).toBeUndefined(); expect(st(stage(cues, true), 2.5).pose2).toBeUndefined();   // ya volvió a reposo
  });
  it("de una pose a otra: la anterior sale mientras entra la nueva (sin pasar por reposo)", () => {
    const cues: Cue[] = [{ t: 1, type: "pose", actor: "a", value: "crouch", dur: 3 }, { t: 2, type: "pose", actor: "a", value: "recoil", dur: 1 }];
    const m = st(stage(cues, true), 2.1); expect(m.pose).toBe("recoil"); expect(m.pose2).toBe("crouch"); const lean = poseFor(m, 2.1, 1).lean; expect(lean).toBeGreaterThan(-0.25); expect(lean).toBeLessThan(0.5);
  });
  it("caminar: anticipación hacia atrás, aceleración inclinada hacia delante y frenada sin salto de zancada", () => {
    const s = stage([{ t: 1, type: "move", actor: "a", x: 12, dur: 3 }], true), at = (p: number) => st(s, 1 + 3 * p), lean = (p: number) => poseFor(at(p), 1 + 3 * p, 1);
    expect(lean(0.03).lean).toBeLessThan(0);   // anticipación
    expect(lean(0.5).lean).toBeGreaterThan(0.05);   // en marcha, inclinado hacia delante
    expect(Math.abs(lean(0.995).legF)).toBeLessThan(0.05);   // al llegar las piernas ya casi paran: nada de salto al reposo
    expect(lean(0.5).legF === 0 ? 0 : Math.abs(lean(0.5).legF)).toBeGreaterThan(Math.abs(lean(0.08).legF));   // más zancada a mitad que al arrancar (acelera y luego frena)
    expect(lean(0.9).lean).toBeLessThan(lean(0.5).lean);
  });
  it("sin flow, la marcha conserva la curva anterior", () => { const s = stage([{ t: 1, type: "move", actor: "a", x: 12, dur: 3 }], false); expect(st(s, 2).moveP).toBeUndefined(); });
});

const base = { duration: 7, tail: 0.5, aspect: 9 / 16, index: 0, fps: 30, width: 1080, height: 1920, location: "Salón", mood: "tarde, interior", tags: [], narration: "", style: { ink: "#000", line: 0.045, grade: "none", vignette: 0.3, shadow: true, bars: 0 } as never,
  characters: [{ id: "k", name: "KAP", appearance: { kind: "stickman" } as never }, { id: "h", name: "Hermano de KAP", appearance: { kind: "stickman" } as never }] };
describe("acting del Short en el director", () => {
  const poses = (s: StageSpec, id: string) => s.cues.filter((c) => c.type === "pose" && c.actor === id).map((c) => (c as { value: string }).value);
  it("reacciones corporales variadas tras una acción (no siempre «mira»)", () => {
    const lines = [{ text: "KAP tira el vaso. KAP baja la mirada. El hermano se encoge. KAP aprieta el mando.", start: 0.3, end: 6 }];
    const s = direct({ ...base, short: true, pacing: false, lines, directions: [] } as never), k = poses(s, "k"), h = poses(s, "h");
    expect(k).toEqual(expect.arrayContaining(["droop", "tense"])); expect(h).toContain("shrink");
    expect(poses(direct({ ...base, lines, directions: [] } as never), "k")).not.toContain("droop");   // el episodio no cambia
  });
  it("durante una conversación nadie queda congelado: quien escucha gira y atiende, quien habla mucho rato cambia de peso", () => {
    const lines = [{ speaker: "KAP", text: "No sé si esto va a salir bien", start: 0.3, end: 3.9 }, { speaker: "Hermano de KAP", text: "¿Seguro?", start: 4, end: 5 }];
    const s = direct({ ...base, short: true, pacing: false, lines, directions: [] } as never);
    expect(poses(s, "h")).toContain("listen"); expect(poses(s, "k")).toContain("settle"); expect(s.cues.some((c) => c.type === "face" && c.actor === "h" && c.t === 0.3)).toBe(true);
    expect(s.cues.some((c) => c.type === "expression" && c.actor === "k" && c.value === "confused")).toBe(true);   // la pregunta provoca una reacción
    expect(poses(direct({ ...base, lines, directions: [] } as never), "h")).not.toContain("listen");
  });
  it("marca el movimiento continuo en el escenario del Short y no en el del episodio", () => { expect(direct({ ...base, short: true, lines: [], directions: [] } as never).flow).toBe(true); expect(direct({ ...base, lines: [], directions: [] } as never).flow).toBeUndefined(); });
});
