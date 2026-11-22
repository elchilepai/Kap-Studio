import { describe, expect, it } from "vitest";
import { KAP_REASONS, SCENE_TYPES, kapIssues, narrationSeconds, structureErrors, suggestSceneType, totalSeconds, visualRhythmCheck, type VisualScene } from "./visualShort";
import { demoPack } from "./visualShort.fixture";

const scenes = () => demoPack().scenes;
const ids = (w: { id: string }[]) => w.map((x) => x.id);
const edit = (f: (s: VisualScene[]) => void) => { const s = scenes(); f(s); return s; };

describe("tipos de escena y storyboard variable", () => {
  it("los 12 tipos de escena", () => { expect([...SCENE_TYPES]).toEqual(["KAP_PRESENTADOR", "CINEMATIC_SCENE", "VISUAL_METAPHOR", "BRAIN_VISUALIZATION", "BEFORE_AFTER", "POV", "OBJECT_METAPHOR", "TRANSFORMATION", "REACTION", "INFOGRAPHIC", "ENVIRONMENT", "DETAIL_SHOT"]); });
  it("el storyboard manual de demostración es válido: 11 escenas, 50 s, sin errores de estructura", () => { const s = scenes(); expect(structureErrors(s)).toEqual([]); expect(s).toHaveLength(11); expect(totalSeconds(s)).toBe(50); expect(new Set(s.map((x) => x.sceneType)).size).toBeGreaterThanOrEqual(8); });
  it("debe tener entre 8 y 14 escenas", () => {
    expect(ids(structureErrors(scenes().slice(0, 7)))).toContain("numero-escenas");
    const many = [...scenes(), ...scenes().slice(0, 4)].map((s, i) => ({ ...s, n: i + 1 })); expect(many.length).toBe(15); expect(ids(structureErrors(many))).toContain("numero-escenas");
    expect(ids(structureErrors(scenes().slice(0, 8)))).not.toContain("numero-escenas"); expect(ids(structureErrors([...scenes(), ...scenes().slice(0, 3)].map((s, i) => ({ ...s, n: i + 1 }))))).not.toContain("numero-escenas");   // 8 y 14 valen
  });
  it("campos obligatorios: narración, visual, subtítulo, acción visual, duración y tipo válidos", () => {
    const bad = edit((s) => { s[2].narration = ""; s[3].subtitle = ""; s[4].visualAction = ""; s[5].duration = 0; (s[6] as { sceneType: string }).sceneType = "OTRA"; s[7].visual = "corto"; });
    const m = structureErrors(bad).map((e) => e.message).join(" | "); for (const re of [/escena 3: falta la narración/, /escena 4: falta el subtítulo/, /escena 5: falta la acción visual/, /escena 6: la duración/, /escena 7: tipo de escena inválido/, /escena 8: falta la descripción visual/]) expect(m).toMatch(re);
  });
  it("suggestSceneType clasifica por el contenido cuando el guionista no indica el tipo", () => {
    const base = { characters: [] as string[], shot: "medium" as const, kapPresent: false };
    expect(suggestSceneType({ ...base, visual: "Dentro del cerebro, una sala de control con luces" })).toBe("BRAIN_VISUALIZATION"); expect(suggestSceneType({ ...base, visual: "Pantalla dividida: antes a la izquierda y después a la derecha" })).toBe("BEFORE_AFTER");
    expect(suggestSceneType({ ...base, shot: "pov", visual: "Vista desde los ojos" })).toBe("POV"); expect(suggestSceneType({ ...base, characters: ["NOA"], visual: "Noa camina por la calle" })).toBe("CINEMATIC_SCENE"); expect(suggestSceneType({ ...base, visual: "La torre se convierte en un avión" })).toBe("TRANSFORMATION");
    expect(suggestSceneType({ ...base, kapPresent: true, characters: ["KAP"], visual: "KAP mira a cámara y presenta" })).toBe("KAP_PRESENTADOR");
  });
  it("la duración se mide por la narración", () => { expect(narrationSeconds("¿Nunca te pasa que parece que todos avanzan menos tú?")).toBeGreaterThan(3.5); expect(narrationSeconds("Sí.")).toBeLessThan(1.5); });
});

