import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { direct } from "./director";
import { renderFrame } from "./render";
import { kapAssetPath, kapAvailable, kapRig } from "./kaprig";
import { objectDefFor, objectKindFor, SUPPORTED_OBJECTS } from "../narrative/objects";
import { beatsToScenes, cameraOf, visualOf, type ShortBeat } from "../narrative/short";
import { good, INTRO, OBJETO, OUTRO } from "../narrative/short.fixture";
import fs from "node:fs";

const style = { ink: "#0d0f14", line: 0.045, grade: "none", vignette: 0.2, shadow: true, bars: 0 } as never;
const kapApp = () => ({ skin: "#fff", top: "#111", bottom: "#111", shoes: "#111", accent: "#d9a521", hairStyle: "none", hairColor: "#000", eyeColor: "#000", accessory: "none", height: 1, build: 1, rig: kapRig() }) as never;
const base = { duration: 7, tail: 0.5, aspect: 9 / 16, index: 0, fps: 30, width: 540, height: 960, mood: "tarde, interior", tags: [], narration: "", style, characters: [{ id: "k", name: "KAP", appearance: kapApp() }, { id: "h", name: "Hermano de KAP", appearance: kapApp() }] };

describe("KAP de referencia (ilustración por capas)", () => {
  it("el rig sale de la imagen de referencia: torso + cabeza, ojos/cejas por expresión y bocas por visema, con todos los ficheros", () => {
    expect(kapAvailable()).toBe(true); const rig = kapRig()!; expect(rig.parts.map((p) => p.role)).toEqual(["torso", "head"]);
    for (const e of ["neutral", "happy", "sad", "worried", "surprised", "scared", "thinking", "confused", "closed", "angry", "embarrassed"]) expect(rig.face!.eyes![e]).toBeDefined();
    for (const v of ["rest", "A", "E", "I", "O", "U"]) expect(rig.face!.mouths![v]).toBeDefined(); expect(rig.face!.restMouths!.happy).toBeDefined();
    for (const id of [...rig.parts.map((p) => p.image), ...Object.values(rig.face!.eyes!), ...Object.values(rig.face!.mouths!), ...Object.values(rig.face!.restMouths!)]) expect(fs.existsSync(kapAssetPath(id)!)).toBe(true);
  });
  it("se dibuja (misma identidad en cada plano): píxeles opacos de KAP sobre el fondo, también de frente a cámara hablando", async () => {
    const rig = kapRig()!, images: Record<string, unknown> = {}; for (const id of [...rig.parts.map((p) => p.image), ...Object.values(rig.face!.eyes!), ...Object.values(rig.face!.mouths!), ...Object.values(rig.face!.restMouths!)]) images[id] = await loadImage(kapAssetPath(id)!);
    const stage = direct({ ...base, location: "A cámara", short: true, pacing: false, characters: [base.characters[0]], directions: ["a-camara: KAP en 0.3s", "visual: ilustracion en 0.3s"], lines: [{ speaker: "KAP", text: "¿Nunca te pasa que todos avanzan menos tú?", start: 0.3, end: 4 }] } as never);
    expect(stage.set.preset).toBe("estudio"); expect(stage.cues.some((c) => c.type === "face" && c.dir === "front")).toBe(true);
    const cv = createCanvas(540, 960), ctx = cv.getContext("2d"); renderFrame(ctx as never, stage, 1.5, { images } as never, 540, 960); const px = ctx.getImageData(270, 330, 1, 1).data; expect(px[3]).toBe(255);
    const dark = ctx.getImageData(150, 420, 240, 120).data; let black = 0; for (let i = 0; i < dark.length; i += 4) if (dark[i] < 40 && dark[i + 1] < 40) black++; expect(black).toBeGreaterThan(2000);   // el hoodie negro de KAP
  });
});

