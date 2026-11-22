import { describe, expect, it } from "vitest";
import { FORMAT_9_16, GLOBAL_NEGATIVE_PROMPT, KAP_CHARACTER_BIBLE, KAP_REF, SECONDARY_CHARACTER_BIBLE, STYLE_BIBLE, STYLE_REFS } from "./styleBible";
import { finalPrompt, scenePrompt } from "./visualPrompt";
import { demoPack } from "./visualShort.fixture";

const S = demoPack().scenes, count = (hay: string, needle: string) => hay.split(needle).length - 1;
describe("Style Bible dividida en bloques globales", () => {
  it("existen STYLE_BIBLE, KAP_CHARACTER_BIBLE, SECONDARY_CHARACTER_BIBLE, GLOBAL_NEGATIVE_PROMPT y FORMAT_9_16", () => {
    expect(STYLE_BIBLE).toMatch(/2D flat cartoon illustration/); expect(KAP_CHARACTER_BIBLE).toMatch(/gold Cuban chain necklace with a gold brain-shaped pendant/); expect(Object.keys(SECONDARY_CHARACTER_BIBLE)).toEqual(expect.arrayContaining(["HERMANO DE KAP", "NOA"])); expect(GLOBAL_NEGATIVE_PROMPT).toMatch(/photorealistic/); expect(FORMAT_9_16).toMatch(/9:16/);
  });
});
describe("prompt de imagen corto y específico de escena", () => {
  it("lleva: acción exacta, personajes, entorno, composición, cámara, iluminación, expresión corporal, objetos, profundidad y propósito (y espacio para subtítulos)", () => {
    const p = scenePrompt(S[1]); for (const re of [/^SCENE \(exact action\): Extreme close-up of KAP/, /Characters: KAP\./, /Environment: Dormitorio de KAP \(noche\); dark bedroom at night\./, /Composition: hands and phone/, /Camera: extreme close-up detail shot; locked-off macro/, /Lighting: cold blue phone glow/, /Body language \/ expression: tense thumbs/, /Key objects: phone, chat bubbles\./, /Depth: hands in the foreground/, /Visual purpose: /, /top third calm/]) expect(p).toMatch(re); expect(p.length).toBeLessThan(1100); expect(p).not.toMatch(/\.\./);
  });
  it("la escena NO repite la Style Bible, las fichas, el negativo ni el formato", () => { for (const s of S) { const p = scenePrompt(s); for (const x of ["thick black outlines", "palette shared", "Cuban chain", "hair tuft", "photorealistic", "1080x1920"]) expect(p).not.toContain(x); } });
  it("el prompt final combina la Style Bible UNA vez, el formato y la ficha de KAP (con la prioridad de identidad) solo en escenas donde KAP sale", () => {
    const kap = finalPrompt(S[0]), none = finalPrompt({ ...S[2], characters: [], kapPresent: false });
    for (const f of [kap, none]) { expect(count(f.prompt, STYLE_BIBLE)).toBe(1); expect(f.prompt).toContain(FORMAT_9_16); expect(f.negative).toBe(GLOBAL_NEGATIVE_PROMPT); expect(f.prompt.startsWith("SCENE (exact action):")).toBe(true); }
    expect(kap.prompt).toContain(KAP_CHARACTER_BIBLE); expect(kap.prompt).toMatch(/priority: 1 KAP's identity, 2 the exact action, 3 composition, 4 environment, 5 aesthetics/); expect(kap.globals).toEqual(["STYLE_BIBLE", "KAP_CHARACTER_BIBLE", "FORMAT_9_16"]);
    expect(none.prompt).not.toContain("CHARACTERS (identical"); expect(none.prompt).not.toContain("Cuban chain"); expect(none.globals).toEqual(["STYLE_BIBLE", "FORMAT_9_16"]);
  });
  it("un secundario se incluye con su ficha; la referencia de KAP solo se adjunta cuando sale", () => {
    const noa = finalPrompt({ ...S[2], characters: ["NOA"], kapPresent: false }); expect(noa.prompt).toContain(SECONDARY_CHARACTER_BIBLE.NOA); expect(noa.prompt).not.toContain(KAP_CHARACTER_BIBLE); expect(noa.globals).toContain("SECONDARY_CHARACTER_BIBLE");
    expect(finalPrompt(S[0]).references).toEqual([KAP_REF, ...STYLE_REFS]); expect(noa.references).toEqual(STYLE_REFS); expect(finalPrompt({ ...S[2], characters: ["DANI"], kapPresent: false }).prompt).toMatch(/new secondary character/);
  });
});
