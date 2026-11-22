import { describe, expect, it } from "vitest";
import { BLOCKS, KAP_REASONS, onKapThread, MOTION_KINDS, SCENE_TYPES, kapIssues, readinessIssues, speechSeconds, structureErrors, suggestSceneType, totalSeconds, visualRhythmCheck, type VisualScene } from "./visualShort";
import { demoPack } from "./visualShort.fixture";

const scenes = () => demoPack().scenes;
const ids = (w: { id: string }[]) => w.map((x) => x.id);
const edit = (f: (s: VisualScene[]) => void) => { const s = scenes(); f(s); return s; };

describe("tipos de escena, bloques y storyboard variable", () => {
  it("13 tipos de escena (incluye KAP_EXAMPLE) y los 8 bloques del Short", () => {
    expect([...SCENE_TYPES]).toEqual(["KAP_PRESENTADOR", "KAP_EXAMPLE", "CINEMATIC_SCENE", "POV", "REACTION", "VISUAL_METAPHOR", "BRAIN_VISUALIZATION", "BEFORE_AFTER", "OBJECT_METAPHOR", "TRANSFORMATION", "DETAIL_SHOT", "ENVIRONMENT", "INFOGRAPHIC"]);
    expect([...BLOCKS]).toEqual(["HOOK", "PROBLEMA", "EJEMPLO", "CONSECUENCIA", "REALIZACION", "NUEVA_ESTRATEGIA", "RESULTADO", "CIERRE"]); expect(MOTION_KINDS.length).toBe(12);
  });
  it("el storyboard manual de demostración es válido: 11 escenas, 40 s y 9 tipos distintos", () => { const s = scenes(); expect(structureErrors(s)).toEqual([]); expect(s).toHaveLength(11); expect(totalSeconds(s)).toBe(40); expect(new Set(s.map((x) => x.sceneType)).size).toBeGreaterThanOrEqual(8); });
  it("debe tener entre 8 y 14 escenas", () => {
    expect(ids(structureErrors(scenes().slice(0, 7)))).toContain("numero-escenas");
    const many = [...scenes(), ...scenes().slice(0, 4)].map((s, i) => ({ ...s, n: i + 1 })); expect(ids(structureErrors(many))).toContain("numero-escenas");
    expect(ids(structureErrors(scenes().slice(0, 8)))).not.toContain("numero-escenas"); expect(ids(structureErrors([...scenes(), ...scenes().slice(0, 3)].map((s, i) => ({ ...s, n: i + 1 }))))).not.toContain("numero-escenas");
  });
  it("cada escena lleva todos los campos de la especificación (acción, visual, cámara, composición, luz, voz o silencio, subtítulo, SFX, transición, propósito, movimiento)", () => {
    const bad = edit((s) => { s[1].action = ""; s[2].camera = ""; s[3].composition = ""; s[4].lighting = ""; s[5].subtitle = ""; s[6].transition = ""; s[7].purpose = ""; s[8].motionPrompt = ""; s[9].dialogue = undefined; s[9].silent = false; s[10].visualAction = ""; (s[0] as { block: string }).block = "OTRO"; });
    const m = structureErrors(bad).map((e) => e.message).join(" | "); for (const re of [/escena 2: falta qué hace KAP/, /escena 3: faltan cámara/, /escena 4: faltan cámara/, /escena 5: faltan cámara/, /escena 6: falta el subtítulo/, /escena 7: falta la transición/, /escena 8: faltan lugar, emoción o propósito/, /escena 9: falta el movimiento/, /escena 10: no tiene voz ni está marcada como silenciosa/, /escena 11: falta qué cambia visualmente/, /escena 1: bloque inválido/]) expect(m).toMatch(re);
  });
  it("una escena sin voz solo vale si es silencio a propósito (el silencio también es un recurso)", () => { expect(structureErrors(edit((s) => { s[1].silent = false; })).map((e) => e.message).join()).toMatch(/escena 2: no tiene voz/); expect(structureErrors(scenes())).toEqual([]); expect(scenes().filter((s) => s.silent).length).toBe(3); });
  it("suggestSceneType clasifica por el contenido", () => {
    const b = { characters: [] as string[], shot: "medium" as const, kapPresent: false };
    expect(suggestSceneType({ ...b, visual: "Dentro del cerebro, una sala de control" })).toBe("BRAIN_VISUALIZATION"); expect(suggestSceneType({ ...b, visual: "Pantalla dividida: antes a la izquierda y después a la derecha" })).toBe("BEFORE_AFTER"); expect(suggestSceneType({ ...b, shot: "pov", visual: "Vista desde los ojos" })).toBe("POV");
    expect(suggestSceneType({ ...b, kapPresent: true, characters: ["KAP"], visual: "KAP mira a cámara y presenta" })).toBe("KAP_PRESENTADOR"); expect(suggestSceneType({ ...b, kapPresent: true, characters: ["KAP"], visual: "KAP camina por la calle" })).toBe("KAP_EXAMPLE"); expect(suggestSceneType({ ...b, kapPresent: true, characters: ["KAP"], visual: "Su expresión cambia y levanta las cejas" })).toBe("REACTION");
  });
  it("la duración de la voz sale de las palabras", () => { expect(speechSeconds("¿Cuántas veces cambias lo que dices… para gustarle a alguien?")).toBeGreaterThan(3.5); expect(speechSeconds("")).toBe(0); });
});

