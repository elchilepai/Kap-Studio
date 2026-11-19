import { describe, expect, it } from "vitest";
import { checkRhyme, firstInterventionOf, rhymeKey, rhymes, segments } from "./rhyme.ts";

const ctx = ["KAP mira la puerta de casa", "Casa de KAP", "zapato roto en el recreo"];
describe("validación fonética básica de la rima", () => {
  it("rima consonante, asonante y palabras que NO riman", () => {
    expect(rhymes("puerta", "abierta")).toBe("consonante"); expect(rhymes("canción", "pasión")).toBe("consonante"); expect(rhymes("zapato", "rato")).toBe("consonante"); expect(rhymes("cuaderno", "invierno")).toBe("consonante"); expect(rhymes("sol", "farol")).toBe("consonante");
    expect(rhymes("pelo", "cielo")).toBe("consonante"); expect(rhymes("roto", "loco")).toBe("asonante"); expect(rhymes("calle", "baile")).toBe("asonante");
    expect(rhymes("roto", "listo")).toBeUndefined(); expect(rhymes("casa", "pan")).toBeUndefined(); expect(rhymes("puerta", "puerta")).toBeUndefined();   // la misma palabra no es rima
  });
  it("la clave de rima respeta la sílaba tónica (acento escrito y palabras llanas/agudas)", () => {
    expect(rhymeKey("canción")?.cons).toBe("on"); expect(rhymeKey("puerta")?.cons).toBe("erta"); expect(rhymeKey("hablar")?.cons).toBe("ar"); expect(rhymeKey("zapato")?.cons).toBe("ato"); expect(rhymeKey("a")).toBeUndefined();
  });
  it("los segmentos cantables salen de comas, barras, saltos y pausas", () => {
    expect(segments(["Zapato roto / pero sigo, sin freno", "ya me voy"])).toEqual(["Zapato roto", "pero sigo", "sin freno", "ya me voy"]); expect(segments(["Hola"])).toEqual([]);
  });
  it("una rima de niño, torpe pero con ritmo y nacida de la escena, es válida", () => {
    const r = checkRhyme({ lines: ["Cierro la puerta, la noche está abierta, y en esta casa nadie me despierta"], contextTerms: ctx });
    expect(r).toMatchObject({ rhyme_valid: true, exists: true, phonetic: true, contextual: true, natural: true, nonGeneric: true, chileanOk: true, level: "consonante" }); expect(r.pairs.length).toBeGreaterThan(0);
  });
  it("sin segmentos rimables no hay rima", () => { const r = checkRhyme({ lines: ["Tengo hambre"], contextTerms: ctx }); expect(r).toMatchObject({ rhyme_valid: false, exists: false }); expect(checkRhyme({ lines: [], contextTerms: ctx }).exists).toBe(false); });
  it("versos que no riman fallan la similitud fonética", () => { const r = checkRhyme({ lines: ["Miro la puerta de la casa, siento el frío en la mesa vieja"], contextTerms: ctx }); expect(r.phonetic).toBe(false); expect(r.reasons.join(" ")).toMatch(/no riman/); });
  it("rima contextual: la misma rima NO sirve si cambia la situación (sin relación con la escena)", () => {
    const line = ["Cierro la puerta, la noche está abierta, y en esta casa nadie me despierta"]; expect(checkRhyme({ lines: line, contextTerms: ctx }).contextual).toBe(true);
    const other = checkRhyme({ lines: line, contextTerms: ["Dani me quita el cuaderno en el colegio", "Colegio", "los compañeros se ríen del uniforme"] }); expect(other.contextual).toBe(false); expect(other.rhyme_valid).toBe(false); expect(other.reasons.join(" ")).toMatch(/nada concreto de la escena/);
  });
  it("lemas y reflexiones de adulto no cuentan aunque rimen", () => {
    for (const t of ["Nunca te rindas, la meta está cerca, y todo se alcanza con la puerta abierta", "Mi música es mi sueño, mi voz va por la puerta, mi vida está abierta"]) { const r = checkRhyme({ lines: [t], contextTerms: ctx }); expect(r.nonGeneric).toBe(false); expect(r.rhyme_valid).toBe(false); }
  });
  it("el acento chileno es ligero: demasiados modismos fallan, uno o dos valen", () => {
    expect(checkRhyme({ lines: ["Cierro la puerta po, la noche está abierta cachai, y en la casa nadie me despierta weón, bacán"], contextTerms: ctx }).chileanOk).toBe(false);
    expect(checkRhyme({ lines: ["Cierro la puerta po, la noche está abierta, y en esta casa nadie me despierta"], contextTerms: ctx }).chileanOk).toBe(true);
  });
  it("la primera intervención de KAP son sus líneas consecutivas desde la primera vez que habla", () => {
    const lines = [{ speaker: "", text: "Amanece" }, { speaker: "KAP", text: "uno" }, { speaker: "KAP", text: "dos" }, { speaker: "Dani", text: "tres" }, { speaker: "KAP", text: "cuatro" }];
    expect(firstInterventionOf(lines)).toEqual({ index: [1, 2], texts: ["uno", "dos"] }); expect(firstInterventionOf([{ speaker: "Dani", text: "x" }])).toEqual({ index: [], texts: [] });
  });
});

