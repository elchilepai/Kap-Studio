import { describe, expect, it } from "vitest";
import { checkScene, gateFeedback, isBlocking, needsSceneRegen, repairLines, sceneRhyme, type GateInput } from "./gate.ts";

const L = (n: number) => String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + (Math.floor(n / 26) % 26)), w = (n: number, k: number, from = 0) => Array.from({ length: k }, (_, i) => `zo${L(n)}${L(from + i)}qu`).join(" ");
const base = (n: number, o: Partial<GateInput["scene"]> = {}): GateInput["scene"] => ({ lines: [{ speaker: "", text: w(n, 30) }, { speaker: "KAP", text: w(n, 15, 40) }, { speaker: "Dani", text: w(n, 15, 70) }], change: `Pasa ${w(n, 5, 120)}`, ...o });
const inp = (scene: GateInput["scene"], o: Partial<GateInput> = {}): GateInput => ({ scene, previous: [], speakers: ["KAP", "Dani"], memoryOutside: ["Ramiro", "Hermano de KAP"], ...o });
const prevOf = (s: GateInput["scene"]) => ({ text: s.lines.map((l) => l.text).join(" "), change: s.change, lines: s.lines.map((l) => l.text), speakers: s.lines.map((l) => l.speaker ?? "") });
const kinds = (i: GateInput) => checkScene(i).map((x) => x.kind);
const RHYME = "Cierro la puerta, la noche está abierta, y en esta casa nadie me despierta";
const ctxTerms = ["KAP mira la puerta de casa", "Casa de KAP"];