describe("regla de aparición de KAP: protagonista, pero no «porque toca»", () => {
  it("en la demo KAP es el hilo conductor y cada aparición declara razón, qué hace y qué aporta", () => { const k = scenes().filter((s) => s.kapPresent); expect(k.length).toBeGreaterThanOrEqual(8); expect(kapIssues(scenes())).toEqual([]); expect(new Set(k.map((s) => s.kapReason)).size).toBeGreaterThanOrEqual(5); expect([...KAP_REASONS]).toEqual(["opinion", "reaccion", "humor", "explicacion", "transicion", "hook", "cierre", "ejemplo", "decision"]); });
  it("sin razón, razón inválida, sin explicar por qué ni qué aporta: se elimina la aparición", () => {
    expect(ids(kapIssues(edit((s) => { s[5].kapReason = undefined; })))).toContain("kap-sin-razon"); expect(ids(kapIssues(edit((s) => { (s[5] as { kapReason: string }).kapReason = "relleno"; })))).toContain("kap-sin-razon");
    expect(kapIssues(edit((s) => { s[5].kapWhy = "sí"; })).map((e) => e.message).join()).toMatch(/no explica por qué/); expect(ids(kapIssues(edit((s) => { s[5].kapAdds = ""; })))).toContain("kap-sin-aportar");
  });
  it("coherencia: KAP en los personajes ⇔ kapPresent; KAP_PRESENTADOR y KAP_EXAMPLE llevan KAP; KAP_PRESENTADOR habla; «hook» solo al principio y «cierre» al final", () => {
    expect(ids(kapIssues(edit((s) => { s[1].characters = []; })))).toContain("kap-incoherente"); expect(ids(kapIssues(edit((s) => { s[1].kapPresent = false; })))).toContain("kap-incoherente");
    expect(kapIssues(edit((s) => { s[0].dialogue = ""; })).map((e) => e.message).join()).toMatch(/sin frase de KAP/); expect(ids(kapIssues(edit((s) => { s[5].kapReason = "hook"; })))).toContain("kap-razon-fuera-de-sitio"); expect(ids(kapIssues(edit((s) => { s[5].kapReason = "cierre"; })))).toContain("kap-razon-fuera-de-sitio");
  });
  it("los errores de KAP bloquean la estructura", () => { expect(structureErrors(edit((s) => { s[5].kapAdds = ""; })).some((e) => e.id === "kap-sin-aportar")).toBe(true); });
});

