import { describe, expect, it } from "vitest";
import { buildSceneCues, splitBalanced, toASS, wrap2, DEFAULT_SUB_STYLE } from "./subtitles";

const LONG = "Las luces de los edificios parpadean sin motivo mientras el eco de los pasos se pierde entre las calles.";
describe("subtítulos en vertical", () => {
  it("splitBalanced parte entre palabras, equilibrado y sin pasar del límite", () => {
    const parts = splitBalanced(LONG, 44); expect(parts.length).toBeGreaterThan(1); expect(parts.join(" ")).toBe(LONG);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(44 * 1.15);
    expect(splitBalanced("Hola mundo", 44)).toEqual(["Hola mundo"]);
  });
  it("una frase larga ya no desborda la pantalla vertical: cada línea ≤ ~25 caracteres", () => {
    const cues = buildSceneCues([{ speaker: "KAP", text: LONG }], 10, { maxChars: 22, splitLong: true });
    expect(cues.length).toBeGreaterThan(1);
    for (const c of cues) for (const l of wrap2(c.text, 22)) expect(l.length).toBeLessThanOrEqual(22 * 1.15 + 1);
    expect(cues.map((c) => c.text).join(" ")).toBe(LONG);                                   // no se pierde texto
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end - 1e-9);   // sin solaparse
    expect(cues.at(-1)!.end).toBeLessThanOrEqual(10);
  });
  it("sin `splitLong` (16:9) el comportamiento es el de siempre", () => {
    expect(buildSceneCues([{ speaker: "KAP", text: LONG }], 10, { maxChars: 44 })).toHaveLength(buildSceneCues([{ speaker: "KAP", text: LONG }], 10, { maxChars: 44, splitLong: false }).length);
    expect(buildSceneCues([{ speaker: "KAP", text: LONG }], 10, { maxChars: 44 })).toHaveLength(1);
  });
  it("el ASS vertical deja libre la franja inferior (margen ≥ 15 %) y usa tamaño relativo al ancho", () => {
    const ass = toASS(buildSceneCues([{ speaker: "KAP", text: "Hola" }], 4, { maxChars: 22 }), { width: 1080, height: 1920, style: DEFAULT_SUB_STYLE });
    const m = /Style: KAP,Inter,(\d+),.*?,2,(\d+),(\d+),(\d+),1/.exec(ass)!; expect(Number(m[1])).toBe(63); expect(Number(m[4])).toBeGreaterThanOrEqual(1920 * 0.15);
  });
});