describe("nivel visual por tramo (ilustración / animación limitada / acción)", () => {
  const lines = [{ text: "KAP corre hacia la puerta. KAP se agacha y recoge la lata.", start: 0.3, end: 6 }];
  const kinds = (s: ReturnType<typeof direct>) => ({ move: s.cues.filter((c) => c.type === "move"), pose: s.cues.filter((c) => c.type === "pose"), face: s.cues.filter((c) => c.type === "expression" || c.type === "face") });
  it("ilustración: ni desplazamientos ni poses (solo cámara, mirada, expresión y respiración); limitada: no corre; acción: todo", () => {
    const il = direct({ ...base, location: "Patio", short: true, pacing: false, lines, directions: ["visual: ilustracion en 0s durante 20s"] } as never), li = direct({ ...base, location: "Patio", short: true, pacing: false, lines, directions: ["visual: limitada en 0s durante 20s"] } as never), ac = direct({ ...base, location: "Patio", short: true, pacing: false, lines, directions: ["visual: accion en 0s durante 20s"] } as never);
    expect(kinds(il).move).toHaveLength(0); expect(kinds(il).pose).toHaveLength(0); expect(kinds(ac).move.length).toBeGreaterThan(0); expect(ac.cues.some((c) => c.type === "move" && c.run)).toBe(true);
    expect(li.cues.some((c) => c.type === "move")).toBe(true); expect(li.cues.some((c) => c.type === "move" && c.run)).toBe(false);
  });
  it("cada tramo tiene su nivel: la acción solo donde se pide", () => {
    const s = direct({ ...base, location: "Patio", short: true, pacing: false, lines: [{ text: "KAP se agacha y recoge la lata.", start: 0.3, end: 2.5 }, { text: "KAP corre hacia la puerta.", start: 4, end: 6.5 }], directions: ["visual: ilustracion en 0s durante 3s", "visual: accion en 3.5s durante 4s"] } as never);
    const moves = s.cues.filter((c) => c.type === "move"); expect(moves.length).toBeGreaterThan(0); expect(moves.every((c) => c.t >= 3.5)).toBe(true); expect(s.cues.filter((c) => c.type === "pose" && c.t < 3)).toHaveLength(0);   // la ilustración no se agacha; la acción sí corre
  });
});

describe("cámara y nivel visual salen del beat (separar QUÉ ocurre de CÓMO se ve)", () => {
  const b = (o: Partial<ShortBeat>): ShortBeat => ({ ...good()[2], ...o });
  it("cameraOf / visualOf: lo declarado manda; si no, se deduce del plano y de la acción", () => {
    expect(cameraOf(b({ camera: "slow-push", shot: "general" }))).toBe("slow-push"); expect(cameraOf(b({ camera: undefined, shot: "general" }))).toBe("wide"); expect(cameraOf(b({ camera: undefined, shot: "primer plano" }))).toBe("close-up"); expect(cameraOf(b({ camera: undefined, shot: "seguimiento" }))).toBe("follow");
    expect(visualOf(b({ visual: "illustration" }))).toBe("illustration"); expect(visualOf(b({ visual: undefined, action: "La torre se derrumba con estruendo.", reaction: "" }))).toBe("action"); expect(visualOf(b({ visual: undefined, action: "KAP mira el cielo con calma.", reaction: "" }))).toBe("illustration");
  });
  it("las directivas llevan la cámara con función (empuje, paneo, seguimiento, cámara fija) y el nivel visual, con su tiempo", () => {
    const g = good().map((x, i) => ({ ...x, camera: (["static", "slow-push", "follow", "close-up", "pan", "slow-pull", "reveal", "wide"] as const)[i], visual: (["illustration", "limited-animation", "limited-animation", "action", "illustration", "limited-animation", "limited-animation", "illustration"] as const)[i] }));
    const d = beatsToScenes(g, ["KAP", "Hermano de KAP"], { objeto: OBJETO, intro: INTRO, outro: OUTRO }).flatMap((s) => s.directions);
    expect(d).toContain("camara: centro en 0.3s"); expect(d.some((x) => /^camara: seguir KAP zoom 1.3 en /.test(x))).toBe(true); expect(d.some((x) => /^camara: paneo derecha en /.test(x))).toBe(true); expect(d.some((x) => /^plano: primer plano KAP/.test(x))).toBe(true);
    expect(d.filter((x) => /^visual: accion /.test(x)).length).toBe(1); expect(d.some((x) => /^visual: ilustracion /.test(x))).toBe(true); expect(d.some((x) => /^visual: limitada /.test(x))).toBe(true);
  });
  it("KAP presentador: escena a cámara con la frase de KAP, plano cerrado y nivel ilustración; el remate igual; todo entre cortes", () => {
    const sc = beatsToScenes(good(), ["KAP", "Hermano de KAP"], { objeto: OBJETO, intro: INTRO, outro: OUTRO }), a = sc[0], z = sc.at(-1)!;
    expect(a.location).toBe("A cámara"); expect(a.lines.find((l) => l.speaker === "KAP")!.text).toBe(INTRO); expect(a.directions).toContain("a-camara: KAP en 0.3s"); expect(a.directions.some((x) => /^camara: seguir KAP zoom 1\.7/.test(x))).toBe(true); expect(a.directions).toContain("visual: ilustracion en 0.3s");
    expect(z.location).toBe("A cámara"); expect(z.lines.find((l) => l.speaker === "KAP")!.text).toBe(OUTRO.texto); expect(sc.slice(1).every((s) => s.transition === "cut")).toBe(true);
  });
});

