import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { renderFrame } from "./render.ts";
import { direct, type DirectorInput } from "./director.ts";
import { evaluate } from "./timeline.ts";
import { visibility } from "./framing.ts";
import { defaultElements } from "./sets.ts";
import { KAP_LOOK, MIRA_LOOK } from "./demo.ts";
import type { StageSpec } from "./types.ts";
import { irToScenes } from "../server/studio/interpreter.ts";

const stripe = () => { const cv = createCanvas(36, 900); const c = cv.getContext("2d"); c.fillStyle = "#ff00ff"; c.fillRect(0, 0, 36, 900); return cv as unknown as { width: number; height: number }; };
const base = (o: Partial<StageSpec> = {}): StageSpec => ({ v: 1, width: 800, height: 450, fps: 30, duration: 4, seed: 1, warnings: [], set: { preset: "abstract", timeOfDay: "day", seed: 1, elements: [], foreground: [] }, style: { ink: "#000000", line: 0.04, grade: "none", vignette: 0, shadow: false }, props: [], actors: [], cues: [{ t: 0, type: "camera", x: 9.2, zoom: 1, dur: 0.01 }], ...o });
const centroidX = (s: StageSpec, images: Record<string, unknown>) => { const cv = createCanvas(800, 450); const c = cv.getContext("2d"); renderFrame(c as never, s, 1, { images }, 800, 450); const d = c.getImageData(0, 0, 800, 450).data; let sx = 0, n = 0; for (let y = 0; y < 450; y += 3) for (let x = 0; x < 800; x++) { const i = (y * 800 + x) * 4; if (d[i] > 240 && d[i + 1] < 20 && d[i + 2] > 240) { sx += x; n++; } } return n ? sx / n : -1; };

describe("profundidad: paralaje de capas", () => {
  const images = { st: stripe() };
  const at = (depth: number) => centroidX(base({ set: { preset: "abstract", timeOfDay: "day", seed: 1, elements: [], foreground: [], layers: [{ image: "st", depth, height: 9, y: 0 }] } }), images);
  it("con la cámara desplazada, las capas lejanas se mueven MENOS y las de primer plano MÁS", () => {
    // 50 px/unidad, cámara en x=9,2: capa fija (0) → 340 px; lejana (0,8) → 388 px; primer plano (−0,5) → 310 px
    const fixed = at(0), far = at(0.8), near = at(-0.5);
    expect(fixed).toBeGreaterThan(334); expect(fixed).toBeLessThan(346);
    expect(far).toBeGreaterThan(382); expect(far).toBeLessThan(394);
    expect(near).toBeGreaterThan(304); expect(near).toBeLessThan(316);
    expect(far).toBeGreaterThan(fixed); expect(near).toBeLessThan(fixed);   // orden de profundidad coherente
  });
  it("sin movimiento de cámara, todas las capas están en su sitio (no hay desplazamiento fantasma)", () => {
    const still = (d: number) => centroidX(base({ cues: [], set: { preset: "abstract", timeOfDay: "day", seed: 1, elements: [], foreground: [], layers: [{ image: "st", depth: d, height: 9, y: 0 }] } }), images);
    expect(Math.abs(still(0) - still(0.8))).toBeLessThan(2); expect(Math.abs(still(0) - 400)).toBeLessThan(4);
  });
  it("el primer plano se dibuja DELANTE de los personajes y el fondo detrás", () => {
    const actor = { id: "k", name: "KAP", appearance: { ...KAP_LOOK, top: "#00ff00" }, slot: 8, facing: 1 as const, presentAtStart: true };
    const px = (s: StageSpec) => { const cv = createCanvas(800, 450); const c = cv.getContext("2d"); renderFrame(c as never, s, 1, { images }, 800, 450); const d = c.getImageData(0, 0, 800, 450).data; let g = 0, m = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > 200 && d[i] < 60) g++; if (d[i] > 240 && d[i + 1] < 20 && d[i + 2] > 240) m++; } return { g, m }; };
    const cover = { image: "st", depth: 0, height: 9, y: 0 };
    const behind = px(base({ cues: [], actors: [actor], set: { preset: "abstract", timeOfDay: "day", seed: 1, elements: [], foreground: [], layers: [{ ...cover, depth: 0.5 }] } })),
      front = px(base({ cues: [], actors: [actor], set: { preset: "abstract", timeOfDay: "day", seed: 1, elements: [], foreground: [], layers: [{ ...cover, depth: -0.0001 }] } }));
    expect(behind.g).toBeGreaterThan(100);                    // el personaje se ve entero con la capa DETRÁS
    expect(front.m).toBeGreaterThan(0);                       // la capa de primer plano pisa al personaje (se ve magenta encima)
  });
});

describe("elementos de escenario reutilizables", () => {
  it("los elementos por defecto de un preset son deterministas (el mismo lugar → el mismo decorado)", () => {
    expect(defaultElements("street", 42)).toEqual(defaultElements("street", 42)); expect(defaultElements("street", 42)).not.toEqual(defaultElements("street", 43));
    expect(defaultElements("abstract", 1)).toEqual({ elements: [], foreground: [] }); expect(defaultElements("forest", 7).foreground.length).toBeGreaterThan(0);
  });
  it("un elemento guardado aparece donde se colocó, y desplazarlo en x lo mueve", () => {
    const where = (x: number) => { const s = base({ cues: [], set: { preset: "abstract", timeOfDay: "day", seed: 1, elements: [{ id: "e", kind: "box", x, scale: 2, depth: 0 }], foreground: [] } }); const cv = createCanvas(800, 450); const c = cv.getContext("2d"); renderFrame(c as never, s, 1, { images: {} }, 800, 450); const d = c.getImageData(0, 0, 800, 450).data; let sx = 0, n = 0; for (let y = 0; y < 450; y += 2) for (let xx = 0; xx < 800; xx++) { const i = (y * 800 + xx) * 4; if (Math.abs(d[i] - 0x8a) < 14 && Math.abs(d[i + 1] - 0x6a) < 22 && Math.abs(d[i + 2] - 0x45) < 28) { sx += xx; n++; } } return n ? sx / n : -1; };
    const a = where(4), b = where(12); expect(a).toBeGreaterThan(0); expect(b - a).toBeGreaterThan(300);   // 8 unidades × 50 px
  });
});