describe("matiz: KAP es el hilo conductor sin estar físicamente en todas las escenas", () => {
  it("una escena sin KAP vale si la imagen representa lo que él vive (plano subjetivo, metáfora, consecuencia); la demo lo hace en la escena 5", () => {
    const s = scenes()[4]; expect(s.kapPresent).toBe(false); expect(onKapThread(s)).toBe(true); expect(structureErrors(scenes())).toEqual([]); expect(visualRhythmCheck(scenes())).toEqual([]);
  });
  it("sin KAP y sin explicar qué representa de lo que vive, la escena no sigue el hilo; tres seguidas avisan «se pierde el hilo»", () => {
    const lost = edit((s) => { for (const i of [3, 4, 5]) { s[i].kapPresent = false; s[i].characters = []; s[i].kapExperience = undefined; s[i].sceneType = "ENVIRONMENT"; } }); expect(onKapThread(lost[4])).toBe(false); expect(ids(visualRhythmCheck(lost))).toContain("kap-ausente");
    const kept = edit((s) => { for (const i of [3, 4, 5]) { s[i].kapPresent = false; s[i].characters = []; s[i].kapExperience = "La imagen muestra lo que KAP siente en ese momento."; s[i].sceneType = i === 3 ? "POV" : i === 4 ? "VISUAL_METAPHOR" : "DETAIL_SHOT"; } }); expect(ids(visualRhythmCheck(kept))).not.toContain("kap-ausente");
  });
  it("el ejemplo, la estrategia y el resultado pueden contarse sin mostrar a KAP si las imágenes representan su experiencia; si no hay ni lo uno ni lo otro, no está listo", () => {
    const ok = edit((s) => { for (const x of s) if (x.block === "EJEMPLO") { x.kapPresent = false; x.characters = []; x.kapExperience = "Su cara se ve reflejada en la pantalla: es lo que KAP lee y siente."; x.sceneType = "POV"; } }); expect(ids(readinessIssues(ok))).not.toContain("listo-kap");
    const no = edit((s) => { for (const x of s) if (x.block === "EJEMPLO") { x.kapPresent = false; x.characters = []; x.kapExperience = undefined; } }); expect(ids(readinessIssues(no))).toContain("listo-kap");
  });
  it("kapExperience solo se usa cuando KAP no aparece", () => { expect(ids(kapIssues(edit((s) => { s[0].kapExperience = "Algo que KAP vive en pantalla."; })))).toContain("kap-incoherente"); });
});

describe("«¿Qué le pasa a KAP y qué hace diferente después de entenderlo?»", () => {
  it("la demo responde: bloques completos y en orden, KAP viviendo el ejemplo, estrategia distinta y contraste antes/después", () => { expect(readinessIssues(scenes())).toEqual([]); });
  it("sin respuesta clara el Short NO está listo: bloque ausente, desordenado, sin KAP en el ejemplo, estrategia repetida o sin contraste", () => {
    expect(readinessIssues(scenes().filter((s) => s.block !== "CONSECUENCIA")).map((i) => i.message).join()).toMatch(/falta el bloque CONSECUENCIA/);
    expect(ids(readinessIssues(edit((s) => { [s[3], s[7]] = [s[7], s[3]]; })))).toContain("listo-orden");
    expect(ids(readinessIssues(edit((s) => { for (const x of s) if (x.block === "EJEMPLO") { x.kapPresent = false; x.characters = []; } })))).toContain("listo-kap");
    expect(ids(readinessIssues(edit((s) => { s[7].action = s[3].action + " " + s[4].action; })))).toContain("listo-estrategia");
    expect(ids(readinessIssues(edit((s) => { for (const x of s) { if (x.sceneType === "BEFORE_AFTER") x.sceneType = "CINEMATIC_SCENE"; x.contrast = undefined; } })))).toContain("listo-contraste");
  });
});

