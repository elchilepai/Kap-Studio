import { describe, expect, it } from "vitest";
import type { Character } from "@/domain/types";
import type { CharacterDesign } from "@/domain/animation";
import { CharacterDesign as DesignSchema } from "@/domain/animation";
import { ContinuityError, applyDesignChange, autoDesign, diffDesign, resolveAppearance } from "./design";
import { envelopeFromPcm } from "./lipsync";

const base: CharacterDesign = { archetype: "flat", skin: "#f1c9a5", hairStyle: "spiky", hairColor: "#2b2a33", eyeColor: "#3b6ea8", height: 1, build: 1, body: "regular", eyeStyle: "round", version: 1, changeLog: [],
  outfits: [{ id: "base", name: "Base", top: "#E9B949", bottom: "#2f3a52", shoes: "#1c1f27", accent: "#ffffff", accessory: "scarf" }] };
const chr = (design?: CharacterDesign): Character => ({ id: "c1", name: "KAP", description: "", traits: [], voiceNotes: "", referenceAssetIds: [], design });

describe("continuidad del diseño de personajes", () => {
  it("el primer diseño queda como versión 1 con su historial", () => {
    const d = applyDesignChange(chr(), base, "", "2026-01-01"); expect(d.version).toBe(1); expect(d.changeLog[0].note).toBe("Diseño inicial");
  });
  it("cambiar el aspecto base EXIGE justificación y sube la versión", () => {
    const next = { ...base, hairColor: "#ff0000" };
    expect(() => applyDesignChange(chr(base), next, "", "t")).toThrow(ContinuityError);
    expect(() => applyDesignChange(chr(base), next, "corto", "t")).toThrow(/justificación/);
    const d = applyDesignChange(chr(base), next, "Se tiñe el pelo tras el incendio del episodio 3", "t", "ep3");
    expect(d.version).toBe(2); expect(d.changeLog.at(-1)).toMatchObject({ version: 2, episodeId: "ep3" }); expect(d.hairColor).toBe("#ff0000");
  });
  it("editar o quitar una prenda ya existente también exige justificación; añadir una nueva es libre", () => {
    const edited = { ...base, outfits: [{ ...base.outfits[0], top: "#000000" }] };
    expect(() => applyDesignChange(chr(base), edited, "", "t")).toThrow(ContinuityError);
    const added = { ...base, outfits: [...base.outfits, { id: "gala", name: "Gala", top: "#111111", bottom: "#222222", shoes: "#000000", accent: "#E9B949", accessory: "none" as const }] };
    const d = applyDesignChange(chr(base), added, "", "t"); expect(d.version).toBe(1); expect(d.outfits).toHaveLength(2); expect(d.changeLog.at(-1)?.note).toMatch(/Prenda nueva: Gala/);
    expect(diffDesign(base, added).outfitsAdded).toEqual(["Gala"]);
  });
  it("sin cambios no se toca nada", () => { const d = applyDesignChange(chr(base), structuredClone(base), "", "t"); expect(d.version).toBe(1); expect(d.changeLog).toEqual([]); });
  it("la prenda del reparto cambia la ropa pero NO los rasgos: el personaje sigue siendo el mismo", () => {
    const d = { ...base, outfits: [...base.outfits, { id: "gala", name: "Gala", top: "#111111", bottom: "#222222", shoes: "#000000", accent: "#E9B949", accessory: "none" as const }] };
    const a = resolveAppearance(d), g = resolveAppearance(d, "gala");
    expect([a.skin, a.hairStyle, a.hairColor, a.eyeColor, a.height]).toEqual([g.skin, g.hairStyle, g.hairColor, g.eyeColor, g.height]); expect(a.top).not.toBe(g.top);
    expect(resolveAppearance(d, "no-existe").top).toBe(a.top);
  });
  it("el diseño provisional es determinista y válido", () => {
    expect(autoDesign("Mira")).toEqual(autoDesign("Mira")); expect(autoDesign("Mira").skin).toBeDefined(); expect(DesignSchema.safeParse(autoDesign("Mira")).success).toBe(true);
    expect(DesignSchema.safeParse({ ...base, skin: "rojo" }).success).toBe(false);
  });
});

describe("labial por amplitud del audio", () => {
  it("la boca se abre donde hay sonido y se cierra en silencio", () => {
    const rate = 8000, pcm = new Int16Array(rate * 2);                      // 2 s
    for (let i = 0; i < rate * 0.8; i++) pcm[i] = Math.round(Math.sin(i / 8) * 12000);                // habla 0-0,8 s
    for (let i = Math.round(rate * 1.2); i < rate * 1.6; i++) pcm[i] = Math.round(Math.sin(i / 5) * 6000); // habla 1,2-1,6 s
    const e = envelopeFromPcm(pcm, rate, 30); const at = (t: number) => e[Math.round(t * 30)];
    expect(e).toHaveLength(60); expect(at(0.4)).toBeGreaterThan(0.5); expect(at(1.0)).toBe(0); expect(at(1.4)).toBeGreaterThan(0.3); expect(at(1.9)).toBe(0);
    expect(e.every((x) => x >= 0 && x <= 1)).toBe(true);
  });
  it("silencio total → boca cerrada", () => { expect(envelopeFromPcm(new Int16Array(8000), 8000, 30).every((x) => x === 0)).toBe(true); });
});