describe("composición cinematográfica", () => {
  const input = (o: Partial<DirectorInput> = {}): DirectorInput => ({ duration: 12, aspect: 16 / 9, index: 0, fps: 30, width: 854, height: 480, location: "Refugio", mood: "", tags: [], narration: "", style: { ink: "#000", line: 0.04, grade: "none", vignette: 0, shadow: false },
    characters: [{ id: "k", name: "KAP", appearance: KAP_LOOK }, { id: "m", name: "Mira", appearance: MIRA_LOOK }], directions: [],
    lines: [{ speaker: "KAP", text: "Tenemos que irnos ya.", start: 0.4, end: 2.6 }, { speaker: "MIRA", text: "¿Adónde? ¡No hay nada fuera!", start: 3, end: 5.4 }, { speaker: "KAP", text: "Lo sé, pero aquí no estamos a salvo.", start: 5.8, end: 8.6 }], ...o });
  it("plano/contraplano: tras la primera intervención se CORTA (sin movimiento) entre quien habla", () => {
    const cams = direct(input()).cues.filter((c) => c.type === "camera" && (c as { focus?: string }).focus) as { dur: number; focus: string }[];
    expect(cams.map((c) => c.focus)).toEqual(["k", "m", "k"]); expect(cams[0].dur).toBeGreaterThan(0.3); expect(cams[1].dur).toBeLessThan(0.05); expect(cams[2].dur).toBeLessThan(0.05);
  });
  it("las frases emotivas (¿? ¡!) piden un plano más cerrado que las neutras", () => {
    const z = direct(input()).cues.filter((c) => c.type === "camera" && (c as { focus?: string }).focus).map((c) => (c as { zoom: number }).zoom);
    expect(z[1]).toBeGreaterThan(z[0]);
  });
  it("regla de tercios: el hablante queda en el tercio opuesto a hacia donde mira (espacio para mirar)", () => {
    const s = direct(input()); const k = (t: number) => evaluate(s, t); const kapAt = k(1.5), miraAt = k(4);
    const ax = (st: ReturnType<typeof evaluate>, id: string) => st.actors.find((a) => a.id === id)!.x;
    expect(kapAt.camera.x).toBeGreaterThan(ax(kapAt, "k"));    // KAP (a la izquierda, mira a la derecha) → la cámara va a su derecha → él queda en el tercio izquierdo
    expect(miraAt.camera.x).toBeLessThan(ax(miraAt, "m"));     // Mira (a la derecha, mira a la izquierda) → tercio derecho
  });
  it("en vertical (9:16) quien habla queda entero y nadie queda cortado por el borde", () => {
    const s = direct(input({ aspect: 9 / 16, width: 480, height: 854 })); const st = evaluate(s, 1.5); const kap = st.actors.find((a) => a.id === "k")!;
    const visW = (9 / st.camera.zoom) * (9 / 16); expect(visibility(kap.x, st.camera.x, visW)).toBe("in");
    for (const a of st.actors) expect(visibility(a.x, st.camera.x, visW)).not.toBe("cut");
  });
  it("barras cinematográficas: negras arriba y abajo y nada en el centro", () => {
    const s = base({ cues: [], style: { ink: "#000", line: 0.04, grade: "none", vignette: 0, shadow: false, bars: 0.1 } }); const cv = createCanvas(800, 450); const c = cv.getContext("2d"); renderFrame(c as never, s, 1, { images: {} }, 800, 450);
    const p = (y: number) => [...c.getImageData(400, y, 1, 1).data].slice(0, 3); expect(p(10)).toEqual([0, 0, 0]); expect(p(440)).toEqual([0, 0, 0]); expect(p(225)).not.toEqual([0, 0, 0]);
  });
});

describe("ritmo: transiciones según la escena", () => {
  const sc = (title: string, location: string, mood: string, dialog: boolean, tr?: string) => ({ title, location, mood, lines: dialog ? [{ speaker: "KAP", text: "Hola." }] : [{ text: "Narración." }], beats: [], hints: tr ? { transition: tr } : {} });
  it("cambio de lugar → fundido (a negro si es oscuro); mismo lugar con diálogo → corte; mismo lugar sin diálogo → disolución; lo fijado por el autor manda", () => {
    const ir = { v: 1 as const, warnings: [], scenes: [sc("A", "Refugio", "", true), sc("B", "Refugio", "", true), sc("C", "Azotea", "oscuro", false), sc("D", "Azotea", "oscuro", false), sc("E", "Calle", "", false), sc("F", "Calle", "", true, "slideleft")] };
    expect(irToScenes(ir, [{ id: "k", name: "KAP" }]).map((s) => s.transition)).toEqual(["fade", "cut", "fadeblack", "dissolve", "fade", "slideleft"]);
  });
});
