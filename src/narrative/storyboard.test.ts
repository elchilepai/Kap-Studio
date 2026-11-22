import { describe, expect, it } from "vitest";
import { imagePrompt, narrationScript, narrationSeconds, storyboardMarkdown, storyboardReasons, totalNarrationSeconds } from "./storyboard";
import { characterSheet, KAP_REF, STYLE_REFS } from "./styleBible";
import { goodStoryboard } from "./storyboard.fixture";

const mod = (f: (sb: ReturnType<typeof goodStoryboard>) => void) => { const sb = goodStoryboard(); f(sb); return storyboardReasons(sb).join(" | "); };

describe("storyboard: el contenido de las escenas, no las etiquetas", () => {
  it("un mini-relato con la cadena completa en 5 imágenes pasa", () => { expect(storyboardReasons(goodStoryboard())).toEqual([]); });
  it("la estructura de 5 escenas es fija y en orden", () => { expect(mod((s) => { [s.scenes[1], s.scenes[2]] = [s.scenes[2], s.scenes[1]]; })).toMatch(/debe ser «ve-logro»/); expect(storyboardReasons({ ...goodStoryboard(), scenes: goodStoryboard().scenes.slice(0, 4) }).join()).toMatch(/faltan escenas/); });
  it("la narración NO es una instrucción visual y no repite la descripción", () => {
    expect(mod((s) => { s.scenes[2].narration = "KAP camina hacia la ventana"; })).toMatch(/instrucción visual/);
    expect(mod((s) => { s.scenes[2].narration = s.scenes[2].visual; })).toMatch(/repite la descripción visual/);
  });
  it("narración de coach, moraleja o frase abstracta no vale", () => {
    expect(mod((s) => { s.scenes[4].narration = "Recuerda que cada uno tiene su propio ritmo"; })).toMatch(/coach|moraleja/);
    expect(mod((s) => { s.scenes[0].narration = "Debes recordar que todos avanzan a su ritmo en la vida"; })).toMatch(/escena 1|coach/);
  });
  it("la comparación se ve: la escena 2 necesita OTRO personaje y KAP está en todas", () => {
    expect(mod((s) => { s.scenes[1].characters = ["KAP"]; })).toMatch(/OTRO personaje/); expect(mod((s) => { s.scenes[3].characters = ["Hermano de KAP"]; })).toMatch(/KAP debe aparecer/);
  });
  it("la causalidad tiene que estar en las imágenes: sin fallo visible, sin segunda estrategia o sin resultado concreto no pasa", () => {
    expect(mod((s) => { s.scenes[2].visual = "KAP mira con tristeza a su hermano sentado en la alfombra del salón mientras tiene los bloques de colores en las manos y no sabe qué hacer."; })).toMatch(/historia visual/);
    expect(mod((s) => { s.scenes[3].visual = s.scenes[2].visual; })).toMatch(/repite el primero|no hay un segundo intento/);
    expect(mod((s) => { s.scenes[4].visual = "KAP sonríe de lado en el salón con los brazos cruzados mientras su hermano le da un abrazo muy fuerte frente al sofá de la casa."; })).toMatch(/resultado concreto|abstracta|historia visual/);
  });
  it("las descripciones visuales demasiado vagas no sirven para generar una imagen", () => { expect(mod((s) => { s.scenes[1].visual = "El hermano construye algo."; })).toMatch(/demasiado vaga/); });
});

describe("prompt de imagen y guion por escena", () => {
  it("el prompt lleva el estilo, la paleta, las fichas de los personajes presentes, el plano y el espacio libre; las referencias se adjuntan", () => {
    const sb = goodStoryboard(), a = imagePrompt(sb.scenes[0]), b = imagePrompt(sb.scenes[1]);
    expect(a.prompt).toMatch(/2D flat cartoon illustration/); expect(a.prompt).toMatch(/thick black outlines/); expect(a.prompt).toMatch(/palette shared by every scene/); expect(a.prompt).toMatch(/gold Cuban chain necklace with a gold brain-shaped pendant/); expect(a.prompt).not.toMatch(/mustard-yellow hoodie/);
    expect(b.prompt).toMatch(/mustard-yellow hoodie/); expect(b.prompt).toMatch(/wide establishing shot/); expect(b.prompt).toMatch(/top third of the frame calm/); expect(b.prompt).toMatch(/vertical 9:16/);
    expect(b.negative).toMatch(/photorealistic/); expect(b.references).toEqual([KAP_REF, ...STYLE_REFS]); expect(characterSheet("Dani")).toMatch(/new secondary character/);
  });
  it("la narración (lo único que se locuta) no contiene nunca la descripción visual", () => {
    const sb = goodStoryboard(), n = narrationScript(sb); for (const s of sb.scenes) expect(n).not.toContain(s.visual); expect(n).toContain("SCENE 01: ¿Nunca te pasa");
    expect(narrationSeconds("¿Nunca te pasa que parece que todos avanzan menos tú?")).toBeGreaterThan(3); expect(totalNarrationSeconds(sb)).toBeGreaterThan(8);
  });
  it("el guion sale en el formato SCENE NN / Narration / Visual / Characters / Location / Shot / Emotion / Purpose", () => {
    const md = storyboardMarkdown(goodStoryboard()); for (const k of ["## SCENE 01", "## SCENE 05", "Narration:", "Visual:", "Characters:", "Location:", "Shot:", "Emotion:", "Purpose:", "Image prompt (9:16):", "NO se pronuncia"]) expect(md).toContain(k); expect(md.match(/## SCENE/g)).toHaveLength(5);
  });
});