describe("puerta de calidad por escena", () => {
  it("una escena con contenido, cambio nuevo y reparto previsto pasa", () => { expect(kinds(inp(base(1), { previous: [prevOf(base(0))] }))).toEqual([]); });
  it("«¿qué ha cambiado?»: cambio vacío o igual al de otra escena bloquea (regenerar la escena)", () => {
    expect(kinds(inp(base(1, { change: "" })))).toContain("sin-cambio"); const a = base(0), b = base(1, { change: a.change });
    expect(kinds(inp(b, { previous: [prevOf(a)] }))).toContain("sin-cambio"); const r = checkScene(inp(base(1, { change: "x" }))); expect(isBlocking(r)).toBe(true); expect(needsSceneRegen(r)).toBe(true);
  });
  it("una escena sin información nueva respecto a lo ya escrito bloquea aunque declare un cambio", () => {
    const a = base(0), b = { ...base(0), change: "Pasa algo totalmente distinto declarado" }; expect(kinds(inp(b, { previous: [prevOf(a)] }))).toEqual(expect.arrayContaining(["repite-escena"]));
  });
  it("repetición de RELLENO: el mismo personaje vuelve a decir lo dicho (en otra escena o en la misma) → reparable en código", () => {
    const a = base(0), dup = base(1, { lines: [{ speaker: "KAP", text: a.lines[1].text }, { speaker: "Dani", text: w(1, 15, 70) }, { speaker: "", text: w(1, 30) }, { speaker: "KAP", text: w(1, 12, 5) }] }); const r = checkScene(inp(dup, { previous: [prevOf(a)] })); expect(r.find((x) => x.kind === "repite-frase")).toMatchObject({ scope: "repair", lines: [0] });
    const same = base(2, { lines: [{ speaker: "KAP", text: w(2, 12) }, { speaker: "Dani", text: w(2, 14, 50) }, { speaker: "KAP", text: w(2, 12) }, { speaker: "", text: w(2, 30, 90) }] }); expect(kinds(inp(same))).toContain("repite-frase");
  });
  it("repetición NECESARIA: un eco o una burla de OTRO personaje no cuenta como relleno", () => {
    const a = base(0), echo = base(1, { lines: [{ speaker: "Dani", text: a.lines[1].text }, { speaker: "KAP", text: w(1, 15, 70) }, { speaker: "", text: w(1, 30) }] }); expect(kinds(inp(echo, { previous: [prevOf(a)] }))).not.toContain("repite-frase");
    const own = base(2, { lines: [{ speaker: "KAP", text: w(2, 12) }, { speaker: "Dani", text: w(2, 12) }, { speaker: "", text: w(2, 30, 90) }] }); expect(kinds(inp(own))).not.toContain("repite-frase");
  });
  it("reparación en código: quita la frase repetida solo si la escena conserva ≥ 3 líneas y ≥ 2 voces", () => {
    const lines = [{ speaker: "KAP", text: "a b c d e" }, { speaker: "Dani", text: "f g h i j" }, { speaker: "", text: "k l m n o" }, { speaker: "KAP", text: "a b c d e" }]; const issue = [{ kind: "repite-frase" as const, blocking: true, scope: "repair" as const, text: "x", lines: [3] }];
    expect(repairLines(lines, issue)).toMatchObject({ repaired: ["repite-frase"] }); expect(repairLines(lines, issue).lines).toHaveLength(3);
    const tiny = [{ speaker: "KAP", text: "a b c d e" }, { speaker: "KAP", text: "a b c d e" }, { speaker: "KAP", text: "z y x w v" }]; expect(repairLines(tiny, [{ ...issue[0], lines: [1] }]).repaired).toEqual([]);   // quedaría 1 sola voz: no se repara en código
  });
  it("personaje de la memoria que habla sin estar en el reparto bloquea; mencionarlo sin necesidad es local (reescribir esa línea)", () => {
    const talk = base(1, { lines: [{ speaker: "Ramiro", text: w(1, 20) }, { speaker: "KAP", text: w(1, 20, 30) }, { speaker: "", text: w(1, 20, 60) }] }); const r = checkScene(inp(talk)); expect(r.find((x) => x.kind === "personaje-no-previsto")).toMatchObject({ blocking: true, scope: "scene" });
    const mention = base(1, { lines: [{ speaker: "KAP", text: `${w(1, 20)} como decía Ramiro ${w(1, 5, 30)}` }, { speaker: "Dani", text: w(1, 20, 60) }, { speaker: "", text: w(1, 25, 90) }] }); expect(checkScene(inp(mention)).find((x) => x.kind === "menciona-memoria")).toMatchObject({ blocking: false, scope: "local", lines: [0] });
  });
  it("longitud: la ÚLTIMA prioridad. Una escena corta solo avisa (info) y no entra en la regeneración", () => {
    const short = base(1, { lines: [{ speaker: "KAP", text: "No quiero" }, { speaker: "Dani", text: "Pues vete" }, { speaker: "", text: "Se va" }] }); const r = checkScene(inp(short)); expect(r.find((x) => x.kind === "corta")).toMatchObject({ blocking: false, scope: "info" }); expect(needsSceneRegen(r)).toBe(false); expect(gateFeedback(r)).not.toMatch(/Escena corta/);
  });
  it("voz de adulto y hermano reactivo: locales, con las líneas exactas", () => {
    const adult = base(1, { lines: [{ speaker: "KAP", text: `No te rindas nunca, mi voz va más allá ${w(1, 10)}` }, { speaker: "Dani", text: w(1, 25, 40) }, { speaker: "", text: w(1, 25, 70) }] }); expect(checkScene(inp(adult)).find((x) => x.kind === "voz-adulta")).toMatchObject({ scope: "local", lines: [0] });
    const sib = base(1, { lines: [{ speaker: "Hermano de KAP", text: "Kap... ¿estás bien?" }, { speaker: "Hermano de KAP", text: "Duele mucho" }, { speaker: "KAP", text: w(1, 30) }, { speaker: "", text: w(1, 30, 40) }] }); expect(checkScene(inp(sib, { siblingName: "Hermano de KAP", speakers: ["KAP", "Hermano de KAP"] })).find((x) => x.kind === "hermano-reactivo")).toMatchObject({ scope: "local", lines: [0, 1] });
  });
});

