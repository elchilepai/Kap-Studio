import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { renderFrame } from "./render.ts";
import { checkLayeredRig } from "./rig.ts";
import { availableAnimations, POSE_CATALOG } from "./character.ts";
import { evaluate } from "./timeline.ts";
import { demoStage, KAP_LOOK } from "./demo.ts";
import type { LayeredRig, StageSpec } from "./types.ts";

// Partes PNG sintéticas (rectángulos de color) para comprobar con píxeles dónde se dibuja y cómo gira cada una.
const part = (w: number, h: number, color: string) => { const cv = createCanvas(w, h); const c = cv.getContext("2d"); c.fillStyle = color; c.fillRect(0, 0, w, h); return cv as unknown as { width: number; height: number }; };
const images = { torso: part(120, 200, "#ff0000"), head: part(100, 100, "#00ff00"), armF: part(40, 150, "#0000ff"), legF: part(50, 200, "#ffff00") };
const rig: LayeredRig = { kind: "layered", pxPerUnit: 100, animations: ["idle", "walk", "wave"], parts: [
  { id: "torso", role: "torso", image: "torso", anchor: [60, 200], at: [0, -200], z: 1 },                       // pies en el origen: el torso sube 200 px
  { id: "legF", role: "legF", image: "legF", anchor: [25, 0], parent: "torso", at: [60, 200], z: 0 },
  { id: "head", role: "head", image: "head", anchor: [50, 100], parent: "torso", at: [60, 0], z: 2 },
  { id: "armF", role: "armF", image: "armF", anchor: [20, 10], parent: "torso", at: [110, 15], z: 3 },
] };
const stageWith = (cues: StageSpec["cues"], o: Partial<StageSpec> = {}): StageSpec => ({ ...demoStage({ duration: 4, width: 400, height: 400 }), props: [], set: { preset: "abstract", timeOfDay: "day", seed: 1 }, style: { ink: "#000000", line: 0.04, grade: "none", vignette: 0, shadow: false },
  actors: [{ id: "a", name: "A", appearance: { ...KAP_LOOK, rig, height: 1 }, slot: 8, facing: 1, presentAtStart: true }], cues: [{ t: 0, type: "camera", zoom: 1.5, x: 8, y: 5.5, dur: 0.01 }, ...cues], ...o });
const px = (s: StageSpec, t: number, x: number, y: number) => { const cv = createCanvas(400, 400); const c = cv.getContext("2d"); renderFrame(c as never, s, t, { images }, 400, 400); const d = c.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
const dominant = (rgb: number[]) => (rgb[0] > 200 && rgb[1] < 60 && rgb[2] < 60 ? "rojo" : rgb[1] > 200 && rgb[0] < 60 ? "verde" : rgb[2] > 200 && rgb[0] < 60 ? "azul" : rgb[0] > 200 && rgb[1] > 200 && rgb[2] < 60 ? "amarillo" : "otro");

describe("rig por capas (PNG propios)", () => {
  it("dibuja cada parte en su sitio: torso, cabeza encima, pierna debajo", () => {
    const s = stageWith([]);                                  // escala: zoom 1,5 → 400px/6 unidades = 66,7 px/unidad; pies en (200, ~?)
    const found = new Set<string>(); for (let y = 20; y < 400; y += 6) for (const x of [170, 200, 230]) found.add(dominant(px(s, 0.5, x, y)));
    expect(found.has("rojo")).toBe(true); expect(found.has("verde")).toBe(true); expect(found.has("amarillo")).toBe(true); expect(found.has("azul")).toBe(true);
  });
  it("la cabeza queda por encima del torso y la pierna por debajo (orden vertical)", () => {
    const s = stageWith([]); const first = (c: string) => { for (let y = 0; y < 400; y++) for (const x of [170, 185, 200, 215, 230]) if (dominant(px(s, 0.5, x, y)) === c) return y; return -1; };
    expect(first("verde")).toBeLessThan(first("rojo")); expect(first("rojo")).toBeLessThan(first("amarillo"));
  });
  it("el brazo gira sobre su punto de giro al gesticular (cambia de posición)", () => {
    const rest = stageWith([]), up = stageWith([{ t: 0, type: "gesture", actor: "a", value: "raise", dur: 3 }]);
    const count = (s: StageSpec, t: number) => { let n = 0; const cv = createCanvas(400, 400); const c = cv.getContext("2d"); renderFrame(c as never, s, t, { images }, 400, 400); const d = c.getImageData(0, 0, 400, 400).data; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 200 && d[i] < 60) n++; return n; };
    const a = count(rest, 1.5), b = count(up, 1.5); expect(a).toBeGreaterThan(200); expect(b).toBeGreaterThan(200);   // el brazo sigue dibujándose entero
    const where = (s: StageSpec) => { const cv = createCanvas(400, 400); const c = cv.getContext("2d"); renderFrame(c as never, s, 1.5, { images }, 400, 400); const d = c.getImageData(0, 0, 400, 400).data; let sy = 0, k = 0; for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) { const i = (y * 400 + x) * 4; if (d[i + 2] > 200 && d[i] < 60) { sy += y; k++; } } return sy / k; };
    expect(where(up)).toBeLessThan(where(rest) - 20);          // levantar el brazo sube su centro de masas
  });
  it("hereda la rotación del padre: inclinar el torso (caminar) mueve la cabeza", () => {
    const still = stageWith([]), walk = stageWith([{ t: 0, type: "move", actor: "a", x: 12, dur: 4 }]);
    const headX = (s: StageSpec) => { const cv = createCanvas(400, 400); const c = cv.getContext("2d"); renderFrame(c as never, s, 1.2, { images }, 400, 400); const d = c.getImageData(0, 0, 400, 400).data; let sx = 0, k = 0; for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) { const i = (y * 400 + x) * 4; if (d[i + 1] > 200 && d[i] < 60) { sx += x; k++; } } return k ? sx / k : -1; };
    expect(headX(still)).toBeGreaterThan(0); expect(headX(walk)).toBeGreaterThan(0);
  });
  it("el espejo: mirar a la izquierda refleja el personaje", () => {
    const right = stageWith([]), left = stageWith([{ t: 0, type: "face", actor: "a", dir: "left" }]);
    const armX = (s: StageSpec) => { const cv = createCanvas(400, 400); const c = cv.getContext("2d"); renderFrame(c as never, s, 0.5, { images }, 400, 400); const d = c.getImageData(0, 0, 400, 400).data; let sx = 0, k = 0; for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) { const i = (y * 400 + x) * 4; if (d[i + 2] > 200 && d[i] < 60) { sx += x; k++; } } return sx / k; };
    expect(armX(left)).toBeLessThan(200); expect(armX(right)).toBeGreaterThan(200);
  });
  it("un recurso que falta no rompe el dibujo (simplemente no se pinta esa parte)", () => {
    const cv = createCanvas(200, 200); const c = cv.getContext("2d"); expect(() => renderFrame(c as never, stageWith([]), 0.5, { images: {} }, 200, 200)).not.toThrow();
  });
});