describe("objetos del Short (biblioteca cerrada: nada se queda sin dibujar)", () => {
  it("cualquier objeto declarado se reconoce o se detecta ANTES del render; el esquema solo deja elegir los dibujables", () => {
    expect(objectKindFor("bici")).toBe("bike"); expect(objectDefFor("la torre de latas")?.kind).toBe("cans"); expect(objectKindFor("monopatín")).toBe("skateboard"); expect(objectKindFor("telescopio")).toBeUndefined(); expect(SUPPORTED_OBJECTS).toContain("bicicleta");
  });
  it("KAP interactúa con el objeto: la bici aparece, KAP se sube (la bici va con él a ras de suelo) y se cae (pasa a su forma caída)", () => {
    const s = direct({ ...base, location: "Patio", short: true, pacing: false, directions: ["objeto: bicicleta"], lines: [{ text: "KAP se sube a la bicicleta y pedalea. La bici se cae contra la valla.", start: 0.3, end: 5 }] } as never);
    const kinds = s.props.map((p) => p.kind); expect(kinds).toContain("bike"); expect(kinds).toContain("bike_fallen"); expect(s.props.some((p) => p.kind === "bike" && p.ride && p.holder === "k")).toBe(true);
    expect(s.warnings.filter((w) => /objeto/.test(w))).toEqual([]); expect(direct({ ...base, location: "Patio", directions: ["objeto: telescopio"], lines: [] } as never).warnings.join(" ")).toMatch(/no sé dibujar/);
  });
  it("el estado del objeto continúa entre escenas: tras la caída, la escena siguiente lo muestra caído", () => {
    const d = beatsToScenes(good(), ["KAP", "Hermano de KAP"], { objeto: OBJETO }).map((s) => s.directions.find((x) => x.startsWith("objeto:")));
    expect(d[0]).toBe("objeto: torre de latas"); expect(d.some((x) => x === "objeto: torre de latas caido")).toBe(true);
  });
  it("al continuar de la escena anterior nadie aparece encima de otro", () => {
    const s = direct({ ...base, location: "Patio", short: true, directions: [], lines: [], startX: { kap: { x: 8, facing: 1 }, "hermano de kap": { x: 8.2, facing: -1 } } } as never);
    expect(Math.abs(s.actors[0].slot - s.actors[1].slot)).toBeGreaterThanOrEqual(1.5);
  });
});