describe("prioridad de la rima: naturalidad > contexto > ritmo > rima técnica", () => {
  const terms = ["KAP mira la puerta de casa", "Casa de KAP", "zapato roto en el recreo"];
  it("una rima IMPERFECTA (cercana, no consonante) pero natural y contextual PASA", () => {
    const r = checkRhyme({ lines: ["Cierro la puerta de la casa, me agarro un zapato con la mano"], contextTerms: terms });
    expect(r).toMatchObject({ rhyme_valid: true, natural: true, contextual: true, rhythm: true, phonetic: true, level: "cercana" }); expect(rhymes("casa", "mano")).toBeUndefined();   // no es consonante ni asonante
  });
  it("una rima técnicamente PERFECTA pero artificial (vocabulario de poeta, versos largos) FALLA la naturalidad", () => {
    const r = checkRhyme({ lines: ["Mi alma anhela el horizonte, la puerta del destino, y en esta casa eterna busco mi camino"], contextTerms: terms });
    expect(r.level).toBe("consonante"); expect(r.contextual).toBe(true); expect(r.natural).toBe(false); expect(r.rhyme_valid).toBe(false); expect(r.reasons[0]).toMatch(/poema de adulto/);   // la técnica no compensa la naturalidad
  });
  it("KAP no debe sonar como adulto por intentar rimar: lemas, «mi sueño», «el futuro» o «destino» invalidan aunque rimen perfecto", () => {
    for (const t of ["Mi sueño es mi destino, nunca te rindas, yo tengo mi camino", "Voy por el futuro, cruzo la puerta, para siempre la dejo abierta", "La vida es una puerta que siempre está abierta, en casa o en la calle desierta"]) { const r = checkRhyme({ lines: [t], contextTerms: terms }); expect(r.natural, t).toBe(false); expect(r.rhyme_valid, t).toBe(false); expect(r.phonetic, t).toBe(true); }
  });
  it("las razones salen por orden de prioridad (naturalidad primero, rima técnica la última)", () => {
    const r = checkRhyme({ lines: ["Mi alma anhela el horizonte infinito, el universo entero y eterno"], contextTerms: ["una puerta"] }); expect(r.natural).toBe(false); expect(r.reasons[0]).toMatch(/poema de adulto/); expect(r.reasons.at(-1)).toMatch(/no riman/); expect(r.reasons.findIndex((x) => /nada concreto/.test(x))).toBeLessThan(r.reasons.findIndex((x) => /no riman/.test(x)));
  });
  it("sin relación con la escena falla aunque sea natural y rime", () => { const r = checkRhyme({ lines: ["Me como un helado, me subo al tejado"], contextTerms: terms }); expect(r.natural).toBe(true); expect(r.phonetic).toBe(true); expect(r.contextual).toBe(false); expect(r.rhyme_valid).toBe(false); });
  it("ritmo hip-hop: versos largos o muy desiguales fallan aunque rimen", () => {
    expect(checkRhyme({ lines: ["Cierro la puerta de esta casa tan grande y tan fría donde nadie me espera, me agarro un zapato roto con la mano"], contextTerms: terms }).rhythm).toBe(false);
    expect(checkRhyme({ lines: ["Cierro la puerta, y me quedo hoy sentado mirando por la ventana de la casa vacía, abierta"], contextTerms: terms }).rhythm).toBe(false);
  });
  it("ACENTO CHILENO ligero: un modismo natural vale; modismos de sobra o como única rima no", () => {
    expect(checkRhyme({ lines: ["Cierro la puerta po, la noche está abierta, y en esta casa nadie me despierta"], contextTerms: terms }).natural).toBe(true);
    expect(checkRhyme({ lines: ["Cierro la puerta po, la noche está abierta cachai, y en la casa nadie me despierta weón"], contextTerms: terms }).natural).toBe(false);
    const forced = checkRhyme({ lines: ["Cierro la puerta y sigo la wea, pan no hay en la casa, qué wea"], contextTerms: terms }); expect(forced.chileanOk).toBe(false); expect(forced.natural).toBe(false);
  });
  it("una rima sin ninguna aproximación sigue fallando por la rima técnica (la última prioridad también cuenta)", () => { const r = checkRhyme({ lines: ["Miro la puerta de la casa, siento el frío en la mesa vieja"], contextTerms: terms }); expect(r.level).toBe("ninguna"); expect(r.rhyme_valid).toBe(false); expect(r.reasons.join(" ")).toMatch(/no riman ni de forma aproximada/); });
});
