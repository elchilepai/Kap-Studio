import { describe, expect, it } from "vitest";
import { beatToDirection, parseDirection, type Beat } from "@/animation/beats";
import { direct } from "@/animation/director";
import { evaluate } from "@/animation/timeline";
import { KAP_LOOK, MIRA_LOOK } from "@/animation/demo";
import { validateIR } from "@/domain/screenplay";
import { createMemoryStorage } from "@/adapters/local/memory-storage";
import { irToScenes, parsedToIR, ruleInterpreter } from "./interpreter";
import { parseScript } from "./script";
import { planProduction } from "./produce";
import type { Production } from "@/domain/types";

const bible = { characters: ["KAP", "Mira"], places: ["Refugio"] };

describe("vocabulario de acciones: texto ⇄ estructura sin pérdida", () => {
  const beats: Beat[] = [
    { type: "enter", actor: "KAP", from: "left", at: 0.5, dur: 2 }, { type: "exit", actor: "Mira", to: "fade", at: 5 }, { type: "walk", actor: "KAP", to: 11 }, { type: "walk", actor: "KAP", to: "center", run: true },
    { type: "face", actor: "Mira", dir: "right" }, { type: "expression", actor: "Mira", value: "sad", at: 1 }, { type: "gesture", actor: "KAP", value: "wave", at: 2, dur: 1.5 },
    { type: "pose", actor: "KAP", value: "arms_crossed" }, { type: "camera", mode: "zoom", zoom: 1.4, dur: 2 }, { type: "camera", mode: "pan", dir: "left" }, { type: "camera", mode: "follow", actor: "KAP" },
    { type: "camera", mode: "shake", amp: 0.3 }, { type: "camera", mode: "reset" }, { type: "shot", size: "close", actor: "Mira", cut: true }, { type: "shot", size: "wide" },
    { type: "vfx", effect: "rain", intensity: 2 }, { type: "prop", kind: "lantern", action: "show", at: 1 },
  ];
  it.each(beats.map((b) => [beatToDirection(b), b] as const))("«%s» se lee igual que se escribió", (text, beat) => {
    const r = parseDirection(text); expect(r.warning).toBeUndefined(); expect(r.beat).toMatchObject(beat as object);
  });
  it("lo ininteligible produce un AVISO, nunca una acción inventada", () => {
    for (const bad of ["baila: KAP", "sin clave", "camina: KAP a ninguna parte", "gesto: KAP"]) { const r = parseDirection(bad); expect(r.beat).toBeUndefined(); expect(r.warning).toBeTruthy(); }
  });
});

describe("IR (estructura de guion): validación estricta", () => {
  const good = { v: 1, scenes: [{ title: "Refugio", location: "Refugio", mood: "tenso", lines: [{ text: "KAP despierta." }, { speaker: "Mira", text: "¿Estás bien?" }], beats: [{ type: "enter", actor: "KAP", from: "left" }, { type: "gesture", actor: "Mira", value: "wave" }], hints: {} }] };
  it("acepta una IR bien formada (como la devolvería un LLM) y detecta personajes/lugares nuevos", () => {
    const r = validateIR(good, bible); expect(r.errors).toEqual([]); expect(r.newCharacters).toEqual([]); expect(r.newPlaces).toEqual([]);
    const r2 = validateIR({ ...good, scenes: [{ ...good.scenes[0], location: "Faro", lines: [{ speaker: "Dr. Vega", text: "Hola." }] }] }, bible); expect(r2.newCharacters).toEqual(["Dr. Vega"]); expect(r2.newPlaces).toEqual(["Faro"]);
  });
  it.each([
    ["una acción inexistente", { ...good, scenes: [{ ...good.scenes[0], beats: [{ type: "teletransporta", actor: "KAP" }] }] }],
    ["un valor fuera de rango", { ...good, scenes: [{ ...good.scenes[0], beats: [{ type: "camera", mode: "zoom", zoom: 99 }] }] }],
    ["una escena sin líneas", { ...good, scenes: [{ ...good.scenes[0], lines: [] }] }],
    ["versión incorrecta", { ...good, v: 2 }], ["texto en lugar de objeto", "hola"], ["null", null],
    ["demasiadas escenas", { v: 1, scenes: Array(301).fill(good.scenes[0]) }],
  ])("rechaza %s con motivos legibles", (_n, input) => { const r = validateIR(input, bible); expect(r.ir).toBeUndefined(); expect(r.errors.length).toBeGreaterThan(0); });
  it("no deja pasar inyecciones de formato: nombres largos, textos desmesurados", () => {
    expect(validateIR({ ...good, scenes: [{ ...good.scenes[0], lines: [{ text: "x".repeat(5000) }] }] }, bible).ir).toBeUndefined();
    expect(validateIR({ ...good, scenes: [{ ...good.scenes[0], beats: [{ type: "enter", actor: "N".repeat(200), from: "left" }] }] }, bible).ir).toBeUndefined();
  });
});

