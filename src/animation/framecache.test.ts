import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createFrameCache, renderFrame } from "./render.ts";
import { direct, type DirectorInput } from "./director.ts";
import { KAP_LOOK, MIRA_LOOK } from "./demo.ts";
import type { SetSpec, StageSpec } from "./types.ts";

const mk = (W: number, H: number, o: Partial<DirectorInput> = {}, set: Partial<SetSpec> = {}, style: Partial<StageSpec["style"]> = {}): StageSpec => {
  const s = direct({ duration: 8, aspect: W / H, index: 1, fps: 30, width: W, height: H, location: "Ciudad", mood: "", tags: [], narration: "El viento cruza", style: { ink: "#0d0f14", line: 0.04, grade: "none", vignette: 0.3, shadow: true, ...style },
    characters: [{ id: "kap", name: "KAP", appearance: KAP_LOOK }, { id: "mira", name: "Mira", appearance: MIRA_LOOK }], directions: ["vfx: lluvia"],
    lines: [{ speaker: "KAP", text: "No recuerdo cómo llegué.", start: 0.3, end: 2.5 }, { speaker: "MIRA", text: "Entonces lo averiguamos.", start: 3, end: 5.2 }], ...o });
  return { ...s, set: { ...s.set, ...set } as SetSpec };
};
const px = (st: StageSpec, t: number, W: number, H: number, cache?: ReturnType<typeof createFrameCache>) => { const cv = createCanvas(W, H), c = cv.getContext("2d"); renderFrame(c as never, st, t, { images: {}, cache }, W, H); return c.getImageData(0, 0, W, H).data; };
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { let max = 0, sum = 0, sq = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; sum += d; sq += d * d; } const mse = sq / a.length; return { max, mean: sum / a.length, psnr: mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse) }; };

describe("caché de fotograma (fondo + superposición): mismo resultado que dibujar en directo", () => {
  const cases: [string, Partial<SetSpec>, Partial<StageSpec["style"]>][] = [
    ["city / noche + viñeta", { preset: "city", timeOfDay: "night" }, {}],
    ["street / atardecer + gradación + barras", { preset: "street", timeOfDay: "dusk" }, { grade: "dusk", bars: 0.08 }],
    ["forest / día", { preset: "forest", timeOfDay: "day" }, { vignette: 0 }],
    ["rooftop / atardecer", { preset: "rooftop", timeOfDay: "dusk" }, {}],
    ["room / noche", { preset: "room", timeOfDay: "night" }, { grade: "cold" }],
    ["abstract / día sin superposición", { preset: "abstract", timeOfDay: "day" }, { vignette: 0 }],
  ];
  it.each(cases)("%s: cámara fija y en movimiento", (_n, set, style) => {
    const W = 320, H = 180, st = mk(W, H, {}, set, style), cache = createFrameCache((w, h) => createCanvas(w, h) as never);
    let worst = 0, psnrMin = Infinity;
    for (let i = 0; i < 90; i += 1) {   // 3 s a 30 fps: incluye el plano fijo, el cambio de plano y el movimiento
      const t = i / 30, d = diff(px(st, t, W, H, cache), px(st, t, W, H)); worst = Math.max(worst, d.max); psnrMin = Math.min(psnrMin, d.psnr);
    }
    expect(worst).toBeLessThanOrEqual(2); expect(psnrMin).toBeGreaterThan(50);   // ≤ 2 niveles sobre 255 (redondeo del alfa al componer la viñeta como bitmap): imperceptible
    expect(cache.stats.bgHits).toBeGreaterThan(0); expect(cache.stats.bgMisses).toBeGreaterThan(0);
  });
  it("también en vertical y con la cámara siguiendo a un personaje", () => {
    const W = 180, H = 320, st = mk(W, H, { directions: ["camina: KAP a derecha"] }, { preset: "street", timeOfDay: "night" }), cache = createFrameCache((w, h) => createCanvas(w, h) as never);
    for (let i = 0; i < 75; i += 3) { const d = diff(px(st, i / 30, W, H, cache), px(st, i / 30, W, H)); expect(d.max).toBeLessThanOrEqual(2); }
  });
  it("reutiliza el fondo si la cámara no cambia y lo redibuja en cuanto cambia", () => {
    const W = 160, H = 90, st = mk(W, H, { lines: [], directions: ["plano: general"] }, { preset: "city", timeOfDay: "night" }), cache = createFrameCache((w, h) => createCanvas(w, h) as never);
    st.cues = [{ t: 0, type: "camera", x: 8, zoom: 1, dur: 0.01 }, { t: 2, type: "camera", x: 9, zoom: 1.2, dur: 1 }];
    for (const t of [0.5, 0.6, 0.7, 1.0]) px(st, t, W, H, cache); expect(cache.stats).toEqual({ bgHits: 3, bgMisses: 1 });
    px(st, 2.5, W, H, cache); expect(cache.stats.bgMisses).toBe(2);        // la cámara se movió → nuevo fondo
    px(st, 2.5, W, H, cache); expect(cache.stats.bgHits).toBe(4);          // mismo instante → reutiliza
  });
  it("si cambia la escena (otro StageSpec) se invalida la caché; no se arrastra el fondo anterior", () => {
    const W = 160, H = 90, cache = createFrameCache((w, h) => createCanvas(w, h) as never);
    const a = mk(W, H, {}, { preset: "city", timeOfDay: "night" }), b = mk(W, H, {}, { preset: "forest", timeOfDay: "day" });
    px(a, 0.5, W, H, cache); const viaCache = px(b, 0.5, W, H, cache), direct = px(b, 0.5, W, H);
    expect(diff(viaCache, direct).max).toBeLessThanOrEqual(2); expect(cache.stats.bgMisses).toBe(2);
  });
});
