import { describe, expect, it } from "vitest";
import { kapRealismCheck, type RealismScene } from "./realism.ts";

const sc = (stage: string, location: string, ...lines: [string, string][]): RealismScene => ({ location, stage, lines: lines.map(([speaker, text]) => ({ speaker, text })) });
/** Episodio de referencia que cumple las nueve comprobaciones. */
const good = (): RealismScene[] => [
  sc("inicio", "Clase", ["", "KAP esconde el cuaderno de rimas bajo la mochila cuando entra la profesora."], ["KAP", "¿Qué cuaderno? Ah, este… es de mi hermano, se lo estoy cuidando"], ["Profesora", "¿Desde cuándo cuidas cuadernos ajenos?"]),
  sc("problema", "Clase", ["Dani", "Dámelo o le cuento a toda la clase lo que escribes"], ["KAP", "¡No! Es mío, devuélvelo"], ["", "Dani agita el cuaderno por encima de su cabeza."]),
  sc("escalada", "Patio", ["", "Los compañeros hacen un corro en el patio y Dani lee en voz alta la primera página."], ["Compañero", "¿Esto es una canción? ¡Qué risa!"], ["KAP", "Pues rima mejor que tu apellido"]),
  sc("decision", "Patio", ["", "KAP agarra el cuaderno de un tirón y sale corriendo hacia el baño del patio."], ["KAP", "Voy a esconderlo en el baño, ahí no entras tú"], ["Dani", "¡Eh, vuelve aquí con el cuaderno!"]),
  sc("consecuencia", "Baño", ["", "El cuaderno cae al lavabo del baño y la tinta de las rimas se corre en el agua."], ["KAP", "No, no, no… ¡mi cuaderno!"], ["Dani", "Mira lo que has hecho, ahora sí que se lo cuento a la profesora"]),
  sc("gancho", "Pasillo", ["", "La profesora saca el cuaderno mojado del lavabo y llama a los padres de KAP desde el pasillo."], ["Profesora", "¿Y este cuaderno mojado de quién es?"]),
];
const ids = (r: ReturnType<typeof kapRealismCheck>) => r.failed;

