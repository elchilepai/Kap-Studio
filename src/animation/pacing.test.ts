import { describe, expect, it } from "vitest";
import { activitySpans, deadAir } from "./pacing.ts";
import type { Cue } from "./types.ts";

describe("aire muerto (pausa sin función)", () => {
  const cues: Cue[] = [{ t: 0.3, type: "speak", actor: "a", dur: 1, envelope: [] }, { t: 7, type: "move", actor: "a", x: 3, dur: 1.5 }];
  it("un tramo de ≥ 3 s sin diálogo, acción, reacción, cámara ni sonido se detecta; el resto no", () => {
    expect(deadAir(cues, 9.5)).toEqual([{ t0: 1.3, t1: 7 }]); expect(deadAir(cues, 9.5, { min: 5 })).toHaveLength(1); expect(deadAir(cues, 9.5, { min: 6 })).toEqual([]);   // el umbral manda
    expect(deadAir([...cues, { t: 3, type: "expression", actor: "a", value: "scared" }, { t: 5, type: "face", actor: "a", dir: "left" }], 9.5)).toEqual([]);   // una reacción y una mirada parten la pausa
  });
  it("una pausa con función (sonido, cámara que se acerca, mirada) NO es aire muerto; la deriva lineal de fondo sí cuenta como nada", () => {
    expect(deadAir(cues, 9.5, { sounds: [{ t: 3, kind: "ambience", dur: 2 }, { t: 5, kind: "bump" }] })).toEqual([]);
    expect(deadAir([...cues, { t: 1.5, type: "camera", focus: "a", zoom: 1.2, dur: 3, ease: "inOut" }, { t: 4.5, type: "face", actor: "a", dir: "right" }], 9.5)).toEqual([]);
    expect(deadAir([...cues, { t: 0, type: "camera", zoom: 1.1, dur: 9, ease: "linear" }], 9.5)).toHaveLength(1);   // deriva de fondo = no hay nada ocurriendo
    expect(activitySpans(cues).map((s) => s.t0)).toEqual([0.3, 7]);
  });
});
