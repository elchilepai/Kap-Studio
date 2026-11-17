import type { Appearance, StageSpec } from "./types.ts";

/** Escenarios de ejemplo para pruebas y para la vista previa del diseñador de personajes. */
export const KAP_LOOK: Appearance = { skin: "#f1c9a5", hairStyle: "spiky", hairColor: "#2b2a33", eyeColor: "#3b6ea8", top: "#E9B949", bottom: "#2f3a52", shoes: "#1c1f27", accent: "#ffffff", accessory: "scarf", height: 1, build: 1 };
export const MIRA_LOOK: Appearance = { skin: "#b9805b", hairStyle: "long", hairColor: "#4a2a1f", eyeColor: "#2f7d5b", top: "#7a4ea8", bottom: "#2d2d3a", shoes: "#e9e1d0", accent: "#E9B949", accessory: "glasses", height: 0.95, build: 0.92 };
export const envelope = (n: number) => Array.from({ length: n }, (_, i) => +(0.15 + 0.85 * Math.abs(Math.sin(i * 0.9)) * (0.6 + 0.4 * Math.sin(i * 0.31))).toFixed(2));

export function demoStage(o: { width?: number; height?: number; duration?: number; preset?: StageSpec["set"]["preset"]; timeOfDay?: StageSpec["set"]["timeOfDay"] } = {}): StageSpec {
  return {
    v: 1, width: o.width ?? 854, height: o.height ?? 480, fps: 30, duration: o.duration ?? 3, seed: 7, warnings: [],
    set: { preset: o.preset ?? "city", timeOfDay: o.timeOfDay ?? "night", seed: 3 }, style: { ink: "#0d0f14", line: 0.045, grade: "none", vignette: 0.3, shadow: true },
    props: [{ id: "lamp", kind: "lantern", x: 11.5, y: 7.6, scale: 1.2, visibleAtStart: true }],
    actors: [{ id: "kap", name: "KAP", appearance: KAP_LOOK, slot: 5, facing: 1, presentAtStart: false }, { id: "mira", name: "Mira", appearance: MIRA_LOOK, slot: 11, facing: -1, presentAtStart: true }],
    cues: [
      { t: 0.1, type: "enter", actor: "kap", from: "left", x: 5.5, dur: 1.4 }, { t: 1.6, type: "expression", actor: "kap", value: "worried" },
      { t: 1.4, type: "speak", actor: "mira", dur: 1.4, envelope: envelope(42) }, { t: 1.4, type: "gesture", actor: "mira", value: "point", dur: 1.3 },
      { t: 1.4, type: "camera", zoom: 1.25, x: 9, dur: 1 }, { t: 0.5, type: "effect", effect: "rain", dur: 2.4 },
    ],
  };
}
