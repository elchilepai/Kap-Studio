import { describe, expect, it } from "vitest";
import { direct, resolveSet, syntheticEnvelope, type DirectorInput } from "./director.ts";
import { evaluate } from "./timeline.ts";
import { KAP_LOOK, MIRA_LOOK } from "./demo.ts";

const base = (o: Partial<DirectorInput> = {}): DirectorInput => ({
  duration: 8, aspect: 16 / 9, index: 0, fps: 30, width: 854, height: 480, location: "Refugio", mood: "", tags: [], narration: "", style: { ink: "#000000", line: 0.04, grade: "none", vignette: 0, shadow: true },
  characters: [{ id: "kap", name: "KAP", appearance: KAP_LOOK }, { id: "mira", name: "Mira", appearance: MIRA_LOOK }], lines: [], directions: [], ...o,
});
const types = (s: ReturnType<typeof direct>, t: string) => s.cues.filter((c) => c.type === t);

describe("director 2D por reglas", () => {
  it("coloca a los personajes en sus huecos y mirando entre sí", () => {
    const s = direct(base()); expect(s.actors.map((a) => a.slot)).toEqual([5.8, 10.2]); expect(s.actors.map((a) => a.facing)).toEqual([1, -1]);
    expect(direct(base({ characters: [base().characters[0]] })).actors[0].slot).toBe(8);
  });
  it("el diálogo genera boca, mirada, gestos, reacción del oyente y cámara", () => {
    const s = direct(base({ lines: [{ speaker: "MIRA", text: "¿Seguimos adelante, KAP? Todavía podemos volver.", start: 0.3, end: 3.5 }, { speaker: "KAP", text: "No. ¡Vamos!", start: 3.8, end: 5.2 }] }));
    const sp = types(s, "speak"); expect(sp).toHaveLength(2); expect(sp[0]).toMatchObject({ actor: "mira", t: 0.3 }); expect((sp[0] as { envelope: number[] }).envelope.length).toBe(Math.round(3.2 * 30));
    expect(types(s, "gesture").some((g) => (g as { actor: string }).actor === "kap" && (g as { value: string }).value === "nod")).toBe(true);   // el oyente asiente
    expect(types(s, "expression").some((e) => (e as { actor: string; value: string }).actor === "mira" && (e as { value: string }).value === "thinking")).toBe(true); // pregunta → pensativa
    expect(types(s, "camera").length).toBeGreaterThan(1);
  });
  it("usa la envolvente real del audio cuando existe", () => {
    const env = Array(30).fill(0.77); const s = direct(base({ lines: [{ speaker: "KAP", text: "Hola.", start: 0, end: 1 }], envelopes: [env] }));
    expect((types(s, "speak")[0] as { envelope: number[] }).envelope).toBe(env);
  });
  it("entiende las direcciones en español y las convierte en animación", () => {
    const s = direct(base({ directions: ["entra: KAP izquierda en 0.5s", "sale: Mira derecha en 5s", "camina: KAP a centro", "expresion: Mira triste en 1s", "gesto: KAP saluda en 2s", "camara: zoom 1.4 durante 2s", "vfx: lluvia", "aparece: linterna en 1s", "mira: KAP derecha"] }));
    expect(s.warnings).toEqual([]);
    expect(types(s, "enter")[0]).toMatchObject({ actor: "kap", from: "left", t: 0.5 }); expect(s.actors[0].presentAtStart).toBe(false);
    expect(types(s, "exit")[0]).toMatchObject({ actor: "mira", to: "right", t: 5 }); expect(types(s, "move")[0]).toMatchObject({ actor: "kap", x: 8 });
    expect(types(s, "expression").some((e) => (e as { value: string }).value === "sad")).toBe(true); expect(types(s, "gesture").some((g) => (g as { value: string }).value === "wave")).toBe(true);
    expect(types(s, "camera")[0]).toMatchObject({ zoom: 1.4, dur: 2 }); expect(types(s, "effect")[0]).toMatchObject({ effect: "rain" });
    expect(s.props[0].kind).toBe("lantern"); expect(types(s, "prop")[0]).toMatchObject({ action: "show", t: 1 });
    // y la línea de tiempo lo respeta
    expect(evaluate(s, 0.2).actors[0].visible).toBe(false); expect(evaluate(s, 1.5).actors[0].visible).toBe(true); expect(evaluate(s, 7).actors[1].visible).toBe(false);
  });
  it("avisa de lo que no entiende, sin inventar", () => {
    const s = direct(base({ directions: ["baila: KAP", "gesto: Nadie saluda", "camina: KAP a ninguna parte", "texto sin clave"] }));
    expect(s.warnings.length).toBe(4); expect(s.cues.some((c) => c.type === "move")).toBe(false);
  });
  it("sin direcciones la cámara nunca queda estática (varía por escena) y es determinista", () => {
    const cam = (i: number) => types(direct(base({ index: i })), "camera").map((c) => JSON.stringify(c)).join("|");
    expect(cam(0)).not.toBe(cam(1)); expect(cam(1)).not.toBe(cam(2)); expect(cam(0)).toBe(cam(0));
    expect(JSON.stringify(direct(base({ directions: ["gesto: KAP saluda"] })))).toBe(JSON.stringify(direct(base({ directions: ["gesto: KAP saluda"] }))));
  });
  it("la narración sugiere acciones (caminar, lluvia, trueno) cuando no hay direcciones manuales", () => {
    const s = direct(base({ narration: "KAP camina bajo la lluvia mientras se oye un trueno lejano." }));
    expect(types(s, "move")).toHaveLength(1); expect(types(s, "effect").some((e) => (e as { effect: string }).effect === "rain")).toBe(true); expect(types(s, "shake")).toHaveLength(1);
    expect(types(direct(base({ narration: "KAP camina.", directions: ["camina: KAP a derecha"] })), "move")).toHaveLength(1);   // la dirección manual manda
  });
  it("en vertical (9:16) la cámara sigue a quien habla", () => {
    const s = direct(base({ aspect: 9 / 16, width: 480, height: 854, lines: [{ speaker: "MIRA", text: "Hola.", start: 0.2, end: 1.5 }, { speaker: "KAP", text: "Adiós.", start: 2, end: 3 }] }));
    expect(types(s, "camera").filter((c) => (c as { focus?: string }).focus).map((c) => (c as { focus: string }).focus)).toEqual(["mira", "kap"]);
  });
  it("el escenario sale del lugar y del ánimo", () => {
    expect(resolveSet("Refugio", [], "").preset).toBe("room"); expect(resolveSet("Azotea de la torre", [], "").preset).toBe("rooftop"); expect(resolveSet("Calle vacía", [], "oscuro")).toMatchObject({ preset: "street", timeOfDay: "night" });
    expect(resolveSet("Lugar raro", [], "").preset).toBe("abstract"); expect(resolveSet("X", [], "", { preset: "forest", timeOfDay: "day" })).toMatchObject({ preset: "forest", timeOfDay: "day" });
  });
  it("envolvente sintética: acotada, con pausas en la puntuación y determinista", () => {
    const e = syntheticEnvelope("Hola, ¿cómo estás? Muy bien.", 3, 30); expect(e).toHaveLength(90); expect(e.every((x) => x >= 0 && x <= 1)).toBe(true);
    expect(e.some((x) => x > 0.4)).toBe(true); expect(e.some((x) => x === 0)).toBe(true); expect(syntheticEnvelope("Hola, ¿cómo estás? Muy bien.", 3, 30)).toEqual(e);
  });
});
