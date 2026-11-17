import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { direct, type DirectorInput } from "./director.ts";
import { PORTRAIT_ASPECT, renderFrame, viewFor } from "./render.ts";
import { evaluate } from "./timeline.ts";
import { KAP_LOOK, MIRA_LOOK } from "./demo.ts";
import { GROUND_Y } from "./types.ts";

const chars = [{ id: "kap", name: "KAP", appearance: KAP_LOOK }, { id: "mira", name: "Mira", appearance: MIRA_LOOK }, { id: "vega", name: "Vega", appearance: KAP_LOOK }, { id: "nico", name: "Nico", appearance: MIRA_LOOK }];
const base = (portrait: boolean, o: Partial<DirectorInput> = {}): DirectorInput => ({
  duration: 8, aspect: portrait ? 9 / 16 : 16 / 9, index: 0, fps: 30, width: portrait ? 720 : 1280, height: portrait ? 1280 : 720, location: "Calle", mood: "", tags: [], narration: "",
  style: { ink: "#000000", line: 0.04, grade: "none", vignette: 0, shadow: true }, characters: chars.slice(0, 2), lines: [], directions: [], ...o,
});

describe("formato vertical 9:16 — composición propia (no es un recorte del 16:9)", () => {
  it("16:9 no cambia: mismos huecos y misma cámara por defecto que antes", () => {
    const s = direct(base(false)); expect(s.actors.map((a) => a.slot)).toEqual([5.8, 10.2]);
    expect(direct(base(false, { characters: chars.slice(0, 3) })).actors.map((a) => a.slot)).toEqual([4.4, 8, 11.6]);
    expect(s.cues.filter((c) => c.type === "camera")).toEqual([{ t: 0, type: "camera", zoom: 1, dur: 0.01 }, { t: 0.01, type: "camera", zoom: 1.09, dur: 8, ease: "linear" }]);
  });
  it.each([1, 2, 3])("con %i personaje(s) todos caben enteros en la ventana vertical a zoom 1", (n) => {
    const s = direct(base(true, { characters: chars.slice(0, n) }));
    const v = viewFor(s, 9 / 16, evaluate(s, 1));
    for (const a of s.actors) { expect(a.slot - 0.75).toBeGreaterThan(v.cx - v.visW / 2); expect(a.slot + 0.75).toBeLessThan(v.cx + v.visW / 2); }
    if (n > 1) { const xs = s.actors.map((a) => a.slot).sort((p, q) => p - q); for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(1.3); }   // sin solaparse
  });
  it("sin diálogo la cámara se centra en el grupo y se mueve (no queda estática)", () => {
    const s = direct(base(true)); const cams = s.cues.filter((c) => c.type === "camera") as { x?: number; zoom?: number }[];
    expect(cams.length).toBeGreaterThan(1); expect(cams.every((c) => c.x === undefined || Math.abs(c.x - 8) < 0.01)).toBe(true); expect(new Set(cams.map((c) => c.zoom)).size).toBeGreaterThan(1);
  });
  it("si alguien camina, la cámara lo sigue durante todo el recorrido", () => {
    const s = direct(base(true, { directions: ["camina: KAP a derecha"] }));
    const follow = s.cues.filter((c) => c.type === "camera" && (c as { focus?: string }).focus === "kap");
    expect(follow.length).toBeGreaterThanOrEqual(3);
    for (const t of [0.5, 1.5, 2.5]) { const f = evaluate(s, t); const a = f.actors[s.actors.findIndex((x) => x.id === "kap")]; expect(Math.abs(f.camera.x - a.x)).toBeLessThan(1.6); }   // el personaje sigue dentro del plano
  });
  it("el diálogo usa plano cerrado sobre quien habla, con contraplano", () => {
    const s = direct(base(true, { lines: [{ speaker: "KAP", text: "Hola.", start: 0.3, end: 1.5 }, { speaker: "MIRA", text: "Hola, KAP.", start: 2, end: 3.2 }] }));
    const foc = s.cues.filter((c) => c.type === "camera" && (c as { focus?: string }).focus) as { focus: string; zoom: number }[];
    expect(foc.map((c) => c.focus)).toEqual(["kap", "mira"]); expect(foc.every((c) => c.zoom > 1.2)).toBe(true);
  });
  it("la escena sube en el encuadre: los pies quedan en el 55-70 % de la altura (el subtítulo cae debajo)", () => {
    const s = direct(base(true)); const v = viewFor(s, 9 / 16, evaluate(s, 0.01)); const feet = 0.5 + (GROUND_Y + 0.55 - v.cy) / v.visH;
    expect(feet).toBeGreaterThan(0.55); expect(feet).toBeLessThan(0.7);
    const land = direct(base(false)); const vl = viewFor(land, 16 / 9, evaluate(land, 0.01)); expect(vl.cy).toBe(4.5);   // en horizontal no se desplaza
    expect(9 / 16).toBeLessThan(PORTRAIT_ASPECT);
  });
  it("con una imagen de fondo no se baja la cámara (no hay más imagen debajo)", () => {
    const s = { ...direct(base(true)), set: { preset: "image" as const, timeOfDay: "day" as const, seed: 1, imageId: "x" } };
    expect(viewFor(s, 9 / 16, evaluate(s, 0.01)).cy).toBe(4.5);
  });
  it("el fotograma vertical se dibuja entero (sin franjas negras debajo del suelo)", () => {
    const s = { ...direct(base(true, { location: "Calle vacía" })), width: 360, height: 640 }; const cv = createCanvas(360, 640), c = cv.getContext("2d");
    renderFrame(c as never, s, 1, { images: {} }, 360, 640); const d = c.getImageData(0, 600, 360, 40).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 12) dark++;
    expect(dark / (d.length / 4)).toBeLessThan(0.05);
  });
});