describe("monólogo de relleno", () => {
  const mono = (extra: GateInput["scene"]["lines"] = []) => base(1, { lines: [{ speaker: "Dani", text: w(1, 12, 5) }, { speaker: "KAP", text: w(1, 10, 20) }, { speaker: "KAP", text: "¿Y si me quedo aquí? Tal vez mañana todo sea distinto" }, { speaker: "KAP", text: "Tal vez algún día todo sea distinto, quizá todo cambie" }, { speaker: "KAP", text: "A veces pienso en todo lo que pasa en esta casa" }, ...extra] });
  it("varias intervenciones seguidas de KAP sin información nueva se detectan y se recortan en código", () => {
    const r = checkScene(inp(mono([{ speaker: "Dani", text: w(1, 12, 40) }]))), m = r.find((x) => x.kind === "monologo-relleno"); expect(m).toMatchObject({ scope: "repair" }); expect(m!.lines!.length).toBeGreaterThanOrEqual(2);
    const fixed = repairLines(mono([{ speaker: "Dani", text: w(1, 12, 40) }]).lines, r); expect(fixed.repaired).toContain("monologo-relleno"); expect(fixed.lines.length).toBeLessThan(6); expect(fixed.lines.length).toBeGreaterThanOrEqual(3);
  });
  it("NO es monólogo si la escena ya tiene acción narrada clara (no añadir más regeneración)", () => {
    const withAction = base(1, { lines: [{ speaker: "", text: w(1, 12, 1) }, { speaker: "KAP", text: w(1, 10, 20) }, { speaker: "KAP", text: "¿Y si me quedo aquí? Tal vez mañana todo sea distinto" }, { speaker: "KAP", text: "Tal vez algún día todo sea distinto, quizá todo cambie" }, { speaker: "", text: w(1, 12, 60) }, { speaker: "Dani", text: w(1, 12, 80) }] }); expect(kinds(inp(withAction))).not.toContain("monologo-relleno");
  });
  it("tres intervenciones seguidas con información nueva cada una (cambia la situación) no son relleno", () => {
    const rich = base(1, { lines: [{ speaker: "Dani", text: w(1, 12, 5) }, { speaker: "KAP", text: w(1, 10, 20) }, { speaker: "KAP", text: w(1, 10, 30) }, { speaker: "KAP", text: w(1, 10, 40) }, { speaker: "Dani", text: w(1, 12, 80) }] }); expect(kinds(inp(rich))).not.toContain("monologo-relleno");
  });
});

describe("rima de la escena y cierre en la puerta", () => {
  const withKap = (kap: string) => base(1, { lines: [{ speaker: "", text: w(1, 25) }, { speaker: "KAP", text: kap }, { speaker: "Dani", text: w(1, 20, 40) }] });
  it("la escena que lleva la rima: si no rima se pide reescribir SOLO esa intervención (local, con su línea)", () => {
    const r = checkScene(inp(withKap("Tengo hambre y no hay pan en la mesa hoy"), { rhyme: { mode: "opening", contextTerms: ctxTerms } })); expect(r.find((x) => x.kind === "rima-invalida")).toMatchObject({ scope: "local", lines: [1] });
    expect(kinds(inp(withKap(RHYME), { rhyme: { mode: "opening", contextTerms: ctxTerms } }))).not.toContain("rima-invalida");
  });
  it("«first-rhyme» acepta cualquier intervención de KAP de la escena que sea una rima válida", () => {
    const sc = base(1, { lines: [{ speaker: "KAP", text: "Tengo prisa y no hay nada" }, { speaker: "Dani", text: w(1, 12, 50) }, { speaker: "KAP", text: RHYME }, { speaker: "", text: w(1, 20, 70) }] });
    expect(sceneRhyme(sc.lines, { mode: "first-rhyme", contextTerms: ctxTerms }).check.rhyme_valid).toBe(true); expect(sceneRhyme(sc.lines, { mode: "opening", contextTerms: ctxTerms }).check.rhyme_valid).toBe(false);
  });
  it("cierre motivacional o reflexivo solo se comprueba en la última escena y apunta a la línea a reescribir", () => {
    const bad = withKap("¿Y si algún día no me rindo y todo cambia?"); const lines = [...bad.lines.slice(0, 2), { speaker: "KAP", text: "¿Y si algún día no me rindo y todo cambia?" }];
    expect(checkScene(inp({ ...bad, lines }, { isLast: true })).find((x) => x.kind === "cierre-reflexivo")).toMatchObject({ scope: "local", lines: [2] }); expect(kinds(inp({ ...bad, lines }, { isLast: false }))).not.toContain("cierre-reflexivo");
    expect(kinds(inp(withKap("¡Se me cayó el pan al charco!"), { isLast: true }))).not.toContain("cierre-reflexivo");
  });
  it("AGRUPACIÓN: varios fallos de la misma escena salen en UNA sola lista y la regeneración completa los lleva todos", () => {
    const bad = base(1, { change: "", lines: [{ speaker: "Ramiro", text: w(1, 20) }, { speaker: "KAP", text: "Nunca te rindas, mi voz va más allá" }, { speaker: "", text: w(1, 10, 60) }] }); const r = checkScene(inp(bad, { rhyme: { mode: "opening", contextTerms: ctxTerms } }));
    expect(r.map((x) => x.kind)).toEqual(expect.arrayContaining(["sin-cambio", "personaje-no-previsto", "voz-adulta", "rima-invalida"])); const fb = gateFeedback(r); expect(fb.match(/^- /gm)!.length).toBe(r.filter((x) => x.scope !== "info").length); expect(fb).toMatch(/Ramiro[\s\S]*eslogan[\s\S]*rima/);
  });
});

