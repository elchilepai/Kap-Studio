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
