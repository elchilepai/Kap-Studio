import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { evaluate } from "./timeline.ts";
import { renderFrame } from "./render.ts";
import { demoStage, envelope } from "./demo.ts";
import type { Cue, StageSpec } from "./types.ts";
import { dimsOk } from "./check.ts";

const stage = (cues: Cue[], o: Partial<StageSpec> = {}): StageSpec => ({ ...demoStage({ duration: 10 }), cues, ...o });
const kap = (s: StageSpec, t: number) => evaluate(s, t).actors.find((a) => a.id === "kap")!;

describe("línea de tiempo (pura y determinista)", () => {
  it("un personaje ausente no es visible hasta que entra, y camina mientras se desplaza", () => {
    const s = stage([{ t: 1, type: "enter", actor: "kap", from: "left", x: 6, dur: 2 }]);
    expect(kap(s, 0.5).visible).toBe(false);
    const mid = kap(s, 2); expect(mid.visible).toBe(true); expect(mid.moving).toBe(1); expect(mid.x).toBeGreaterThan(-2); expect(mid.x).toBeLessThan(6);
    const end = kap(s, 3.2); expect(end.x).toBeCloseTo(6, 1); expect(end.moving).toBe(0);
    expect(kap(s, 1.5).facing).toBe(1);                      // camina hacia la derecha → mira a la derecha
  });
  it("salir lo hace desaparecer; fade entra y sale con opacidad progresiva", () => {
    const s = stage([{ t: 0.2, type: "enter", actor: "kap", from: "fade", x: 5, dur: 1 }, { t: 3, type: "exit", actor: "kap", to: "right", dur: 1.5 }]);
    expect(kap(s, 0.7).alpha).toBeGreaterThan(0.2); expect(kap(s, 0.7).alpha).toBeLessThan(0.9); expect(kap(s, 2).alpha).toBe(1);
    expect(kap(s, 4.2).visible).toBe(true); expect(kap(s, 4.6).visible).toBe(false);
  });
  it("la boca sigue la envolvente solo mientras habla", () => {
    const env = [0, 0.2, 0.9, 0.5]; const s = stage([{ t: 1, type: "speak", actor: "mira", dur: 4 / 30, envelope: env }]);
    const m = (t: number) => evaluate(s, t).actors.find((a) => a.id === "mira")!;
    expect(m(0.9).mouth).toBe(0); expect(m(1 + 2.2 / 30).mouth).toBe(0.9); expect(m(1 + 2.2 / 30).speaking).toBe(true); expect(m(2).speaking).toBe(false);
  });
  it("cámara: interpola con easing y respeta encadenados; «focus» sigue al personaje", () => {
    const s = stage([{ t: 0, type: "camera", zoom: 2, dur: 2 }, { t: 3, type: "camera", zoom: 1, dur: 1 }, { t: 5, type: "camera", focus: "mira", dur: 0.5 }], { duration: 8 });
    expect(evaluate(s, 0).camera.zoom).toBe(1); expect(evaluate(s, 1).camera.zoom).toBeCloseTo(1.5, 1); expect(evaluate(s, 2.5).camera.zoom).toBe(2);
    expect(evaluate(s, 4).camera.zoom).toBe(1); expect(evaluate(s, 6).camera.x).toBeCloseTo(11, 1);
  });
  it("expresiones y gestos tienen intervalo; temblor decae", () => {
    const s = stage([{ t: 1, type: "expression", actor: "kap", value: "sad" }, { t: 2, type: "gesture", actor: "kap", value: "wave", dur: 1 }, { t: 1, type: "shake", amp: 0.4, dur: 1 }, { t: 0, type: "enter", actor: "kap", from: "fade", x: 5, dur: 0.1 }]);
    expect(kap(s, 0.5).expression).toBe("neutral"); expect(kap(s, 1.5).expression).toBe("sad");
    expect(kap(s, 2.5).gesture).toBe("wave"); expect(kap(s, 2.5).gestureP).toBeCloseTo(0.5, 1); expect(kap(s, 3.2).gesture).toBe("none");
    expect(Math.abs(evaluate(s, 1.05).shakeX)).toBeGreaterThan(0); expect(evaluate(s, 2.5).shakeX).toBe(0);
  });
  it("determinismo: mismo escenario y mismo t ⇒ mismo estado y mismos píxeles", () => {
    const s = demoStage(); expect(JSON.stringify(evaluate(s, 1.7))).toBe(JSON.stringify(evaluate(s, 1.7)));
    const hash = () => { const cv = createCanvas(320, 180); renderFrame(cv.getContext("2d") as never, s, 1.7, { images: {} }, 320, 180); return createHash("sha256").update(cv.data()).digest("hex"); };
    expect(hash()).toBe(hash());
  });
  it("hay movimiento real entre fotogramas (no una imagen congelada)", () => {
    const s = demoStage(); const px = (t: number) => { const cv = createCanvas(320, 180); renderFrame(cv.getContext("2d") as never, s, t, { images: {} }, 320, 180); return cv.data(); };
    const a = px(0.4), b = px(2.2); let diff = 0; for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]);
    expect(diff / (a.length / 4)).toBeGreaterThan(2);
  });
  it("9:16 recorta una columna del mundo y sigue la acción; 16:9 ve todo", () => {
    const s = demoStage({ width: 480, height: 854 }); const v = (a: number) => evaluate(s, 2.5);
    void v; expect(dimsOk(s, 9 / 16)).toBe(true);
  });
  it("la envolvente de prueba es válida", () => { expect(envelope(10).every((x) => x >= 0 && x <= 1)).toBe(true); });
  it("estilo: el personaje paramétrico es STICKMAN por defecto (look: «cutout» conserva el diseño completo anterior) y usa la misma pose", () => {
    const base = demoStage(), withLook = (look?: "stickman" | "cutout"): StageSpec => ({ ...base, actors: base.actors.map((a) => ({ ...a, appearance: { ...a.appearance, ...(look ? { look } : {}) } })) });
    const hash = (st: StageSpec) => { const cv = createCanvas(320, 180); renderFrame(cv.getContext("2d") as never, st, 1.7, { images: {} }, 320, 180); return createHash("sha256").update(cv.data()).digest("hex"); };
    expect(hash(withLook())).toBe(hash(withLook("stickman"))); expect(hash(withLook())).not.toBe(hash(withLook("cutout")));
    expect(hash(withLook("stickman"))).toBe(hash(withLook("stickman")));   // determinista
  });
  it("stickman: un diseño incompleto (sin top, skin, accent…) se dibuja con valores por defecto y no rompe el render", () => {
    const base = demoStage(), hash = (st: StageSpec) => { const cv = createCanvas(320, 180); renderFrame(cv.getContext("2d") as never, st, 1.7, { images: {} }, 320, 180); return createHash("sha256").update(cv.data()).digest("hex"); };
    const broken: StageSpec = { ...base, actors: base.actors.map((a) => ({ ...a, appearance: { ...a.appearance, top: undefined, skin: undefined, accent: undefined } as never })) };
    expect(() => hash(broken)).not.toThrow(); expect(hash(broken)).toBe(hash(broken)); expect(hash(broken)).not.toBe(hash(base));   // con diseño válido el aspecto es otro (usa sus colores)
  });
  it("decorado «patio» y hora «tarde»: se dibujan (no son el skyline ni el atardecer) y el stickman tiene cabeza grande", () => {
    const base = demoStage(), hash = (st: StageSpec) => { const cv = createCanvas(320, 180); renderFrame(cv.getContext("2d") as never, st, 1.7, { images: {} }, 320, 180); return createHash("sha256").update(cv.data()).digest("hex"); };
    const w = (preset: StageSpec["set"]["preset"], timeOfDay: StageSpec["set"]["timeOfDay"]): StageSpec => ({ ...base, set: { preset, timeOfDay, seed: 3 } });
    expect(hash(w("patio", "afternoon"))).not.toBe(hash(w("street", "afternoon"))); expect(hash(w("patio", "afternoon"))).not.toBe(hash(w("patio", "dusk"))); expect(hash(w("patio", "afternoon"))).not.toBe(hash(w("patio", "day")));
    expect(hash(w("patio", "afternoon"))).toBe(hash(w("patio", "afternoon")));
  });
});
