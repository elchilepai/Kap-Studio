import { describe, expect, it } from "vitest";
import { checkScene, gateFeedback, isBlocking, type GateInput } from "./gate.ts";

const L = (n: number) => String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + (Math.floor(n / 26) % 26)), w = (n: number, k: number, from = 0) => Array.from({ length: k }, (_, i) => `zo${L(n)}${L(from + i)}qu`).join(" ");
const base = (n: number, o: Partial<GateInput["scene"]> = {}): GateInput["scene"] => ({ lines: [{ speaker: "", text: w(n, 30) }, { speaker: "KAP", text: w(n, 15, 40) }, { speaker: "Dani", text: w(n, 15, 70) }], change: `Pasa ${w(n, 5, 120)}`, ...o });
const inp = (scene: GateInput["scene"], o: Partial<GateInput> = {}): GateInput => ({ scene, previous: [], speakers: ["KAP", "Dani"], memoryOutside: ["Ramiro", "Hermano de KAP"], ...o });
const prevOf = (s: GateInput["scene"]) => ({ text: s.lines.map((l) => l.text).join(" "), change: s.change, lines: s.lines.map((l) => l.text) });
const kinds = (i: GateInput) => checkScene(i).map((x) => x.kind);

describe("puerta de calidad por escena", () => {
  it("una escena con contenido, cambio nuevo y reparto previsto pasa", () => { expect(kinds(inp(base(1), { previous: [prevOf(base(0))] }))).toEqual([]); });
  it("«¿qué ha cambiado?»: cambio vacío o igual al de otra escena bloquea", () => {
    expect(kinds(inp(base(1, { change: "" })))).toContain("sin-cambio"); const a = base(0), b = base(1, { change: a.change });
    expect(kinds(inp(b, { previous: [prevOf(a)] }))).toContain("sin-cambio"); expect(isBlocking(checkScene(inp(base(1, { change: "x" }))))).toBe(true);
  });
  it("una escena sin información nueva respecto a lo ya escrito bloquea aunque declare un cambio", () => {
    const a = base(0), b = { ...base(0), change: "Pasa algo totalmente distinto declarado" }; expect(kinds(inp(b, { previous: [prevOf(a)] }))).toEqual(expect.arrayContaining(["repite-escena"]));
  });
  it("frases repetidas de escenas anteriores o dentro de la misma escena", () => {
    const a = base(0), dup = base(1, { lines: [{ speaker: "KAP", text: a.lines[1].text }, { speaker: "Dani", text: w(1, 15, 70) }, { speaker: "", text: w(1, 30) }] }); expect(kinds(inp(dup, { previous: [prevOf(a)] }))).toContain("repite-frase");
    const same = base(2, { lines: [{ speaker: "KAP", text: w(2, 12) }, { speaker: "Dani", text: w(2, 12) }, { speaker: "", text: w(2, 30, 50) }] }); expect(kinds(inp(same))).toContain("repite-frase");
  });
  it("personaje de la memoria que habla sin estar en el reparto bloquea; mencionarlo sin necesidad solo avisa", () => {
    const talk = base(1, { lines: [{ speaker: "Ramiro", text: w(1, 20) }, { speaker: "KAP", text: w(1, 20, 30) }, { speaker: "", text: w(1, 20, 60) }] }); const r = checkScene(inp(talk)); expect(r.find((x) => x.kind === "personaje-no-previsto")?.blocking).toBe(true);
    const mention = base(1, { lines: [{ speaker: "KAP", text: `${w(1, 20)} como decía Ramiro ${w(1, 5, 30)}` }, { speaker: "Dani", text: w(1, 20, 60) }, { speaker: "", text: w(1, 25, 90) }] }); const m = checkScene(inp(mention)).find((x) => x.kind === "menciona-memoria"); expect(m?.blocking).toBe(false);
  });
  it("escena corta: pide contenido real y no es bloqueante", () => {
    const short = base(1, { lines: [{ speaker: "KAP", text: "No quiero" }, { speaker: "Dani", text: "Pues vete" }, { speaker: "", text: "Se va" }] }); const r = checkScene(inp(short)); expect(r.find((x) => x.kind === "corta")?.blocking).toBe(false); expect(gateFeedback(r)).toMatch(/no relleno ni frases motivacionales/);
  });
  it("voz de adulto o lema en KAP; el hermano que solo reacciona", () => {
    const adult = base(1, { lines: [{ speaker: "KAP", text: `No te rindas nunca, mi voz va más allá ${w(1, 10)}` }, { speaker: "Dani", text: w(1, 25, 40) }, { speaker: "", text: w(1, 25, 70) }] }); expect(kinds(inp(adult))).toContain("voz-adulta");
    const sib = base(1, { lines: [{ speaker: "Hermano de KAP", text: "Kap... ¿estás bien?" }, { speaker: "Hermano de KAP", text: "Duele mucho" }, { speaker: "KAP", text: w(1, 30) }, { speaker: "", text: w(1, 30, 40) }] }); expect(kinds(inp(sib, { siblingName: "Hermano de KAP", speakers: ["KAP", "Hermano de KAP"] }))).toContain("hermano-reactivo");
  });
});
