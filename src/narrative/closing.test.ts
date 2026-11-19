import { describe, expect, it } from "vitest";
import { closingKind, closingProblem, endingInterchangeable } from "./closing.ts";
import { episodeVariety } from "./variety.ts";

const L = (speaker: string, text: string) => ({ speaker, text });
describe("rechazo de cierres motivacionales o reflexivos", () => {
  it("detecta preguntas retóricas, reflexiones y moralejas de KAP en el cierre", () => {
    for (const t of ["¿Y si algún día no me rindo?", "¿Qué voy a hacer ahora?", "Tal vez mañana todo sea distinto", "No me voy a rendir nunca", "Hoy aprendí una lección importante", "Algo dentro de mí está cambiando"]) expect(closingProblem([L("", "Se va."), L("KAP", t)])?.reason, t).toBeTruthy();
  });
  it("un cierre de serie (gag, reacción, sorpresa, imagen, consecuencia) es válido", () => {
    for (const t of ["La radio suena sola en el mostrador.", "¡Se me cayó el pan al charco!", "Dani guarda el cuaderno en la mochila y sonríe."]) expect(closingProblem([L("", "Pasa algo."), L("KAP", t)])).toBeUndefined();
    expect(closingProblem([L("KAP", "¡No me quites mi radio!"), L("", "El tendero cierra la reja de golpe.")])).toBeUndefined();
  });
  it("solo importa lo que dice KAP al final, y devuelve la línea a reescribir", () => { const r = closingProblem([L("KAP", "x1"), L("KAP", "Tal vez algún día lo logre"), L("Dani", "Jajaja")]); expect(r?.index).toBe(1); });
  it("clasifica el tipo de cierre", () => { expect(closingKind("Nunca te rindas, tú puedes")).toBe("superacion"); expect(closingKind("Tal vez algún día")).toBe("reflexion"); expect(closingKind("La puerta se cierra sola.")).toBe("accion"); expect(closingKind("¿Quién se llevó la llave?")).toBe("pregunta"); });
});

describe("diversidad de desenlaces: ¿intercambiable con uno de los dos episodios anteriores?", () => {
  const prev = [{ hook: "Mañana la radio aparece en el colegio y nadie sabe quién la trajo", closing: "La radio suena sola en la tienda", outcome: "un gag" }, { hook: "La vecina cierra la puerta y se lleva la llave del patio", closing: "La puerta se cierra de golpe", outcome: "un problema abierto" }];
  it("mismo contenido de cierre → intercambiable", () => { const r = endingInterchangeable({ hook: "Mañana la radio aparece en el colegio y nadie sabe quién la trajo", consequence: "", closing: "La radio suena sola" }, prev); expect(r?.index).toBe(0); expect(r?.reason).toMatch(/mismo contenido/); });
  it("mismo TIPO de cierre y mismo desenlace con poco contenido en común → intercambiable", () => { const r = endingInterchangeable({ hook: "La radio vuelve a sonar en la plaza", closing: "La radio suena sola otra vez", outcome: "un gag" }, prev); expect(r?.index).toBe(0); });
  it("un desenlace distinto (otro contenido, otro tipo) no se marca", () => { expect(endingInterchangeable({ hook: "Dani descubre que el cuaderno tenía una página arrancada", consequence: "KAP discute con su hermano por la deuda", closing: "KAP rompe el recibo en pedazos?", outcome: "una discusión" }, prev)).toBeUndefined(); expect(endingInterchangeable({ hook: "x", closing: "y" }, [])).toBeUndefined(); });
});

describe("variedad espacial/temporal subordinada a la historia", () => {
  const flat = Array.from({ length: 8 }, () => ({ location: "Casa de KAP", time: "noche", interior: true }));
  it("episodio plano + el arco permite desplazarse → propone revisar SOLO beats de la segunda mitad (≤ 3)", () => { const r = episodeVariety(flat, { secondary: ["Calle"], transitions: [] }); expect(r).toMatchObject({ flat: true, allowed: true, beatsToMove: [4, 5, 6] }); expect(r.reason).toMatch(/Casa de KAP.*noche.*escenarios/); });
  it("episodio plano sin motivo declarado → se avisa pero no se fuerza ningún cambio", () => { const r = episodeVariety(flat, { secondary: [], transitions: [] }); expect(r).toMatchObject({ flat: true, allowed: false, beatsToMove: [] }); expect(episodeVariety(flat, undefined).beatsToMove).toEqual([]); });
  it("un cambio de lugar O de momento ya cuenta como variedad; los episodios cortos no se tocan", () => {
    expect(episodeVariety(flat.map((b, i) => (i > 3 ? { ...b, time: "mañana" } : b)), { secondary: ["Calle"] }).flat).toBe(false); expect(episodeVariety(flat.map((b, i) => (i > 5 ? { ...b, location: "Calle" } : b)), { secondary: ["Calle"] }).flat).toBe(false); expect(episodeVariety(flat.slice(0, 4), { secondary: ["Calle"] }).flat).toBe(false);
  });
});

describe("cierres de tráiler: el final nace de lo que acaba de ocurrir", () => {
  const L2 = (speaker: string, text: string) => ({ speaker, text });
  it("las frases de cierre de manual se detectan dichas por KAP, por otro personaje o por el narrador", () => {
    for (const [sp, t] of [["KAP", "Este es mi camino…"], ["KAP", "Nunca me rendiré."], ["", "Tu camino no será fácil."], ["Ramiro", "No será fácil, KAP."], ["", "Un nuevo desafío está a punto de comenzar."], ["KAP", "¿Qué pasará ahora?"], ["", "Su sueño acaba de comenzar."], ["", "Esto es solo el principio."]] as const) expect(closingProblem([L2("", "Se queda un rato."), L2(sp, t)])?.reason, t).toMatch(/tráiler|reflexión|pregunta|superación/);
  });
  it("un final con consecuencia, objeto, llamada o gag no se marca", () => {
    for (const t of ["Suena el teléfono: es el tendero y pregunta por la radio.", "Se le cae el pan al charco y el perro se lo lleva.", "La profesora guarda el cuaderno mojado en el cajón con llave."]) expect(closingProblem([L2("KAP", "¡No!"), L2("", t)]), t).toBeUndefined();
  });
});