describe("KAP_REALISM_CHECK (revisión ligera tras generar)", () => {
  it("un episodio de referencia cumple las nueve comprobaciones", () => { const r = kapRealismCheck({ scenes: good(), contextTerms: ["cuaderno de rimas", "Clase"] }); expect(r.total).toBe(9); expect(r.failed).toEqual([]); expect(r.passed).toBe(9); });
  it("1 · ¿KAP hace al menos una decisión real? No si en la escena de decisión solo piensa o duda", () => {
    const s = good(); s[3] = sc("decision", "Patio", ["", "KAP se queda mirando el suelo del patio sin saber qué hacer."], ["KAP", "No sé si sirvo para esto"]); expect(ids(kapRealismCheck({ scenes: s }))).toContain("decision-real");
  });
  it("2 · ¿la decisión produce una consecuencia? No si después no pasa nada nuevo ligado a ella", () => {
    const s = good().slice(0, 4); s.push(sc("consecuencia", "Patio", ["KAP", "Ya está"]), sc("gancho", "Patio", ["", "Suena el timbre."])); expect(ids(kapRealismCheck({ scenes: s }))).toContain("decision-con-consecuencia");
  });
  it("3 · ¿KAP explica demasiado lo que siente? Sí si varias líneas suyas explican el tema o sus emociones", () => {
    const s = good(); s[1] = sc("problema", "Clase", ["KAP", "No voy a rendirme, este es mi sueño"], ["Dani", "Dámelo o se lo cuento"]); s[2] = sc("escalada", "Patio", ["KAP", "Estoy muy asustado y me siento solo"], ["Compañero", "¿Esto es una canción?"]); expect(ids(kapRealismCheck({ scenes: s }))).toContain("kap-no-explica-de-mas");
  });
  it("4 · ¿hay frases que podría decir igualmente un adulto? Sí si varias de KAP suenan a eslogan", () => {
    const s = good(); s[1] = sc("problema", "Clase", ["KAP", "Mi voz va más allá de este mundo"], ["Dani", "Dámelo ya"]); s[2] = sc("escalada", "Patio", ["KAP", "La vida es un ritmo y yo soy el futuro"], ["Compañero", "¿Qué dices?"]); expect(ids(kapRealismCheck({ scenes: s }))).toContain("sin-frases-de-adulto");
  });
  it("5 · ¿hay una interacción que no sea de validación? No si todos los secundarios solo animan o enseñan", () => {
    const s: RealismScene[] = good().map((x) => ({ ...x, lines: x.lines.map((l) => (l.speaker && l.speaker !== "KAP" ? { ...l, text: "KAP, tienes algo especial. Yo te apoyo." } : l)) })); expect(ids(kapRealismCheck({ scenes: s }))).toContain("interaccion-sin-validacion");
  });
  it("6 · ¿el conflicto cambia algo? No si nunca hay enfrentamiento", () => {
    const s: RealismScene[] = [sc("inicio", "Casa", ["KAP", "Hola"], ["Hermano", "Hola"]), sc("problema", "Casa", ["KAP", "Qué rico el pan"], ["Hermano", "Sí, muy rico"]), sc("decision", "Casa", ["KAP", "Me voy a dormir"], ["Hermano", "Yo también"]), sc("gancho", "Casa", ["KAP", "Buenas noches"], ["Hermano", "Buenas noches"])]; expect(ids(kapRealismCheck({ scenes: s }))).toContain("conflicto-cambia-algo");
  });
  it("7 · ¿el final nace de la acción? No si es una frase de tráiler o no se apoya en lo ocurrido", () => {
    const trailer = good(); trailer[5] = sc("gancho", "Pasillo", ["", "KAP mira el horizonte."], ["KAP", "Este es mi camino"]); expect(ids(kapRealismCheck({ scenes: trailer }))).toContain("final-nace-de-la-accion");
    const loose = good(); loose[5] = sc("gancho", "Pasillo", ["", "Una paloma azul cruza volando sobre el estadio lejano esta tarde."]); expect(ids(kapRealismCheck({ scenes: loose }))).toContain("final-nace-de-la-accion");
  });
  it("8 · ¿la primera rima parece espontánea? No si es de poeta o no tiene que ver con la escena; sin rima no aplica", () => {
    const poem = good(); poem[0] = sc("inicio", "Clase", ["KAP", "Mi alma anhela el horizonte, el destino eterno, y el universo infinito me espera"], ["Profesora", "¿Qué dices?"]);
    expect(kapRealismCheck({ scenes: poem, contextTerms: ["cuaderno de rimas"] }).checks.find((c) => c.id === "primera-rima-espontanea")!.ok).toBe(false);
    const spontaneous = good(); spontaneous[0] = sc("inicio", "Clase", ["KAP", "Escondo el cuaderno, no es de nadie, lo guardo en mi mochila y nadie sabe"], ["Profesora", "¿Qué escondes?"]);
    expect(kapRealismCheck({ scenes: spontaneous, contextTerms: ["cuaderno de rimas", "Clase"] }).checks.find((c) => c.id === "primera-rima-espontanea")!.ok).toBe(true);
    const none = good(); none[0] = sc("inicio", "Clase", ["KAP", "Hola, profe"], ["Profesora", "¿Y ese cuaderno?"]); expect(kapRealismCheck({ scenes: none, contextTerms: ["Clase"] }).checks.find((c) => c.id === "primera-rima-espontanea")).toMatchObject({ ok: true });   // sin rima en la apertura: no aplica
  });
  it("9 · ¿hay escenas que se pueden eliminar sin cambiar nada? Sí si una escena repite otra", () => {
    const s = good(); s.splice(3, 0, { ...s[2] }); expect(ids(kapRealismCheck({ scenes: s }))).toContain("ninguna-escena-eliminable");
  });
});