describe("el intérprete por reglas produce una IR válida, y la capa de animación solo ve la IR", () => {
  const script = `# Refugio\n[entra: KAP izquierda]\n[camara: zoom 1.3 durante 2s]\nKAP despierta confuso.\nMIRA: ¿Estás bien?\n\n# Azotea\n[vfx: lluvia]\nLlueve sobre la ciudad.`;
  it("guion → IR válida → escenas con direcciones conservadas tal como las escribió el autor", async () => {
    const raw = await ruleInterpreter.interpret({ script, brief: "", characters: [{ name: "KAP" }, { name: "Mira" }], places: [] });
    const rep = validateIR(raw, bible); expect(rep.errors).toEqual([]); expect(rep.ir!.scenes).toHaveLength(2);
    expect(rep.ir!.scenes[0].beats.map((b) => b.type)).toEqual(["enter", "camera"]);
    const scenes = irToScenes(rep.ir!, [{ id: "c1", name: "KAP" }, { id: "c2", name: "Mira" }]);
    expect(scenes[0].directions).toEqual(["entra: KAP izquierda", "camara: zoom 1.3 durante 2s"]); expect(scenes[0].characterIds.sort()).toEqual(["c1", "c2"]); expect(scenes[1].directions).toEqual(["vfx: lluvia"]);
  });
  it("una IR escrita a mano (como la de un LLM) llega a la animación sin pasar por el analizador de texto", () => {
    const llm = { v: 1, scenes: [{ title: "Encuentro", location: "Puente", mood: "oscuro", lines: [{ speaker: "KAP", text: "No esperaba verte." }, { speaker: "Mira", text: "Yo tampoco." }],
      beats: [{ type: "enter", actor: "KAP", from: "left", at: 0.3 }, { type: "enter", actor: "Mira", from: "right", at: 0.6 }, { type: "pose", actor: "Mira", value: "arms_crossed", at: 2 }, { type: "shot", size: "close", actor: "KAP", at: 1 }], hints: { durationSec: 6 } }] };
    const rep = validateIR(llm, { characters: ["KAP", "Mira"], places: [] }); expect(rep.errors).toEqual([]);
    const sc = irToScenes(rep.ir!, [{ id: "k", name: "KAP" }, { id: "m", name: "Mira" }])[0];
    expect(sc.directions).toEqual(["entra: KAP izquierda en 0.3s", "entra: Mira derecha en 0.6s", "pose: Mira brazos cruzados en 2s", "plano: primer plano KAP en 1s"]); expect(sc.durationSec).toBe(6);
    const stage = direct({ duration: 6, aspect: 16 / 9, index: 0, fps: 30, width: 854, height: 480, location: sc.location, mood: sc.mood, tags: [], narration: "", style: { ink: "#000000", line: 0.04, grade: "none", vignette: 0, shadow: true },
      characters: [{ id: "k", name: "KAP", appearance: KAP_LOOK }, { id: "m", name: "Mira", appearance: MIRA_LOOK }], lines: [], directions: sc.directions });
    expect(stage.warnings).toEqual([]); expect(evaluate(stage, 0.1).actors.every((a) => !a.visible)).toBe(true); expect(evaluate(stage, 3).actors.every((a) => a.visible)).toBe(true);
    expect(evaluate(stage, 3).actors.find((a) => a.id === "m")!.pose).toBe("arms_crossed"); expect(evaluate(stage, 3).camera.zoom).toBeGreaterThan(1.3);
  });
  it("el director no conoce el texto del guion: dos orígenes distintos con las mismas acciones dan la MISMA animación", () => {
    const common = { duration: 5, aspect: 16 / 9, index: 0, fps: 30, width: 854, height: 480, location: "Refugio", mood: "", tags: [] as string[], narration: "", style: { ink: "#000000", line: 0.04, grade: "none" as const, vignette: 0, shadow: true }, characters: [{ id: "k", name: "KAP", appearance: KAP_LOOK }], lines: [] };
    const a = direct({ ...common, directions: ["entra: KAP izquierda en 0.5s", "gesto: KAP saluda en 2s"] });
    const b = direct({ ...common, directions: [], beats: [{ type: "enter", actor: "KAP", from: "left", at: 0.5 }, { type: "gesture", actor: "KAP", value: "wave", at: 2 }] });
    expect(JSON.stringify(a.cues)).toBe(JSON.stringify(b.cues));
  });
});