describe("mostrar más y explicar menos: reparación LOCAL de líneas", () => {
  const sc = (lines: { speaker: string; text: string }[], change = `Pasa ${w(9, 5, 120)}`): GateInput["scene"] => ({ lines, change });
  it("KAP que explica el tema o sus emociones: se marca la línea (local), no la escena; una frase concreta no", () => {
    const bad = sc([{ speaker: "", text: w(9, 25) }, { speaker: "KAP", text: "No voy a rendirme, este es mi sueño y estoy nervioso" }, { speaker: "Dani", text: w(9, 20, 40) }]);
    const r = checkScene(inp(bad)); expect(r.find((x) => x.kind === "explica-emocion")).toMatchObject({ scope: "local", blocking: false, lines: [1] }); expect(needsSceneRegen(r)).toBe(false); expect(r.find((x) => x.kind === "explica-emocion")!.text).toMatch(/esconder el cuaderno[\s\S]*broma/);
    const ok = sc([{ speaker: "", text: w(9, 25) }, { speaker: "KAP", text: "¿Dónde dejaste mi cuaderno, Dani? Dámelo ya, pesado" }, { speaker: "Dani", text: w(9, 20, 40) }]); expect(kinds(inp(ok))).not.toContain("explica-emocion");
  });
  it("el secundario que solo valida o enseña: se marca su línea; si lo dice KAP no cuenta como validación", () => {
    const val = sc([{ speaker: "Ramiro", text: "Tu música no es solo un sueño, KAP. Es una realidad que puedes construir." }, { speaker: "KAP", text: w(9, 20, 40) }, { speaker: "", text: w(9, 25, 70) }]);
    expect(checkScene(inp(val, { speakers: ["KAP", "Ramiro"] })).find((x) => x.kind === "validacion-moraleja")).toMatchObject({ scope: "local", lines: [0] });
    const kapSays = sc([{ speaker: "KAP", text: "Yo te apoyo, Dani, de verdad" }, { speaker: "Dani", text: w(9, 20, 40) }, { speaker: "", text: w(9, 25, 70) }]); expect(kinds(inp(kapSays))).not.toContain("validacion-moraleja");
  });
  it("el cierre de manual se marca en la última escena aunque lo diga otro personaje o el narrador", () => {
    const end = (who: string, t: string) => sc([{ speaker: "KAP", text: w(9, 15, 40) }, { speaker: "Dani", text: w(9, 15, 70) }, { speaker: who, text: t }]);
    for (const [who, t] of [["", "Tu camino no será fácil."], ["Ramiro", "No será fácil, KAP."], ["KAP", "Este es mi camino."]] as const) expect(checkScene(inp(end(who, t), { isLast: true })).find((x) => x.kind === "cierre-reflexivo"), t).toMatchObject({ scope: "local" });
    expect(kinds(inp(end("", "Tu camino no será fácil."), { isLast: false }))).not.toContain("cierre-reflexivo");
  });
  it("el final debe nacer de lo que acaba de ocurrir: un cierre sin relación con nada de lo anterior se marca (local)", () => {
    const prev = [prevOf(sc([{ speaker: "KAP", text: "Escondo el cuaderno dentro de la mochila del hermano" }, { speaker: "", text: "Dani busca el cuaderno por toda la clase" }]))];
    const unrelated = sc([{ speaker: "KAP", text: "Corro hacia la puerta con la mochila" }, { speaker: "", text: "Una paloma azul cruza volando sobre el estadio lejano esta tarde" }]), related = sc([{ speaker: "KAP", text: "Corro hacia la puerta con la mochila" }, { speaker: "", text: "Dani abre la mochila del hermano y encuentra el cuaderno mojado" }]);
    expect(checkScene(inp(unrelated, { isLast: true, previous: prev })).find((x) => x.kind === "cierre-desconectado")).toMatchObject({ scope: "local", lines: [1] }); expect(kinds(inp(related, { isLast: true, previous: prev }))).not.toContain("cierre-desconectado");
  });
  it("la consecuencia debe MOSTRAR el coste de la decisión, no solo contarlo (local: se reescribe la acción narrada)", () => {
    const cost = "Pierde la radio y se queda sin pan", with0 = sc([{ speaker: "", text: "KAP vuelve a casa con la cabeza baja y el hermano lo mira desde la cama" }, { speaker: "KAP", text: "Perdón, se me complicó el día" }, { speaker: "Hermano de KAP", text: "¿Y mi cena entonces?" }]);
    expect(checkScene(inp(with0, { cost, speakers: ["KAP", "Hermano de KAP"] })).find((x) => x.kind === "coste-ausente")).toMatchObject({ scope: "local", lines: [0] });
    const shown = sc([{ speaker: "", text: "El tendero guarda la radio bajo el mostrador y le tiende una bolsa vacía de pan" }, { speaker: "KAP", text: "Esa radio era mía" }, { speaker: "Tendero", text: "Era. Vuelve mañana" }]); expect(kinds(inp(shown, { cost, speakers: ["KAP", "Tendero"] }))).not.toContain("coste-ausente");
    expect(kinds(inp(with0, { speakers: ["KAP", "Hermano de KAP"] }))).not.toContain("coste-ausente");   // solo se comprueba en las escenas de consecuencia
  });
});

