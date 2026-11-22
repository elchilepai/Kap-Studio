import { describe, expect, it } from "vitest";
import { claimsReport, contentWarnings } from "./shortSafety";
import { demoPack } from "./visualShort.fixture";

const withSpeech = (t: string) => { const p = demoPack(); p.scenes[2].dialogue = t; return contentWarnings(p).map((w) => w.id); };
describe("revisión de contenido del canal", () => {
  it("la demo no tiene avisos de contenido", () => { expect(contentWarnings(demoPack())).toEqual([]); });
  it("detecta coach genérico, gurú, manipulación, generalizaciones sobre hombres o mujeres y humillación", () => {
    expect(withSpeech("Cree en ti, tú puedes con todo.")).toContain("coach-generico"); expect(withSpeech("Los ricos no quieren que sepas este secreto que cambia tu vida.")).toContain("guru");
    expect(withSpeech("Aprende a manipular lo que siente para que se enamore de ti.")).toContain("manipulacion"); expect(withSpeech("Las mujeres siempre quieren lo mismo.")).toContain("generalizacion-genero");
    expect(withSpeech("Los hombres son todos iguales.")).toContain("generalizacion-genero"); expect(withSpeech("Eres un perdedor y los demás son borregos.")).toContain("humillacion");
  });
  it("revisa también los hooks y el cierre de la idea", () => { const p = demoPack(); p.hooks[1].text = "Así se consigue a mujeres sin esfuerzo: técnica para conseguir a una chica."; p.idea.closing = "Tú puedes con todo."; const w = contentWarnings(p); expect(w.some((x) => x.where === "hook 2" && x.id === "manipulacion")).toBe(true); expect(w.some((x) => x.where === "cierre de la idea")).toBe(true); });
  it("separa las afirmaciones psicológicas de las opiniones y marca cuáles verificar", () => { const r = claimsReport(demoPack().idea.claims); expect(r.facts).toHaveLength(2); expect(r.opinions).toHaveLength(1); expect(r.toVerify.map((c) => c.type)).toEqual(["fact", "fact"]); });
});
