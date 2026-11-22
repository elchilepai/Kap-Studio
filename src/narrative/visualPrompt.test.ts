import { describe, expect, it } from "vitest";
import { FORMAT_9_16, GLOBAL_NEGATIVE_PROMPT, KAP_CHARACTER_BIBLE, KAP_REF, SECONDARY_CHARACTER_BIBLE, STYLE_BIBLE, STYLE_REFS } from "./styleBible";
import { finalPrompt, scenePrompt } from "./visualPrompt";
import { demoPack } from "./visualShort.fixture";

const S = demoPack().scenes, count = (hay: string, needle: string) => hay.split(needle).length - 1;

describe("Style Bible dividida en bloques globales", () => {
  it("existen STYLE_BIBLE, KAP_CHARACTER_BIBLE, SECONDARY_CHARACTER_BIBLE, GLOBAL_NEGATIVE_PROMPT y FORMAT_9_16", () => {
    expect(STYLE_BIBLE).toMatch(/2D flat cartoon illustration/); expect(KAP_CHARACTER_BIBLE).toMatch(/gold Cuban chain necklace with a gold brain-shaped pendant/); expect(Object.keys(SECONDARY_CHARACTER_BIBLE)).toEqual(expect.arrayContaining(["HERMANO DE KAP", "NOA"]));
    expect(GLOBAL_NEGATIVE_PROMPT).toMatch(/photorealistic/); expect(FORMAT_9_16).toMatch(/9:16/);
  });
});

describe("prompt de imagen corto y específico de escena", () => {
  it("la parte de escena lleva solo lo específico (escena, personajes, entorno, emoción, cámara, luz, objetos, propósito, espacio de subtítulos) y es corta", () => {
    const p = scenePrompt(S[1]); for (const re of [/^SCENE: /, /Characters: NOA/, /Setting: Dormitorio de Noa/, /Emotion: /, /Camera\/composition: wide establishing shot/, /Lighting: cold blue/, /Key objects: phone, bedside clock/, /Visual purpose: /, /bottom third calm/]) expect(p).toMatch(re); expect(p.length).toBeLessThan(700); expect(p).not.toMatch(/\.\./);   // sin puntos duplicados
  });
  it("la escena NO repite la Style Bible, las fichas, el negativo ni el formato", () => {
    for (const s of S) { const p = scenePrompt(s); expect(p).not.toContain("thick black outlines"); expect(p).not.toContain("palette shared"); expect(p).not.toContain("Cuban chain"); expect(p).not.toContain("hair tuft"); expect(p).not.toContain("photorealistic"); expect(p).not.toContain("1080x1920"); }
  });
  it("el prompt final combina automáticamente la Style Bible UNA vez, el formato y solo las fichas de quien aparece", () => {
    const kap = finalPrompt(S[0]), noa = finalPrompt(S[1]), none = finalPrompt(S[3]);
    for (const f of [kap, noa, none]) { expect(count(f.prompt, STYLE_BIBLE)).toBe(1); expect(f.prompt).toContain(FORMAT_9_16); expect(f.negative).toBe(GLOBAL_NEGATIVE_PROMPT); expect(f.prompt.startsWith("SCENE:")).toBe(true); }
    expect(kap.prompt).toContain(KAP_CHARACTER_BIBLE); expect(kap.globals).toEqual(["STYLE_BIBLE", "KAP_CHARACTER_BIBLE", "FORMAT_9_16"]); expect(kap.prompt).not.toContain("teal hair tuft");
    expect(noa.prompt).toContain(SECONDARY_CHARACTER_BIBLE.NOA); expect(noa.prompt).not.toContain(KAP_CHARACTER_BIBLE); expect(noa.globals).toContain("SECONDARY_CHARACTER_BIBLE");
    expect(none.prompt).not.toContain("CHARACTERS (identical"); expect(none.prompt).not.toContain("Cuban chain"); expect(none.globals).toEqual(["STYLE_BIBLE", "FORMAT_9_16"]);
  });
  it("la referencia de KAP solo se adjunta cuando KAP sale; un secundario nuevo se describe una vez", () => {
    expect(finalPrompt(S[0]).references).toEqual([KAP_REF, ...STYLE_REFS]); expect(finalPrompt(S[1]).references).toEqual(STYLE_REFS);
    expect(finalPrompt({ ...S[1], characters: ["DANI"] }).prompt).toMatch(/new secondary character/);
  });
});