describe("Visual Rhythm Check: avisos de calidad, no reglas rígidas", () => {
  it("la demo tiene el ritmo sano: ningún aviso", () => { expect(visualRhythmCheck(scenes())).toEqual([]); });
  it("hook lento (el primer segundo debe llamar la atención)", () => { expect(ids(visualRhythmCheck(edit((s) => { s[0].duration = 5.5; })))).toContain("hook-lento"); });
  it("escenas estáticas y KAP quieto", () => { const w = ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 3, 6]) s[i].visualAction = "KAP está sentado mirando el móvil."; }))); expect(w).toContain("escenas-estaticas"); expect(w).toContain("kap-quieto"); });
  it("demasiadas conversaciones entre personajes", () => { expect(ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 8, 9]) s[i].conversation = true; })))).toContain("demasiados-dialogos"); });
  it("KAP hablando a cámara demasiado seguido, y KAP ausente demasiado tiempo", () => {
    expect(ids(visualRhythmCheck(edit((s) => { s[1] = { ...s[5], n: 2 }; })))).toContain("kap-presentando-demasiado");
    const gone = ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 3, 4, 5]) { s[i].kapPresent = false; s[i].characters = []; s[i].kapExperience = undefined; } }))); expect(gone).toContain("kap-ausente");
  });
  it("planos iguales, demasiados primeros planos y escenarios repetidos", () => {
    expect(ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 3, 4]) s[i].shot = "medium"; })))).toContain("planos-iguales");
    expect(ids(visualRhythmCheck(edit((s) => { for (const i of [0, 2, 4, 6, 8]) s[i].shot = "close-up"; for (const i of [1, 3, 5, 7]) s[i].shot = "wide"; })))).toContain("primeros-planos");
    expect(ids(visualRhythmCheck(edit((s) => { for (const i of [1, 2, 3, 4]) s[i].location = "Dormitorio de KAP"; })))).toContain("escenarios-repetidos");
  });
  it("ausencia de acción, de contraste y de transformación durante demasiado tiempo", () => {
    const flat = edit((s) => { for (const i of [1, 2, 3, 4, 5, 6]) { s[i].sceneType = "KAP_EXAMPLE"; s[i].visual = "KAP en su cuarto con el móvil en la mano y una lámpara encendida sobre la mesa de noche."; s[i].action = "KAP está en su cuarto."; s[i].visualAction = "Plano tranquilo del cuarto."; s[i].contrast = undefined; } });
    const w = ids(visualRhythmCheck(flat)); expect(w).toContain("sin-accion-visual"); expect(w).toContain("sin-contraste"); expect(w).toContain("sin-transformacion");
  });
  it("escenas que solo ilustran literalmente la frase y explicaciones abstractas", () => {
    const lit = edit((s) => { s[3].dialogue = "KAP lee el móvil en el salón con la expresión triste."; s[3].visual = "KAP lee el móvil en el salón con la expresión triste."; s[3].visualAction = "KAP en el salón."; });
    expect(visualRhythmCheck(lit).find((x) => x.id === "ilustra-literal")?.scenes).toContain(4);
    expect(ids(visualRhythmCheck(edit((s) => { s[2].dialogue = "La sociedad actual tiene problemas de autoestima."; })))).toContain("explicacion-abstracta");
  });
  it("finales genéricos de motivación", () => { expect(ids(visualRhythmCheck(edit((s) => { s[10].dialogue = "Cree en ti y nada es imposible, tú puedes con todo."; })))).toContain("final-generico"); });
  it("poca variedad, duración de escena y total, SFX saturado", () => {
    expect(ids(visualRhythmCheck(edit((s) => { for (const x of s) if (x.sceneType !== "KAP_PRESENTADOR") x.sceneType = "KAP_EXAMPLE"; })))).toContain("poca-variedad");
    expect(ids(visualRhythmCheck(edit((s) => { s[2].duration = 9; })))).toContain("duracion-escena"); expect(ids(visualRhythmCheck(edit((s) => { s[10].duration = 6; s[10].pauseWhy = undefined; s[2].duration = 1; })))).toContain("duracion-escena");
    expect(ids(visualRhythmCheck(edit((s) => { for (const x of s) x.duration = 7; })))).toContain("duracion"); expect(ids(visualRhythmCheck(edit((s) => { s[0].duration = 1.6; })))).toContain("duracion-ajustada");
    expect(ids(visualRhythmCheck(edit((s) => { for (const x of s) x.soundEffect = "pop"; })))).toContain("sfx-saturado");
  });
  it("una pausa larga con función narrativa (pauseWhy) no se avisa", () => { expect(ids(visualRhythmCheck(scenes()))).not.toContain("duracion-escena"); expect(scenes()[10].duration).toBe(6); });
  it("son avisos: un storyboard con avisos NO deja de ser válido", () => { const s = edit((x) => { for (const i of [1, 2, 3, 4]) x[i].shot = "medium"; }); expect(visualRhythmCheck(s).length).toBeGreaterThan(0); expect(structureErrors(s)).toEqual([]); });
});