describe("regla de aparición de KAP", () => {
  it("en la demo, KAP entra 3 veces y cada una está justificada (hook, opinión, cierre)", () => { const k = scenes().filter((s) => s.kapPresent); expect(k.map((s) => s.kapReason)).toEqual(["hook", "opinion", "cierre"]); expect(kapIssues(scenes())).toEqual([]); expect([...KAP_REASONS]).toEqual(["opinion", "reaccion", "humor", "explicacion", "transicion", "hook", "cierre"]); });
  it("KAP no entra para llenar una escena: sin razón, razón inválida o sin explicar qué aporta", () => {
    expect(kapIssues(edit((s) => { s[5].kapReason = undefined; })).map((e) => e.id)).toContain("kap-sin-razon");
    expect(kapIssues(edit((s) => { (s[5] as { kapReason: string }).kapReason = "relleno"; })).map((e) => e.id)).toContain("kap-sin-razon");
    expect(kapIssues(edit((s) => { s[5].kapWhy = "sí"; })).map((e) => e.message).join()).toMatch(/no explica qué aporta/);
  });
  it("coherencia: KAP en los personajes ⇔ kapPresent; KAP_PRESENTADOR lleva KAP; «hook» solo al principio y «cierre» solo al final", () => {
    expect(kapIssues(edit((s) => { s[1].characters = ["NOA", "KAP"]; })).map((e) => e.id)).toContain("kap-incoherente");
    expect(kapIssues(edit((s) => { s[5].characters = []; })).map((e) => e.id)).toContain("kap-incoherente");
    expect(kapIssues(edit((s) => { s[5].kapPresent = false; s[5].characters = []; })).map((e) => e.message).join()).toMatch(/KAP_PRESENTADOR sin KAP/);
    expect(kapIssues(edit((s) => { s[5].kapReason = "hook"; })).map((e) => e.id)).toContain("kap-razon-fuera-de-sitio"); expect(kapIssues(edit((s) => { s[5].kapReason = "cierre"; })).map((e) => e.id)).toContain("kap-razon-fuera-de-sitio");
  });
  it("los errores de KAP bloquean la estructura", () => { expect(structureErrors(edit((s) => { s[5].kapReason = undefined; })).some((e) => e.id === "kap-sin-razon")).toBe(true); });
});

describe("Visual Rhythm Check: avisos de calidad, no reglas rígidas", () => {
  it("el storyboard de demostración tiene el ritmo sano: ningún aviso", () => { expect(visualRhythmCheck(scenes())).toEqual([]); });
  it("escenas estáticas", () => { const w = visualRhythmCheck(edit((s) => { for (const i of [1, 2, 3, 6]) s[i].visualAction = "Noa está sentada mirando el móvil."; })); expect(ids(w)).toContain("escenas-estaticas"); });
  it("demasiados diálogos (personajes hablando entre sí)", () => { expect(ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 8, 9]) s[i].dialogue = true; })))).toContain("demasiados-dialogos"); });
  it("KAP_PRESENTADOR consecutivos y KAP en demasiadas escenas", () => {
    const w = visualRhythmCheck(edit((s) => { s[1] = { ...s[5], n: 2 }; s[2] = { ...s[5], n: 3 }; })); expect(ids(w)).toContain("kap-consecutivos"); expect(ids(w)).toContain("kap-demasiado");
  });
  it("demasiados planos iguales y repetición de escenarios", () => {
    expect(ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 3, 4]) s[i].shot = "medium"; })))).toContain("planos-iguales");
    expect(ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 3, 4]) s[i].location = "Dormitorio de Noa"; })))).toContain("escenarios-repetidos");
  });
  it("ausencia de acción visual, de contraste y de transformación durante demasiado tiempo", () => {
    const flat = edit((s) => { for (const i of [1, 2, 3, 4, 5, 6]) { s[i].sceneType = "CINEMATIC_SCENE"; s[i].visual = "Noa en su cuarto con el móvil en la mano y una lámpara encendida sobre la mesa de noche."; s[i].visualAction = "Plano tranquilo del cuarto."; s[i].contrast = undefined; } });
    const w = ids(visualRhythmCheck(flat)); expect(w).toContain("sin-accion-visual"); expect(w).toContain("sin-contraste"); expect(w).toContain("sin-transformacion");
  });
  it("escenas que solo ilustran literalmente la frase", () => {
    const lit = edit((s) => { s[1].narration = "Noa en la cama con el móvil en la oscuridad."; s[1].visual = "Noa en la cama con el móvil en la oscuridad."; s[1].visualAction = "Noa en la cama."; s[1].sceneType = "CINEMATIC_SCENE"; });
    expect(visualRhythmCheck(lit).find((x) => x.id === "ilustra-literal")?.scenes).toContain(2);
  });
  it("falta de variedad de tipos de escena y duración fuera de 30-60 s", () => {
    const mono = edit((s) => { for (const x of s) if (x.sceneType !== "KAP_PRESENTADOR") x.sceneType = "CINEMATIC_SCENE"; }); expect(ids(visualRhythmCheck(mono))).toContain("poca-variedad");
    expect(ids(visualRhythmCheck(edit((s) => { for (const x of s) x.duration = 8; })))).toContain("duracion"); expect(ids(visualRhythmCheck(edit((s) => { s[0].duration = 1; })))).toContain("duracion-ajustada");
  });
  it("son avisos: un storyboard con avisos NO deja de ser válido (no hay reglas rígidas)", () => { const s = edit((x) => { for (const i of [1, 2, 3, 4]) x[i].shot = "medium"; }); expect(visualRhythmCheck(s).length).toBeGreaterThan(0); expect(structureErrors(s)).toEqual([]); });
});
