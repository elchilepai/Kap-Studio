import { describe, expect, it } from "vitest";
import { reviewNarrative, type NarrativeScene } from "./review.ts";

const sc = (location: string, ...lines: [string, string][]): NarrativeScene => ({ location, lines: lines.map(([speaker, text]) => ({ speaker, text })) });
const rules = (fs: ReturnType<typeof reviewNarrative>) => fs.map((f) => f.rule.replace("narrativa-", ""));

describe("revisión narrativa (heurística, avisa y no bloquea)", () => {
  const loop = "KAP camina hacia casa. La oscuridad lo acompaña, pero ahora es su aliada. Su hermano está a salvo y su sueño sigue vivo.";
  it("detecta un bucle de escenas copiadas como crítica", () => {
    const S = [sc("Calle", ["", "Empieza la noche en el barrio y KAP guarda su cuaderno."]), ...Array.from({ length: 4 }, () => sc("Calle", ["", loop], ["KAP", "No dejaré que nadie me robe lo que más quiero."]))];
    const r = reviewNarrative({ scenes: S }); expect(rules(r)).toContain("bucle"); expect(r.find((f) => f.rule === "narrativa-bucle")?.severity).toBe("error"); expect(rules(r)).toContain("escena-repetida");
  });
  it("detecta diálogos casi duplicados entre escenas distintas", () => {
    const r = reviewNarrative({ scenes: [sc("A", ["KAP", "No me hagas esto, Dani. No soy un fracasado."]), sc("B", ["Dani", "Mira lo que encontré en tu mochila vieja."]), sc("C", ["KAP", "No me hagas esto, Dani. No soy un fracasado."])] });
    expect(r.find((f) => f.rule === "narrativa-dialogo-duplicado")?.text).toMatch(/2 veces/);
  });
  it("avisa de localización estancada y de escenas fragmentadas", () => {
    const S = Array.from({ length: 14 }, (_, i) => sc("Calle de noche", ["", `KAP mira el objeto número ${i} con calma.`]));
    expect(rules(reviewNarrative({ scenes: S }))).toEqual(expect.arrayContaining(["localizacion-estancada", "escenas-fragmentadas"]));
  });
  it("personaje introducido sin función; un cameo de la memoria solo es información", () => {
    const S = [sc("A", ["KAP", "Hola"], ["Niño 1", "¡Es un perdedor!"]), sc("B", ["KAP", "Vámonos"], ["Dani", "Qué"])];
    const r = reviewNarrative({ scenes: S, knownCharacters: ["Dani"] });
    expect(r.find((f) => f.rule === "narrativa-personaje-sin-funcion" && /Niño 1/.test(f.text))?.severity).toBe("warning"); expect(r.find((f) => /Dani/.test(f.text) && f.rule === "narrativa-personaje-sin-funcion")?.severity).toBe("info");
  });
  it("gancho genérico, ausente o sin relación con el episodio", () => {
    const S = [sc("A", ["KAP", "Dame el cuaderno"])];
    expect(reviewNarrative({ scenes: S, hook: "Esto es solo el principio del camino." }).some((f) => f.rule === "narrativa-gancho-generico")).toBe(true);
    expect(reviewNarrative({ scenes: S }).some((f) => f.rule === "narrativa-gancho-generico" && /no declara gancho/.test(f.text))).toBe(true);
    expect(reviewNarrative({ scenes: S, hook: "El cuaderno de KAP aparece en la mochila de la profesora." }).some((f) => f.rule === "narrativa-gancho-generico")).toBe(false);
  });
  it("frases motivacionales repetidas y cierre moralizante", () => {
    const S = [sc("A", ["RAMIRO", "No te rindas, KAP."]), sc("B", ["RAMIRO", "Confía en ti, tú puedes."]), sc("C", ["KAP", "No me voy a rendir nunca."])];
    const r = rules(reviewNarrative({ scenes: S })); expect(r).toContain("dialogo-motivacional"); expect(r).toContain("cierre-moralizante");
  });
  it("con arco: ayuda externa que entra tras la decisión, sin conflicto declarado y poca variedad visual", () => {
    const mk = (location: string, stage: string, fn: string, ...lines: [string, string][]): NarrativeScene => ({ ...sc(location, ...lines), stage, fn, shot: "medio", time: "noche", interior: false });
    const S = [mk("Calle", "inicio", "avanzar-historia", ["KAP", "Voy a casa ya"]), mk("Calle", "problema", "avanzar-historia", ["KAP", "Es mío"], ["DANI", "Ya no"]), mk("Calle", "escalada", "avanzar-historia", ["KAP", "Dámelo"]), mk("Calle", "decision", "arco-de-kap", ["KAP", "Me voy"]),
      mk("Calle", "consecuencia", "preparar-consecuencia", ["RAMIRO", "Toma, yo lo arreglo todo"]), mk("Calle", "resolucion", "avanzar-historia", ["KAP", "Vale"]), mk("Calle", "gancho", "preparar-gancho", ["KAP", "Mañana lo verás"])];
    const r = rules(reviewNarrative({ scenes: S })); expect(r).toEqual(expect.arrayContaining(["ayuda-externa", "sin-conflicto", "poca-variedad-visual"]));
  });
  it("un episodio sano no genera críticas", () => {
    const S = [sc("Casa", ["", "Amanece y el hermano pequeño tiene hambre; la nevera está vacía."], ["HERMANO", "¿Hay pan?"]), sc("Tienda", ["KAP", "Fíame solo hoy, por favor."], ["TENDERO", "No. Primero paga la deuda."]), sc("Parque", ["KAP", "Entonces vendo mi radio, me da igual."], ["DANI", "¡Nadie te la va a comprar, pobre!"]),
      sc("Casa", ["", "Vuelve con las manos vacías y el hermano no pregunta más."])];
    expect(reviewNarrative({ scenes: S, hook: "Mañana el tendero cobrará la deuda delante de todo el barrio.", knownCharacters: ["Dani"] }).filter((f) => f.severity === "error")).toEqual([]);
  });
  it("avisa de personajes de la memoria que aparecen sin que la petición los pidiera", () => {
    const S = [sc("Casa", ["KAP", "Tengo hambre"], ["HERMANO DE KAP", "Yo también"]), sc("Calle", ["KAP", "Voy a pedir ayuda"], ["RAMIRO", "Pasa, yo me encargo"]), sc("Casa", ["RAMIRO", "Toma, ya está resuelto"])];
    const r = reviewNarrative({ scenes: S, knownCharacters: ["Ramiro", "Hermano de KAP"], allowedCharacters: ["KAP", "Hermano de KAP"] });
    expect(r.find((f) => f.rule === "narrativa-memoria-no-pedida")?.text).toMatch(/ramiro.*2 escenas/i); expect(r.some((f) => f.rule === "narrativa-memoria-no-pedida" && /HERMANO/i.test(f.text))).toBe(false);
  });
});
