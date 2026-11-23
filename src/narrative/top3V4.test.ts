import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { top3Issues, totalTop3, type Top3 } from "./top3V4";

const load = (): Top3 => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "docs", "shorts-v4-top3", "storyboard.json"), "utf8"));
const ids = (t: Top3) => top3Issues(t).map((i) => i.id);
const edit = (n: number, o: Partial<Top3["escenas"][number]>): Top3 => { const t = load(); t.escenas[n - 1] = { ...t.escenas[n - 1], ...o }; return t; };

describe("TOP 3 V4: validación estructural del formato presentador", () => {
  it("el storyboard TOP 3 revisado (11 escenas, ~49,5 s) no tiene avisos", () => { expect(top3Issues(load())).toEqual([]); expect(totalTop3(load())).toBeGreaterThanOrEqual(35); expect(totalTop3(load())).toBeLessThanOrEqual(50); });
  it("exige 10-12 escenas y 35-50 s", () => { const t = load(); expect(ids({ ...t, escenas: t.escenas.slice(0, 8) })).toContain("escenas"); expect(ids(edit(11, { duracion: 20 }))).toContain("duracion"); });
  it("exige el formato HOOK → (presentación + ≥2 ejemplos) × 3 → conclusión, con KAP presentando y alternando", () => {
    expect(ids(edit(1, { kap: "no aparece (POV)" }))).toContain("formato"); expect(ids(edit(3, { bloque: "TOP 2" }))).toContain("formato"); expect(ids(edit(5, { kap: "no aparece (POV)" }))).toContain("formato"); expect(ids(edit(2, { kap: "no aparece (POV/móvil)" }))).not.toContain("formato"); expect(ids(edit(11, { kap: "aparece (viviendo la situación)" }))).toContain("formato");
    expect(ids(edit(6, { kap: "presentador" }))).toContain("variedad");   // dos presentaciones seguidas
  });
  it("valida el gancho y la voz: sin fórmulas ni vocabulario de guerra de sexos/gurú, sin hablar de KAP en tercera persona, narración que cabe en la escena", () => {
    expect(ids(edit(1, { narracion: "A veces haces cosas para caer bien y no te das cuenta de lo que pasa." }))).toEqual(expect.arrayContaining(["gancho", "contenido"])); expect(ids(edit(4, { narracion: "Los hombres de alto valor no persiguen a las mujeres, y yo tampoco." }))).toContain("contenido");
    expect(ids(edit(3, { narracion: "KAP manda un mensaje y no recibe nada de vuelta." }))).toContain("voz"); expect(ids(edit(3, { narracion: "Mando un mensaje. Nada. Lo vuelvo a mirar. Nada. Lo vuelvo a mirar otra vez y sigo sin nada." }))).toContain("voz");
  });
  it("solo permite cámara posible en CapCut y texto en pantalla breve", () => { expect(ids(edit(2, { camara: "rotate" }))).toContain("camara"); expect(ids(edit(2, { texto: "uno dos tres cuatro cinco seis siete" }))).toContain("pantalla"); });
});
