import { describe, expect, it } from "vitest";
import { actionDuration, chain, chainSeconds, clausesOfNarration, hasAction, planClauses } from "./action.ts";

const TEXT = "KAP se levanta, cruza el pasillo, abre la puerta y mira hacia el salón.";
describe("modelo de acción: una narración de varios pasos es UNA acción continua, no cláusulas con su silencio", () => {
  it("se separan los pasos (también «… y <otra acción>») y cada uno tiene su naturaleza", () => {
    expect(planClauses(TEXT).map((s) => s.kind)).toEqual(["posture", "locomotion", "handle", "look"]);
    expect(clausesOfNarration("KAP abre la puerta y mira hacia el salón.")).toEqual(["KAP abre la puerta", "mira hacia el salón"]);
    expect(clausesOfNarration("KAP guarda el pan y queso en la mochila.")).toHaveLength(1);   // «y» no siempre separa dos acciones
  });
  it("NO es «1,5 s por cláusula»: la duración sale del tipo de acción y los pasos se SOLAPAN", () => {
    const steps = planClauses(TEXT), ch = chain(steps), sum = steps.reduce((n, s) => n + s.dur, 0);
    expect(chainSeconds(ch)).toBeLessThan(sum);                 // encadenados duran menos que sumados
    expect(chainSeconds(ch)).not.toBeCloseTo(steps.length * 1.5, 1); expect(actionDuration(TEXT)).toBeLessThan(steps.length * 1.5);
    for (let i = 1; i < ch.length; i++) { expect(ch[i].start).toBeLessThan(ch[i - 1].start + ch[i - 1].dur); expect(ch[i].start).toBeGreaterThan(ch[i - 1].start); }   // cada paso empieza antes de que acabe el anterior
    expect(ch[1].start).toBeCloseTo(steps[0].dur - steps[0].overlap, 5);    // empieza a caminar mientras se incorpora
  });
  it("el tipo de acción manda: correr no dura lo mismo que mirar, y un gesto breve dura menos que cruzar una habitación", () => {
    const d = (t: string) => actionDuration(t);
    expect(d("KAP corre hacia la puerta.")).toBeGreaterThan(d("KAP mira hacia la puerta.")); expect(d("KAP cruza la habitación.")).toBeGreaterThan(d("KAP abre la puerta."));
    expect(d("KAP se levanta y cruza el pasillo y abre la puerta y mira fuera.")).toBeLessThan(4 * 1.5 + 0.01);
  });
  it("lo que solo DESCRIBE (sin verbo de acción) se marca: no mueve nada", () => {
    expect(hasAction("La luz del sol ilumina el suelo de la habitación.")).toBe(false); expect(planClauses("La luz del sol ilumina el suelo.")[0].descriptive).toBe(true);
    expect(hasAction("KAP se queda quieto.")).toBe(true); expect(planClauses("KAP se queda quieto.")[0].kind).toBe("hold");
  });
});
