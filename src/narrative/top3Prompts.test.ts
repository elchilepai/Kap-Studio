import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { KAP_CARD, NEGATIVE_CARD, STYLE_CARD, composePrompt, promptIssues, type PromptPack } from "./top3Prompts";

const load = (): PromptPack => ({ ...JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "docs", "shorts-v4-top3", "prompts.json"), "utf8")) });
const ids = (p: PromptPack) => promptIssues(p).map((i) => i.id);
const edit = (n: number, o: Partial<PromptPack["escenas"][number]>): PromptPack => { const p = load(); p.escenas[n - 1] = { ...p.escenas[n - 1], ...o }; return p; };

describe("prompts TOP 3: imagen estática 9:16 con KAP consistente", () => {
  it("los 11 prompts del TOP 3 pasan la validación estructural", () => { expect(promptIssues(load())).toEqual([]); expect(load().escenas).toHaveLength(11); });
  it("la ficha de KAP entra solo en las escenas donde KAP aparece y contiene todos sus rasgos fijos", () => {
    for (const s of load().escenas) { const p = composePrompt(s); expect(p.includes("huge round bald white head")).toBe(s.kapPresente); if (!s.kapPresente) expect(p).toMatch(/KAP does not appear in this image/); }
    for (const t of ["round bald white head", "black oval eyes", "thick black angular eyebrows", "gold hoop", "oversized black hoodie", "gold chain", "brain-shaped pendant", "wide baggy black pants", "black-and-white low-top sneakers"]) expect(KAP_CARD).toContain(t);
  });
  it("todos incluyen estilo, 9:16, referencia de KAP y negativos, y ninguno describe animación o movimiento de cámara", () => {
    for (const s of load().escenas) { const p = composePrompt(s); expect(p).toContain(STYLE_CARD); expect(p).toContain("9:16"); expect(p).toContain("attached KAP reference image"); expect(p).toContain(NEGATIVE_CARD); }
    expect(ids(edit(3, { accion: "The camera zooms slowly into the phone screen while the thumb moves." }))).toContain("animacion");
  });
  it("incluye los campos pedidos (composición, plano, pose, expresión, entorno, luz, objetos, profundidad, acción) y falla si falta alguno", () => {
    const p = composePrompt(load().escenas[3]); for (const k of ["COMPOSITION", "SHOT AND PERSPECTIVE", "Pose:", "Expression:", "ENVIRONMENT", "LIGHTING", "OBJECTS", "DEPTH", "FROZEN ACTION", "TEXT", "FORMAT"]) expect(p).toContain(k);
    expect(ids(edit(4, { iluminacion: "dark" }))).toContain("campo"); expect(ids(edit(4, { kapPose: "" }))).toContain("kap");
  });
  it("no hay marcas ni plataformas concretas, ni exceso de texto, ni movimientos imposibles en CapCut", () => {
    expect(ids(edit(10, { objetos: "A smartphone with an Instagram notification banner and a laptop with a stopped timeline." }))).toContain("marca");
    expect(ids(edit(7, { texto: ["a", "b", "c", "d", "e", "f", "g"] }))).toContain("texto"); expect(ids(edit(2, { capcut: { movimiento: "rotate" as never, detalle: "x" } }))).toContain("camara");
    expect(load().escenas.every((s) => s.texto.length <= 6)).toBe(true);
  });
  it("el texto que aparece en cada prompt coincide exactamente con el previsto (nada inventado) y las escenas sin texto lo dicen", () => {
    for (const s of load().escenas) { const p = composePrompt(s); if (s.texto.length) for (const t of s.texto) expect(p).toContain(`"${t}"`); else expect(p).toContain("No text anywhere in the image."); }
  });
  it("los prompts de KAP presentador y de ejemplo difieren (composiciones distintas)", () => { const p = load().escenas, comps = new Set(p.map((s) => s.composicion)); expect(comps.size).toBe(11); });
});