describe("validación del rig importado", () => {
  const known = (id: string) => (id in images ? { width: (images as Record<string, { width: number }>)[id].width, height: (images as Record<string, { height: number }>)[id].height } : undefined);
  it("acepta un rig correcto", () => { expect(checkLayeredRig(rig, known)).toEqual([]); });
  it("explica TODO lo que está mal", () => {
    const bad = checkLayeredRig({ ...rig, pxPerUnit: 0, parts: [{ id: "x", role: "arm", image: "nada", anchor: [9999, 5], parent: "fantasma", z: 0 }, { id: "x", role: "leg", image: "head", anchor: [1, 1], z: 0 }, { id: "y", role: "extra", image: "head", anchor: [9999, 5], z: 0 }] }, known).join(" | ");
    for (const m of ["pxPerUnit", "torso", "head", "repetidos", "recurso inexistente", "fuera de su imagen", "padre inexistente"]) expect(bad).toContain(m);
  });
  it("detecta ciclos de padres", () => {
    const cyc: LayeredRig = { ...rig, parts: [...rig.parts.filter((p) => p.id !== "armF"), { id: "a1", role: "extra", image: "armF", anchor: [1, 1], parent: "a2", z: 0 }, { id: "a2", role: "extra", image: "armF", anchor: [1, 1], parent: "a1", z: 0 }] };
    expect(checkLayeredRig(cyc, known).join(" ")).toContain("Ciclo");
  });
});

describe("catálogo de poses y animaciones", () => {
  it("cada pose del vocabulario existe y es alcanzable; el vector declara todas las animaciones", () => {
    for (const p of ["idle", "arms_crossed", "hands_hips", "pointing", "thinking", "facepalm", "cheer", "shrug"]) expect(p in POSE_CATALOG).toBe(true);
    expect(availableAnimations(KAP_LOOK)).toEqual(expect.arrayContaining(["walk", "wave", "arms_crossed", "cheer"])); expect(availableAnimations({ ...KAP_LOOK, rig })).toEqual(["idle", "walk", "wave"]);
  });
  it("las poses se mezclan con suavidad (no saltan) y se mantienen hasta cambiarlas", () => {
    const s = { ...demoStage({ duration: 6 }), cues: [{ t: 1, type: "pose", actor: "kap", value: "cheer" } as const, { t: 1, type: "enter", actor: "kap", from: "fade", x: 5, dur: 0.01 } as const] };
    const a = evaluate(s, 1.05).actors.find((x) => x.id === "kap")!, b = evaluate(s, 1.4).actors.find((x) => x.id === "kap")!, c = evaluate(s, 5).actors.find((x) => x.id === "kap")!;
    expect(a.pose).toBe("cheer"); expect(a.poseP).toBeLessThan(0.3); expect(b.poseP).toBe(1); expect(c.pose).toBe("cheer");
  });
});
