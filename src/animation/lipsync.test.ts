import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { amplitudeProvider, textVisemeProvider, syntheticEnvelope } from "./lipsync.ts";
import { direct, type DirectorInput } from "./director.ts";
import { evaluate } from "./timeline.ts";
import { renderFrame } from "./render.ts";
import { KAP_LOOK } from "./demo.ts";

describe("proveedores de labial", () => {
  it("amplitud: usa el audio si existe y, si no, el ritmo del texto", () => {
    const env = [0, 0.4, 0.9]; expect(amplitudeProvider.track({ text: "Hola", durationSec: 0.1, fps: 30, audioEnvelope: env })).toEqual({ envelope: env });
    const t = amplitudeProvider.track({ text: "Hola, mundo.", durationSec: 1, fps: 30 }); expect(t.envelope).toHaveLength(30); expect(t.visemes).toBeUndefined();
    expect(t.envelope).toEqual(syntheticEnvelope("Hola, mundo.", 1, 30));
  });
  it("texto: m/b/p cierran la boca, las vocales dan su forma, la puntuación es reposo", () => {
    const t = textVisemeProvider.track({ text: "Mamá, ¿vienes?", durationSec: 2, fps: 30 }); const set = new Set(t.visemes);
    expect(t.visemes).toHaveLength(60); expect(t.envelope).toHaveLength(60); for (const v of ["MBP", "A", "FV", "E", "I", "rest"]) expect(set.has(v as never)).toBe(true);
    expect(t.visemes!.indexOf("MBP")).toBeLessThan(t.visemes!.indexOf("A"));                 // «M» antes que «a»
  });
  it("texto: con audio real NO abre la boca en los silencios", () => {
    const audio = [...Array(30).fill(0.8), ...Array(30).fill(0)]; const t = textVisemeProvider.track({ text: "Hola amigo, ¿cómo estás hoy?", durationSec: 2, fps: 30, audioEnvelope: audio });
    expect(t.visemes!.slice(35).every((v) => v === "rest")).toBe(true); expect(t.envelope.slice(35).every((x) => x === 0)).toBe(true); expect(t.visemes!.slice(0, 30).some((v) => v !== "rest")).toBe(true);
  });
  it("sin texto o solo puntuación: boca cerrada", () => { expect(textVisemeProvider.track({ text: "", durationSec: 1, fps: 30 }).envelope.every((x) => x === 0)).toBe(true); });
});

describe("el proveedor es SUSTITUIBLE: cambiarlo solo cambia la boca", () => {
  const base = (lipsync: DirectorInput["lipsync"]): DirectorInput => ({ duration: 4, aspect: 1, index: 0, fps: 30, width: 400, height: 400, location: "Refugio", mood: "", tags: [], narration: "", style: { ink: "#000", line: 0.04, grade: "none", vignette: 0, shadow: false },
    characters: [{ id: "k", name: "KAP", appearance: KAP_LOOK }], lines: [{ speaker: "KAP", text: "Mamá, ¿vienes? Quiero verte.", start: 0.2, end: 3.6 }], directions: ["camara: zoom 1.8"], lipsync });
  it("el resto de las acciones es idéntico; solo cambia la pista de la boca", () => {
    const a = direct(base(amplitudeProvider)), b = direct(base(textVisemeProvider)); const strip = (s: typeof a) => JSON.stringify(s.cues.filter((c) => c.type !== "speak"));
    expect(strip(a)).toBe(strip(b)); expect(JSON.stringify(a.cues.find((c) => c.type === "speak"))).not.toBe(JSON.stringify(b.cues.find((c) => c.type === "speak")));
    expect((b.cues.find((c) => c.type === "speak") as { visemes?: unknown[] }).visemes).toBeDefined();
  });
  it("en pantalla, los fotogramas de ambos proveedores difieren SOLO en la zona de la cabeza", () => {
    const px = (lp: DirectorInput["lipsync"], t: number) => { const s = direct(base(lp)); const cv = createCanvas(400, 400); renderFrame(cv.getContext("2d") as never, s, t, { images: {} }, 400, 400); return cv.getContext("2d").getImageData(0, 0, 400, 400).data; };
    let found = false;
    for (const t of [0.5, 0.9, 1.4, 2.0, 2.6]) {
      const A = px(amplitudeProvider, t), B = px(textVisemeProvider, t); let minY = 400, maxY = -1, n = 0;
      for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) { const i = (y * 400 + x) * 4; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) { n++; minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }
      if (n > 0) { found = true; expect(maxY - minY).toBeLessThan(120); expect(n).toBeLessThan(160000 * 0.03); }   // solo la zona de la cabeza (la boca abierta inclina un poco la cabeza), nunca el cuerpo ni la escena
    }
    expect(found).toBe(true);
  });
  it("la línea de tiempo entrega el visema de la pista cuando existe y deriva uno de la amplitud cuando no", () => {
    const a = direct(base(amplitudeProvider)), b = direct(base(textVisemeProvider));
    const seen = (s: typeof a) => new Set([0.5, 0.8, 1.1, 1.6, 2.2].map((t) => evaluate(s, t).actors[0].viseme)); expect(seen(b).size).toBeGreaterThan(1); expect([...seen(a)].every((v) => ["rest", "I", "E", "A"].includes(v))).toBe(true);
  });
});