describe("conducta infantil: KAP actúa y una emoción establecida no se repite", () => {
  const mk = (lines: { speaker: string; text: string }[]): GateInput["scene"] => ({ lines, change: `Pasa ${w(8, 5, 120)}` });
  const talk = mk([{ speaker: "", text: w(8, 20) }, { speaker: "KAP", text: w(8, 12, 40) }, { speaker: "Dani", text: w(8, 12, 60) }, { speaker: "KAP", text: w(8, 10, 80) }]);
  it("KAP que solo habla o piensa (lo que «hace» es pensar, recordar o dudar) se marca: se repara la línea narrada, no la escena", () => {
    for (const does of ["Piensa en lo que ha pasado", "Recuerda a su hermano y suspira", "Duda sin saber qué hacer", ""]) { const r = checkScene(inp(talk, { kapDoes: does, kapState: "confuso" })); expect(r.find((x) => x.kind === "kap-no-actua"), does).toMatchObject({ scope: "local", blocking: false, lines: [0] }); expect(needsSceneRegen(r)).toBe(false); }
    expect(checkScene(inp(talk, { kapDoes: "Piensa", kapState: "x" })).find((x) => x.kind === "kap-no-actua")!.text).toMatch(/impulsivo[\s\S]*esconder[\s\S]*arreglar algo y empeorarlo[\s\S]*improvisada/);
  });
  it("una acción visible no se marca; tampoco una escena donde KAP casi no habla", () => {
    expect(kinds(inp(talk, { kapDoes: "Esconde el cuaderno bajo la mochila cuando entra la profesora", kapState: "nervioso" }))).not.toContain("kap-no-actua");
    expect(kinds(inp(mk([{ speaker: "", text: w(8, 20) }, { speaker: "KAP", text: w(8, 12, 40) }, { speaker: "Dani", text: w(8, 12, 60) }]), { kapDoes: "Piensa", kapState: "x" }))).not.toContain("kap-no-actua");   // una sola línea de KAP
    expect(kinds(inp(talk))).not.toContain("kap-no-actua");   // sin lo declarado por la escena no se juzga
  });
  it("MENOS REPETICIÓN EMOCIONAL: mismo estado que la escena anterior sin avanzar (solo pensar o repetir lo mismo) se marca; pasar a otra acción no", () => {
    const before = { ...prevOf(base(0)), state: "confundido", does: "Mira el teléfono sin saber qué hacer" };
    const stuck = checkScene(inp(talk, { previous: [before], kapDoes: "Sigue pensando en qué hacer", kapState: "Confundido" })); expect(stuck.find((x) => x.kind === "emocion-repetida")).toMatchObject({ scope: "local", lines: [0] }); expect(stuck.find((x) => x.kind === "emocion-repetida")!.text).toMatch(/ya estaba establecida/);
    expect(kinds(inp(talk, { previous: [before], kapDoes: "Mira el teléfono sin saber qué hacer", kapState: "confundido" }))).toContain("emocion-repetida");   // misma «acción» que antes: tampoco avanza
    expect(kinds(inp(talk, { previous: [before], kapDoes: "Marca el número del tendero y cuelga de golpe", kapState: "confundido" }))).not.toContain("emocion-repetida");   // mismo estado pero HACE algo distinto
    expect(kinds(inp(talk, { previous: [before], kapDoes: "Sigue pensando", kapState: "impulsivo" }))).not.toContain("emocion-repetida");   // otro estado
  });
  it("las dos comprobaciones nuevas comparten una sola llamada local: no añaden una regeneración de escena", () => {
    const r = checkScene(inp(talk, { previous: [{ ...prevOf(base(0)), state: "confuso", does: "Duda" }], kapDoes: "Piensa", kapState: "confuso" })); const local = r.filter((x) => x.scope === "local"); expect(local.map((x) => x.kind)).toEqual(expect.arrayContaining(["kap-no-actua", "emocion-repetida"])); expect(needsSceneRegen(r)).toBe(false); expect(local.every((x) => x.lines!.join() === "0")).toBe(true);
  });
  it("CONVERSACIÓN ESTÁTICA: la misma conversación que la escena anterior, sin que ocurra nada, se señala (regenerar); si ocurre algo, o cambian los personajes, no", () => {
    const talk = (...xs: [string, string][]) => ({ lines: xs.map(([speaker, text]) => ({ speaker, text })), change: `Cambia algo distinto ${xs.length} ${xs[0][1].slice(0, 12)}` });
    const A = talk(["Hermano", "¿Por qué no podemos salir hermanito? Quiero ver a papá"], ["KAP", "No es el momento hermanito, quédate aquí conmigo"], ["Hermano", "Pero quiero salir, los gritos me dan miedo"], ["KAP", "Solo quédate aquí, no es seguro salir ahora"], ["Hermano", "¿Y cuándo podremos salir de aquí hermanito?"]);
    const B = talk(["Hermano", "Quiero salir a ver a papá y a mamá hermanito"], ["KAP", "Ya te dije que no es el momento, quédate aquí"], ["Hermano", "¿Por qué no podemos salir? Los gritos me asustan"], ["KAP", "Quédate aquí conmigo, salir no es seguro ahora"], ["Hermano", "¿Y si salimos solo un momento hermanito?"]);
    const mk = (scene: ReturnType<typeof talk>, o: Partial<GateInput> = {}) => ({ scene, previous: [prevOf(A)], speakers: ["KAP", "Hermano"], memoryOutside: [] as string[], ...o });
    const x = checkScene(mk(B)).find((i) => i.kind === "conversacion-estatica"); expect(x).toMatchObject({ scope: "scene", blocking: false });
    const withAction = talk(["", "Una puerta se cierra con fuerza al otro lado del pasillo y KAP se queda quieto, escuchando."], ...B.lines.map((l) => [l.speaker, l.text] as [string, string]).slice(0, 4), ["", "KAP se acerca despacio a la puerta y pone la mano sobre la madera."]);
    expect(checkScene(mk(withAction)).map((i) => i.kind)).not.toContain("conversacion-estatica");   // ocurre algo
    const other = talk(["Padre", "Dame las llaves ahora mismo, no estoy bromeando contigo"], ["Madre", "No pienso dártelas, estás fuera de ti completamente"], ["Padre", "Salir de aquí es lo único que quiero hacer ahora"], ["Madre", "Pues sal por esa puerta y no vuelvas más"]);
    expect(checkScene(mk(other, { speakers: ["Padre", "Madre"] })).map((i) => i.kind)).not.toContain("conversacion-estatica");   // otros personajes y otro tema
    expect(checkScene({ ...mk(B), previous: [] }).map((i) => i.kind)).not.toContain("conversacion-estatica");   // la primera escena no tiene nada que repetir
  });
});