describe("planificación automática: personajes y escenarios nuevos se crean y se REUTILIZAN", () => {
  const prod = (script: string): Production => ({ id: "ep1", kind: "episode", number: 1, season: 1, title: "El despertar", status: "ASSETS", synopsis: "", script, scenes: [], assetIds: [], durationSec: 0, createdAt: "x", updatedAt: "x", generated: false, brief: "", cast: [], storyTime: "" } as never);
  it("crea personajes que hablan y lugares nuevos (con escenario inferido) y los reutiliza en el episodio siguiente", async () => {
    const st = createMemoryStorage();
    const r1 = await planProduction(prod("# Refugio\nMIRA: Hola.\nVEGA: Bienvenido.\n\n# Azotea de la torre\nNarración."), st, "");
    expect(r1.created.characters.sort()).toEqual(["Mira", "Vega"]); expect(r1.created.places).toEqual(["Refugio", "Azotea de la torre"]);
    const places = await st.places.list(); expect(places.find((p) => p.name === "Refugio")!.set).toMatchObject({ preset: "room" }); expect(places.find((p) => p.name === "Azotea de la torre")!.set!.preset).toBe("rooftop");
    const ids1 = (await st.characters.list()).map((c) => c.id).sort();
    const r2 = await planProduction({ ...prod("# Refugio\nMIRA: Otra vez aquí.\nVEGA: Sí."), id: "ep2" }, st, "");
    expect(r2.created).toEqual({ characters: [], places: [] }); expect((await st.characters.list()).map((c) => c.id).sort()).toEqual(ids1);   // mismos personajes, mismo escenario
    expect(r2.scenes[0].characterIds).toHaveLength(2);
  });
  it("un guion sin estructura aprovechable falla con un motivo claro", async () => {
    await expect(planProduction(prod("   "), createMemoryStorage(), "")).rejects.toThrow(/no es válida/);
  });
  it("las escenas bloqueadas por el usuario se conservan al re-planificar", async () => {
    const st = createMemoryStorage(); const p = prod("# Refugio\nKAP: Hola.\n\n# Azotea\nTexto.");
    const first = await planProduction(p, st, ""); const edited = first.scenes.map((s, i) => (i === 0 ? { ...s, locked: true, directions: ["camara: zoom 1.8"] } : s));
    const again = await planProduction({ ...p, scenes: edited }, st, ""); expect(again.scenes[0].directions).toEqual(["camara: zoom 1.8"]);
  });
});
void parsedToIR; void parseScript;
