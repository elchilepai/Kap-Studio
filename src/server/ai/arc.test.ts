import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import { EpisodeArc, arcBeats, llmArcAuthor, mergeRepeatedBeats, sequenceToBeat } from "./arc";
import { KAP_PERSONALITY } from "./prompts";
import { validateIR } from "@/domain/screenplay";
import { parsedToIR } from "@/server/studio/interpreter";
import { parseScript } from "@/server/studio/script";
import type { ContextPack } from "@/memory";

class Scripted implements LlmClient {
  id = "scripted"; label = "doble"; model = "m"; contextTokens = 8192; calls: LlmRequest[] = [];
  constructor(private replies: string[]) {}
  async available() { return true; }
  async generate(req: LlmRequest) { this.calls.push(req); const r = this.replies.shift(); if (r === undefined) throw new Error("sin más respuestas"); return { text: r }; }
}
/** Palabras sintéticas únicas por (escena, posición): garantizan escenas distintas para la puerta de calidad. */
const L = (n: number) => String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + (Math.floor(n / 26) % 26)), uw = (n: number, k: number) => `zo${L(n)}${L(k)}qu`, text = (n: number, k: number, from = 0) => Array.from({ length: k }, (_, i) => uw(n, from + i)).join(" ");
const STAGES = ["inicio", "problema", "escalada", "decision", "consecuencia", "resolucion", "gancho"], PLACES = ["Casa de KAP", "Calle", "Tienda", "Casa de KAP"];
const beat = (i: number, stage = STAGES[Math.min(i, 6)], characters = ["KAP"]) => ({ stage, fn: stage === "problema" ? "conflicto" : "avanzar-historia", summary: `Ocurre algo distinto número ${text(i, 4, 200)} con consecuencias`, change: `Cambia ${text(i, 5, 300)} de forma visible`, why: `Porque ${text(i, 3, 400)} lo exige`, location: PLACES[i % 4], characters, time: i % 2 ? "noche" : "mañana", interior: i % 2 === 0, shot: ["general", "medio", "primer plano"][i % 3], visual: "KAP mira la puerta" });
const arc = (over: Record<string, unknown> = {}) => ({ title: "El fiado", logline: "KAP pide fiado y la tienda se lo niega.", assumptions: [], problem: "No hay comida para el hermano", kapWant: "Conseguir pan", kapChoice: "Vende su radio sin pensarlo bien", cost: `Pierde ${text(4, 3, 5)} y se queda sin pan`, consequence: "Pierde su radio y sigue sin pan", outcome: "amargo", hook: "El tendero guarda la radio de KAP bajo el mostrador y pide el resto del dinero mañana.",
  setting: { main: "Casa de KAP", secondary: ["Calle", "Tienda"], timeOfDay: "noche", transitions: ["más tarde ese día"] }, behaviorBeats: [], extraCharacters: [{ name: "Hermano de KAP", why: "está en casa sin comer" }], castActions: [{ name: "Hermano de KAP", does: "esconde el último pan" }], openingRhymeReason: "KAP abre el episodio en silencio, escondiéndose del tendero, y hablar rimando delataría su posición", usedFromMemory: ["Hermano de KAP"], newCharacters: [], newPlaces: [], beats: [0, 1, 2, 3, 4, 5, 5, 6].map((i, k) => beat(k, STAGES[i], k % 2 ? ["KAP", "Hermano de KAP"] : ["KAP"])), ...over });
/** Escena válida de ≈ 70 palabras, que parte del cambio de la anterior (cadena causal) y con otro personaje y un cambio propio. */
const scene = (n: number, o: { words?: number; speaker?: string; same?: string; change?: string; sib?: string; doing?: string; state?: string } = {}) => ({ title: `Escena ${n}`, lines: [{ speaker: "", text: o.same ?? `${n > 0 ? `${text(n - 1, 3, 120)} ` : ""}${text(n, o.words ?? 20)}` }, { speaker: "KAP", text: `${text(n, 12, 40)}` }, { speaker: o.speaker ?? "Hermano de KAP", text: o.sib ?? `${text(n, 12, 70)}` }, { speaker: "KAP", text: text(n, 10, 90) }, { speaker: o.speaker ?? "Hermano de KAP", text: o.sib ?? text(n, 10, 110) }], change: o.change ?? `Pasa ${text(n, 6, 120)}`, kapDoes: o.doing ?? "KAP agarra la bolsa y sale corriendo detrás del tendero", kapState: o.state ?? ["nervioso", "impulsivo", "avergonzado", "enfadado", "aliviado", "confuso"][n % 6], directions: ["expresion: KAP triste", "baila: KAP por la luna"], memory: ["acto: inicio | no debería pasar", "inventa: algo raro", "obtiene: KAP, radio"] });
const ctx = (over: Partial<ContextPack["request"]> = {}): ContextPack => ({ request: { text: "x", number: 4, season: 1, exact: false, cast: [], notes: "Crea el episodio 4", ...over }, budgetTokens: 1000, usedTokens: 10, sections: [{ id: "lastshot", title: "Último plano", text: "Escena «Fin» en Calle de noche; personajes: KAP", tokens: 5, itemsTotal: 1, itemsIncluded: 1 }], dropped: [], relevantCharacters: ["KAP", "Hermano de KAP", "Ramiro"], text: "# Contexto\n- KAP, 9 años" });
const run = async (replies: unknown[], c = ctx(), hints?: Parameters<ReturnType<typeof llmArcAuthor>["write"]>[0]["hints"], opts: Parameters<typeof llmArcAuthor>[1] = { openingRhyme: false }) => { const llm = new Scripted(replies.map((r) => (typeof r === "string" ? r : JSON.stringify(r)))), author = llmArcAuthor(llm, opts); const out = await author.write({ request: c.request, context: c, hints }); return { llm, author, out }; };
const happy = () => { const a = arc(); return [a, ...a.beats.map((_, i) => scene(i))]; };

const RHYME = "Cierro la puerta, la noche está abierta, y en esta casa nadie me despierta";   // rima consonante («-erta») y nacida de la puerta y la casa de la escena
const withKap = (sc: ReturnType<typeof scene>, kap: string) => ({ ...sc, lines: sc.lines.map((l, i) => (i === 1 ? { ...l, text: kap } : l)) });
const patch = (...lines: string[]) => ({ lines });
const isPatch = (c: LlmRequest) => /Reescribes SOLO algunas líneas/.test(c.system ?? "");
const ending = (o: Record<string, unknown> = {}) => ({ outcome: "un gag con la radio", consequence: "La radio suena sola en la tienda y todos se ríen de KAP", hook: "La radio suena sola en la tienda y el tendero huye por la puerta trasera dejando la caja abierta", closingSummary: "La radio suena sola en el mostrador y el tendero la apaga a golpes", closingChange: "Todos descubren que la radio sigue funcionando", ...o });

describe("generador por arco (arco → escenas) con puerta de calidad", () => {
  it("diseña el arco y escribe una escena por beat; actos y gancho los fija el código sobre las escenas finales", async () => {
    const { llm, author, out } = await run(happy());
    expect(llm.calls).toHaveLength(9); expect(llm.calls[0].system).toMatch(/DISEÑAR EL ARCO/); expect(llm.calls[1].system).toMatch(/UNA escena/); expect(llm.calls[2].prompt).toContain("Escena 0");
    const d = author.lastDraft!, mem = d.scenes.flatMap((s) => s.memory); expect(d.scenes).toHaveLength(8);
    for (const act of ["inicio", "conflicto", "desarrollo", "emocional", "resolucion", "gancho"]) expect(mem.some((m) => m.startsWith(`acto: ${act} |`))).toBe(true);
    expect(mem.filter((m) => m.startsWith("gancho:"))).toHaveLength(1); expect(d.scenes.at(-1)!.memory.some((m) => m.startsWith("gancho: El tendero"))).toBe(true);
    expect(mem).not.toContain("acto: inicio | no debería pasar"); expect(mem).not.toContain("inventa: algo raro"); expect(mem).toContain("obtiene: KAP, radio"); expect(out.stats!.memoryDirectiveErrors).toBe(8);
    expect(d.scenes[0].directions![0]).toBe("plano: general"); expect(d.scenes[0].directions).not.toContain("baila: KAP por la luna"); expect(d.scenes[0].change).toMatch(/^Pasa/);
    const r = validateIR(parsedToIR(parseScript(out.script, [{ id: "1", name: "KAP" }, { id: "2", name: "Hermano de KAP" }])), { characters: ["KAP", "Hermano de KAP"], places: [] }); expect(r.errors).toEqual([]);
    expect(out.script).toMatch(/\[mood: mañana, interior\]/); expect(out.stats!.scenesRegenerated).toBe(0); expect(out.stats!.scenesDropped).toBe(0); expect(out.stats!.localPatches).toBe(0);
  });
  it("la longitud es la ÚLTIMA prioridad: una escena corta NO se regenera, solo avisa", async () => {
    const a = arc(), { llm, out } = await run([a, scene(0, { words: 6 }), ...a.beats.slice(1).map((_, i) => scene(i + 1))]);
    expect(llm.calls).toHaveLength(9); expect(out.stats!.scenesRegenerated).toBe(0); expect(out.stats!.gateIssues!.corta).toBeGreaterThan(0);
  });
  it("una repetición clara de una escena entera se regenera (≤ 2 veces); si sigue repitiendo, la escena se ELIMINA salvo las esenciales", async () => {
    const a = arc(), clone = { ...scene(0), change: "Pasa otro cambio inventado qrs distinto", kapState: "enfadado", kapDoes: "KAP rompe el recibo y se va dando un portazo" };   // copia de la escena 0 salvo el cambio declarado
    const { llm, author, out } = await run([a, scene(0), scene(1), scene(2), scene(3), scene(4), clone, clone, clone, scene(6), scene(7)]);
    expect(author.lastDraft!.scenes).toHaveLength(7); expect(out.stats!.scenesDropped).toBe(1); expect(out.stats!.gateIssues!["repite-escena"]).toBe(3); expect(out.warnings.some((w) => /eliminada/.test(w))).toBe(true);
    expect(llm.calls.filter((c) => /no era aceptable/.test(c.prompt))).toHaveLength(2); expect(author.lastDraft!.scenes.flatMap((s) => s.memory).filter((m) => m.startsWith("acto: "))).toHaveLength(6);
  });
  it("una escena esencial (única de su etapa) no se elimina aunque repita: se conserva con aviso", async () => {
    const a = arc(), clone = { ...scene(0), change: "Pasa otro cambio inventado qrs distinto", kapState: "enfadado", kapDoes: "KAP rompe el recibo y se va dando un portazo" };
    const { author, out } = await run([a, scene(0), clone, clone, clone, ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(author.lastDraft!.scenes).toHaveLength(8); expect(out.stats!.scenesDropped).toBe(0); expect(out.warnings.some((w) => /Escena 2: Repite casi literalmente/.test(w))).toBe(true);
  });
  it("repetición de RELLENO (el mismo personaje repite lo ya dicho): se arregla EN CÓDIGO, sin llamar al modelo ni regenerar", async () => {
    const a = arc(), dupLine = text(0, 12, 40), s1 = { ...scene(1), lines: [{ speaker: "", text: text(1, 20) }, { speaker: "KAP", text: dupLine }, { speaker: "Hermano de KAP", text: text(1, 12, 70) }, { speaker: "KAP", text: text(1, 10, 90) }, { speaker: "Hermano de KAP", text: text(1, 10, 110) }] };
    const { llm, author, out } = await run([a, scene(0), s1, ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(llm.calls).toHaveLength(9); expect(out.stats!.codeRepairs).toBe(1); expect(out.stats!.scenesRegenerated).toBe(0);
    expect(author.lastDraft!.scenes[1].lines.some((l) => l.text === dupLine)).toBe(false); expect(author.lastDraft!.scenes[1].lines.length).toBe(4);
  });
  it("repetición NECESARIA (otro personaje repite la frase como eco o burla) no se toca", async () => {
    const a = arc(), echo = text(0, 12, 40), s1 = { ...scene(1), lines: [{ speaker: "", text: text(1, 20) }, { speaker: "Hermano de KAP", text: echo }, { speaker: "KAP", text: text(1, 12, 70) }, { speaker: "Hermano de KAP", text: text(1, 10, 90) }, { speaker: "KAP", text: text(1, 10, 110) }] };
    const { llm, out } = await run([a, scene(0), s1, ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(llm.calls).toHaveLength(9); expect(out.stats!.codeRepairs).toBe(0); expect(out.stats!.gateIssues!["repite-frase"]).toBeUndefined();
  });
  it("la memoria no entra por defecto: Ramiro se quita del beat y su aparición en una escena regenera la escena", async () => {
    const withRamiro = arc({ beats: arc().beats.map((b, k) => (k === 2 ? { ...b, characters: ["KAP", "Ramiro"] } : b)) });
    const replies: unknown[] = [withRamiro, scene(0), scene(1), scene(2, { speaker: "Ramiro" }), scene(2), ...withRamiro.beats.slice(3).map((_, i) => scene(i + 3))];
    const { author, out } = await run(replies); expect(author.lastArc!.beats[2].characters).toEqual(["KAP"]); expect(out.warnings.some((w) => /Ramiro.*sin justificarlo/.test(w))).toBe(true); expect(out.stats!.gateIssues!["personaje-no-previsto"]).toBe(1);
  });
  it("un personaje de la memoria justificado como extra del arco sí puede aparecer", async () => {
    const a = arc({ extraCharacters: [{ name: "Hermano de KAP", why: "está en casa sin comer" }, { name: "Ramiro", why: "tiene el micrófono que KAP necesita" }], beats: arc().beats.map((b, k) => (k === 2 ? { ...b, characters: ["KAP", "Ramiro"] } : b)) });
    const { author } = await run([a, scene(0), scene(1), scene(2, { speaker: "Ramiro" }), ...a.beats.slice(3).map((_, i) => scene(i + 3))]); expect(author.lastArc!.beats[2].characters).toContain("Ramiro");
  });
  it("REGENERACIÓN LOCAL: el hermano reactivo se repara con UNA llamada pequeña que solo reescribe sus líneas, sin regenerar la escena", async () => {
    const a = arc(), s1 = { ...scene(1), lines: [{ speaker: "", text: text(1, 20) }, { speaker: "Hermano de KAP", text: "Kap... ¿estás bien?" }, { speaker: "KAP", text: text(1, 12, 70) }, { speaker: "Hermano de KAP", text: "Kap... duele." }, { speaker: "KAP", text: text(1, 10, 90) }] };
    const { llm, author, out } = await run([a, scene(0), s1, patch("Me escondí el pan debajo de la cama, no se lo digas a nadie", "Voy a buscar a la vecina, ella siempre tiene algo rico"), ...a.beats.slice(2).map((_, i) => scene(i + 2))]);
    const p = llm.calls.filter(isPatch); expect(p).toHaveLength(1); expect(p[0].prompt).not.toContain("Arco del episodio"); expect(p[0].prompt).not.toContain("# Contexto"); expect(p[0].prompt.length).toBeLessThan(llm.calls[1].prompt.length);   // prompt pequeño: sin arco ni contexto (aquí el contexto es mínimo; con el real la diferencia es de miles de tokens)
    expect(out.stats!.scenesRegenerated).toBe(0); expect(out.stats!.localPatches).toBe(1); expect(author.lastDraft!.scenes[1].lines[1].text).toMatch(/escondí el pan/); expect(author.lastDraft!.scenes[1].lines[2].text).toBe(s1.lines[2].text);   // el resto no se toca
  });
  it("voz de adulto: solo se reescribe esa intervención", async () => {
    const a = arc(), s0 = withKap(scene(0), "No me rendiré jamás, mi voz va más allá y mi sueño nadie lo detiene."), fixed = "Se me rompió el zapato otra vez y mi hermano se ríe";
    const { llm, author, out } = await run([a, s0, patch(fixed), ...a.beats.slice(1).map((_, i) => scene(i + 1))]); expect(llm.calls.filter(isPatch)).toHaveLength(1); expect(out.stats!.scenesRegenerated).toBe(0); expect(author.lastDraft!.scenes[0].lines[1].text).toBe(fixed);
  });
  it("AGRUPACIÓN: si fallan rima, voz y mención, se hace UNA sola llamada local con todas las líneas afectadas", async () => {
    const a = arc(), bad = { ...scene(0), lines: [{ speaker: "", text: text(0, 20) }, { speaker: "KAP", text: "No te rindas nunca, mi voz va más allá, mi sueño es el futuro" }, { speaker: "Hermano de KAP", text: `${text(0, 10, 70)} dice Ramiro ${text(0, 5, 80)}` }, { speaker: "KAP", text: text(0, 10, 90) }, { speaker: "Hermano de KAP", text: text(0, 10, 110) }] };
    const { llm, out } = await run([a, bad, patch(RHYME, "Quita eso de allí, no me acuerdo de nadie", ), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    const p = llm.calls.filter(isPatch); expect(p).toHaveLength(1); expect(p[0].prompt).toMatch(/línea 2[\s\S]*línea 3/); expect(p[0].prompt).toMatch(/RIMA DE KAP/); expect(out.stats!.scenesRegenerated).toBe(0); expect(out.stats!.localPatches).toBe(1);
  });
  it("RIMA: si la primera intervención de KAP no rima se reescribe SOLO esa intervención (≤ 2 veces) y no la escena", async () => {
    const a = arc(), flat = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy");
    const { llm, author, out } = await run([a, flat, patch("Me ruge la panza y la nevera vacía"), patch(RHYME), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    expect(llm.calls.filter(isPatch)).toHaveLength(2); expect(out.stats!.scenesRegenerated).toBe(0); expect(author.lastDraft!.scenes[0].lines[1].text).toBe(RHYME); expect(out.stats!.rhymeValid).toBe(true); expect(author.lastGate!.rhyme_valid).toBe(true);
    expect(llm.calls.filter(isPatch)[0].prompt).toMatch(/los finales de los versos no riman|no hay una intervención/);
  });
  it("RIMA: el tope son 2 reescrituras; si no rima, queda el aviso y rhyme_valid=false", async () => {
    const a = arc(), flat = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy");
    const { llm, out } = await run([a, flat, patch("Sigo con hambre en la cocina vacía"), patch("Sigo con hambre en la cocina sola"), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    expect(llm.calls.filter(isPatch)).toHaveLength(2); expect(out.stats!.rhymeValid).toBe(false); expect(out.warnings.some((w) => /La rima de KAP no vale/.test(w))).toBe(true);
  });
  it("RIMA de apertura: la rima válida a la primera no cuesta ninguna llamada extra; la primera improvisación pide nacer de la situación concreta", async () => {
    const a = arc(), { llm, out } = await run([a, withKap(scene(0), RHYME), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true }); expect(llm.calls).toHaveLength(9); expect(out.stats!.rhymeValid).toBe(true); expect(llm.calls[1].prompt).toMatch(/RIMA DE KAP[\s\S]*CONTEXTO → KAP HACE\/VE ALGO → PALABRA CLAVE → RIMA CORTA → DIÁLOGO/);
    const b = arc({ kapChoice: "KAP improvisa una rima por primera vez", beats: arc().beats.map((x, k) => (k === 3 ? { ...x, summary: "KAP improvisa una rima por primera vez ante los que se burlan" } : x)) }), r2 = await run([b, scene(0), scene(1), scene(2), withKap(scene(3), RHYME), ...b.beats.slice(4).map((_, i) => scene(i + 4))], ctx(), undefined, { openingRhyme: false });
    expect(r2.llm.calls[4].prompt).toMatch(/RIMA DE KAP/); expect(r2.llm.calls[1].prompt).not.toMatch(/RIMA DE KAP/); expect(r2.out.stats!.rhymeValid).toBe(true);
  });
  it("CIERRE: si la última escena termina con una reflexión de KAP, se reescribe SOLO el cierre (1 vez)", async () => {
    const a = arc(), last = scene(7), bad = { ...last, lines: [...last.lines.slice(0, 4), { speaker: "KAP", text: "¿Y si algún día no me rindo y todo cambia para siempre?" }] }, closing = "Se me cayó la radio al piso y la tienda entera se rio";
    const { llm, author, out } = await run([a, ...a.beats.slice(0, 7).map((_, i) => scene(i)), bad, patch(closing)]); const p = llm.calls.filter(isPatch); expect(p).toHaveLength(1); expect(p[0].prompt).toMatch(/cierre de KAP es una (?:reflexión|pregunta retórica)/); expect(author.lastDraft!.scenes.at(-1)!.lines.at(-1)!.text).toBe(closing); expect(out.stats!.scenesRegenerated).toBe(0);
  });
  it("MONÓLOGO DE RELLENO: se recorta EN CÓDIGO (sin modelo) si la escena conserva su intercambio; no se regenera", async () => {
    const a = arc(), mono = { ...scene(1), lines: [{ speaker: "Hermano de KAP", text: text(1, 12, 5) }, { speaker: "KAP", text: text(1, 10, 20) }, { speaker: "KAP", text: "¿Y si me quedo aquí? Tal vez mañana todo sea distinto" }, { speaker: "KAP", text: "Tal vez algún día todo sea distinto, quizá todo cambie" }, { speaker: "KAP", text: "A veces pienso en todo lo que pasa en esta casa" }, { speaker: "Hermano de KAP", text: text(1, 12, 40) }] };
    const { llm, author, out } = await run([a, scene(0), mono, ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(llm.calls).toHaveLength(9); expect(out.stats!.codeRepairs).toBe(1); expect(out.stats!.gateIssues!["monologo-relleno"]).toBe(1); expect(author.lastDraft!.scenes[1].lines.length).toBeLessThan(mono.lines.length); expect(author.lastDraft!.scenes[1].lines.length).toBeGreaterThanOrEqual(3);
  });
  it("una escena con acción narrada clara NO se marca como monólogo aunque KAP hable varias veces seguidas", async () => {
    const a = arc(), ok = { ...scene(1), lines: [{ speaker: "", text: text(1, 15, 5) }, { speaker: "KAP", text: text(1, 10, 20) }, { speaker: "KAP", text: text(1, 10, 30) }, { speaker: "KAP", text: text(1, 10, 40) }, { speaker: "", text: text(1, 15, 50) }, { speaker: "Hermano de KAP", text: text(1, 10, 70) }] };
    const { out } = await run([a, scene(0), ok, ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(out.stats!.gateIssues!["monologo-relleno"]).toBeUndefined();
  });
  it("VARIEDAD: si todo el episodio es plano y el arco permite desplazarse, se revisan SOLO los beats afectados, una vez", async () => {
    const flat = arc({ beats: arc().beats.map((b) => ({ ...b, location: "Casa de KAP", time: "noche" })) }), moved = { beats: [4, 5, 6].map((index) => ({ index, location: "Calle", time: "mañana", interior: false, why: "al día siguiente el problema se traslada a la calle" })) };
    const { llm, author, out } = await run([flat, moved, ...flat.beats.map((_, i) => scene(i))]); expect(out.stats!.arcRevisions).toBe(1); expect(llm.calls[1].system).toMatch(/Revisas SOLO el escenario/); expect(llm.calls).toHaveLength(10);
    expect(author.lastArc!.beats.map((b) => b.location)).toEqual(["Casa de KAP", "Casa de KAP", "Casa de KAP", "Casa de KAP", "Calle", "Calle", "Calle", "Casa de KAP"]); expect(llm.calls[1].prompt).toMatch(/beat 4[\s\S]*beat 5[\s\S]*beat 6/); expect(llm.calls[1].prompt).not.toMatch(/beat 0:.*\(ahora/);
  });
  it("VARIEDAD: sin motivo narrativo declarado (sin escenarios secundarios ni transiciones) no se fuerza ningún cambio", async () => {
    const flat = arc({ setting: { main: "Casa de KAP", secondary: [], timeOfDay: "noche", transitions: [] }, beats: arc().beats.map((b) => ({ ...b, location: "Casa de KAP", time: "noche" })) }), { llm, out } = await run([flat, ...flat.beats.map((_, i) => scene(i))]);
    expect(llm.calls).toHaveLength(9); expect(out.stats!.arcRevisions).toBe(0); expect(out.warnings.some((w) => /Variedad: todas las escenas ocurren en/.test(w))).toBe(true);
  });
  it("DESENLACE: si es intercambiable con el de un episodio anterior se revisa solo el final del arco (≤ 2 veces)", async () => {
    const same = arc({ hook: "Mañana la radio aparece en el colegio y nadie sabe quién la trajo otra vez" }), hints = { previousEpisodes: [{ locations: ["Calle"], outcome: "un gag con la radio", hook: "Mañana la radio aparece en el colegio y nadie sabe quién la trajo", ending: "La radio suena sola" }] };
    const { llm, author, out } = await run([same, ending(), ...same.beats.map((_, i) => scene(i))], ctx(), hints); expect(out.stats!.arcRevisions).toBe(1); expect(llm.calls[1].system).toMatch(/Revisas SOLO el final de un arco/); expect(llm.calls[1].prompt).toMatch(/Finales recientes[\s\S]*radio aparece en el colegio/); expect(author.lastArc!.hook).toMatch(/radio suena sola|aparece en el colegio/);
  });
  it("DESENLACE: no más de 2 revisiones; si sigue pareciéndose queda el aviso", async () => {
    const same = arc({ hook: "Mañana la radio aparece en el colegio y nadie sabe quién la trajo otra vez" }), hints = { previousEpisodes: [{ locations: ["Calle"], hook: "Mañana la radio aparece en el colegio y nadie sabe quién la trajo", ending: "La radio aparece en el colegio" }] }, still = ending({ hook: "Mañana la radio aparece en el colegio y nadie sabe quién la trajo hoy", closingSummary: "La radio aparece en el colegio y nadie sabe quién la trajo" });
    const { llm, out } = await run([same, still, still, ...same.beats.map((_, i) => scene(i))], ctx(), hints); expect(llm.calls.filter((c) => /Revisas SOLO el final/.test(c.system ?? ""))).toHaveLength(2); expect(out.warnings.some((w) => /Desenlace parecido/.test(w))).toBe(true);
  });
  it("el hermano activo: con acciones propias no se toca", async () => {
    const a = arc(), { llm } = await run(happy()); expect(llm.calls.filter(isPatch)).toHaveLength(0);
  });
  it("hints de la serie: escenarios y cómo terminaron los episodios anteriores entran en el prompt del arco", async () => {
    const { llm } = await run(happy(), ctx(), { previousEpisodes: [{ locations: ["Calle", "Calle"], settings: ["Calle de noche ×5"], outcome: "amargo", hook: "La vecina cierra la puerta y se lleva la llave" }], previousOutcomes: ["amargo"] }); expect(llm.calls[0].prompt).toMatch(/VARIEDAD DE LA SERIE[\s\S]*Calle de noche ×5/); expect(llm.calls[0].prompt).toMatch(/CÓMO TERMINARON LOS ÚLTIMOS EPISODIOS[\s\S]*La vecina cierra la puerta/); expect(llm.calls[0].prompt).toMatch(/Desenlaces recientes: amargo/);
  });
  it("un arco con etapas desordenadas se repara; si falta una etapa o KAP no decide, el modelo recibe el motivo", async () => {
    const shuffled = arc({ beats: [1, 0, 2, 3, 4, 5, 6, 6].map((i, k) => beat(k, STAGES[i], ["KAP"])) }), missing = arc({ beats: [0, 1, 2, 3, 4, 5, 6, 6].map((i, k) => beat(k, STAGES[i === 3 ? 2 : i])) }), good = arc();
    const { llm, author, out } = await run([missing, shuffled, ...good.beats.map((_, i) => scene(i))]); expect(llm.calls[1].prompt).toMatch(/falta la etapa «decision»/); expect(out.stats!.schemaErrors).toBe(1);
    expect(author.lastArc!.beats.map((b) => b.stage)).toEqual([...author.lastArc!.beats.map((b) => b.stage)].sort((x, y) => STAGES.indexOf(x) - STAGES.indexOf(y))); expect(out.warnings.some((w) => /reordenado/.test(w))).toBe(true);
    expect(EpisodeArc.safeParse(arc({ beats: arc().beats.map((b) => (b.stage === "decision" ? { ...b, characters: ["Hermano de KAP"] } : b)) })).success).toBe(false);
  });
  it("«continuando exactamente»: la primera escena usa el lugar del último plano y el reparto del último plano", async () => {
    const c = ctx({ exact: true }), { llm, author, out } = await run(happy(), c); expect(author.lastDraft!.scenes[0].location).toBe("Calle de noche"); expect(out.warnings.some((w) => /Calle de noche/.test(w))).toBe(true); expect(llm.calls[0].prompt).toMatch(/EXACTAMENTE/); expect(llm.calls[0].prompt).toMatch(/REPARTO POR DEFECTO: KAP\./);
  });
  it("un gancho genérico no tumba el arco: se avisa; el episodio corto NO se rellena", async () => {
    const a = arc({ hook: "Esto es solo el principio de todo lo que viene después." }), { llm, out } = await run([a, ...a.beats.map((_, i) => scene(i, { words: 20 }))]);
    expect(out.warnings.some((w) => /gancho del arco es genérico/.test(w))).toBe(true); expect(llm.calls.some((c) => /Ampliación/.test(c.prompt))).toBe(false); expect(out.stats!.estimatedSec).toBeLessThan(240);
  });
  it("el esquema del arco rechaza menos de 8 beats; el desenlace es texto libre, no una lista", () => { expect(EpisodeArc.safeParse(arc({ beats: arc().beats.slice(0, 5) })).success).toBe(false); expect(EpisodeArc.safeParse(arc({ outcome: "un fracaso divertido con la radio" })).success).toBe(true); });
  it("rima de apertura OBLIGATORIA por defecto: sin opciones se exige aunque el arco diga que no hace falta", async () => {
    const a = arc(), flat = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy");   // el arco trae una razón para no rimar, pero la configuración por defecto (openingRhyme:true) manda
    const { llm, author, out } = await run([a, flat, patch(RHYME), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, {});   // sin opciones: openingRhyme por defecto = true
    expect(llm.calls.filter(isPatch)).toHaveLength(1); expect(author.lastDraft!.scenes[0].lines[1].text).toBe(RHYME); expect(out.stats!.rhymeValid).toBe(true); expect(out.warnings.some((w) => /omitida/.test(w))).toBe(false);
  });
  it("openingRhyme:true explícito exige la rima aunque el arco declare una razón", async () => {
    const a = arc(), flat = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy"), { llm } = await run([a, flat, patch(RHYME), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    expect(llm.calls.filter(isPatch)).toHaveLength(1);
  });
  it("openingRhyme:false SOLO se respeta con una razón narrativa explícita del arco; entonces se omite y queda constancia", async () => {
    const a = arc(), flat = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy"), { llm, out } = await run([a, flat, ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: false });
    expect(llm.calls.filter(isPatch)).toHaveLength(0); expect(out.warnings.some((w) => /Rima de apertura omitida por razón narrativa del arco: KAP abre el episodio en silencio/.test(w))).toBe(true); expect(llm.calls[0].prompt).toMatch(/openingRhymeReason/);
  });
  it("openingRhyme:false SIN razón (o con una razón vacía o floja) se ignora: no sirve para esquivar una rima difícil", async () => {
    for (const reason of [undefined, "", "no pega", "   "]) {
      const a = arc({ openingRhymeReason: reason }), flat = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy"), { llm, out } = await run([a, flat, patch(RHYME), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: false });
      expect(llm.calls.filter(isPatch), String(reason)).toHaveLength(1); expect(out.warnings.some((w) => /openingRhyme:false ignorado/.test(w))).toBe(true); expect(out.stats!.rhymeValid).toBe(true);
    }
  });
  it("el prompt del arco solo ofrece declarar «openingRhymeReason» cuando la configuración permite openingRhyme:false", async () => {
    const a = arc(), on = await run([a, withKap(scene(0), RHYME), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true }); expect(on.llm.calls[0].prompt).not.toMatch(/openingRhymeReason/);
  });
  it("la rima de la escena prioriza la voz de KAP: el prompt local y el de escena fijan naturalidad > contexto > ritmo > rima y chileno ligero", async () => {
    const a = arc(), flat = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy"), { llm } = await run([a, flat, patch(RHYME), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    for (const c of [llm.calls[1], llm.calls.find(isPatch)!]) { expect(c.prompt).toMatch(/PRIORIDAD: 1\) que KAP suene NATURAL y como un niño, 2\)[\s\S]*3\) ritmo[\s\S]*4\) rima técnicamente correcta/); expect(c.prompt).toMatch(/NUNCA sacrifiques la voz infantil/); expect(c.prompt).toMatch(/Acento chileno LIGERO/); }
  });
  it("una rima perfecta pero artificial (poeta/adulto) no vale: se reescribe SOLO esa intervención hacia algo natural", async () => {
    const a = arc(), poem = withKap(scene(0), "Mi alma anhela el horizonte, la puerta del destino, y en esta casa eterna busco mi camino"), natural = "Cierro la puerta de la casa, me agarro un zapato con la mano";
    const { llm, author, out } = await run([a, poem, patch(natural), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    expect(llm.calls.filter(isPatch)).toHaveLength(1); expect(llm.calls.find(isPatch)!.prompt).toMatch(/suena a poema de adulto/); expect(author.lastDraft!.scenes[0].lines[1].text).toBe(natural); expect(out.stats!.rhymeValid).toBe(true); expect(out.stats!.scenesRegenerated).toBe(0);
  });
  it("un parche local FALLIDO (devuelve otro número de líneas) no abandona la rima: gasta presupuesto y se reintenta una vez más", async () => {
    const a = arc(), poem = withKap(scene(0), "Mi alma anhela el horizonte, la puerta del destino, y en esta casa eterna busco mi camino"), natural = "Cierro la puerta de la casa, me agarro un zapato con la mano";
    const { llm, author, out } = await run([a, poem, patch("una línea de más para nadie", "otra línea que sobra del todo"), patch(natural), ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    expect(llm.calls.filter(isPatch)).toHaveLength(2); expect(author.lastDraft!.scenes[0].lines[1].text).toBe(natural); expect(out.stats!.rhymeValid).toBe(true);
  });
  it("si todos los parches de rima fallan, el defecto se declara (no se marca como arreglado) y se respeta el tope", async () => {
    const a = arc(), poem = withKap(scene(0), "Mi alma anhela el horizonte, la puerta del destino, y en esta casa eterna busco mi camino"), bad = patch("una línea de más para nadie", "otra línea que sobra del todo");
    const { llm, out } = await run([a, poem, bad, bad, ...a.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    expect(llm.calls.filter(isPatch)).toHaveLength(2); expect(out.stats!.rhymeValid).toBe(false); expect(out.warnings.some((w) => /rima/i.test(w))).toBe(true);
  });
  it("métricas: las reescrituras locales, el desenlace y la variedad se cuentan por separado", async () => {
    const flat = arc({ beats: arc().beats.map((b) => ({ ...b, location: "Casa de KAP", time: "noche" })) }), moved = { beats: [4, 5, 6].map((index) => ({ index, location: "Calle", time: "mañana", interior: false, why: "al día siguiente el problema se traslada a la calle" })) };
    const bad = withKap(scene(0), "Tengo hambre y no hay pan en la mesa hoy"), { out } = await run([flat, moved, bad, patch(RHYME), ...flat.beats.slice(1).map((_, i) => scene(i + 1))], ctx(), undefined, { openingRhyme: true });
    expect(out.stats!.patchKinds).toEqual({ "rima-invalida": 1 }); expect(out.stats!.varietyRevisions).toBe(1); expect(out.stats!.endingRevisions).toBe(0); expect(out.stats!.arcRevisions).toBe(1); expect(out.stats!.localPatches).toBe(1);
  });
  it("MOSTRAR, NO EXPLICAR: si KAP explica el tema o sus emociones se reescribe SOLO esa línea (una llamada pequeña), sin regenerar la escena", async () => {
    const a = arc(), bad = { ...scene(1), lines: scene(1).lines.map((l, i) => (i === 1 ? { ...l, text: "No voy a rendirme, este es mi sueño y estoy nervioso" } : l)) }, fixed = "Se me cayó el cuaderno de las manos y lo pisé sin querer";
    const { llm, author, out } = await run([a, scene(0), bad, patch(fixed), ...a.beats.slice(2).map((_, i) => scene(i + 2))]); const p = llm.calls.filter(isPatch); expect(p).toHaveLength(1); expect(p[0].prompt).toMatch(/explica el tema o lo que siente en vez de mostrarlo/); expect(p[0].prompt).not.toContain("Arco del episodio");
    expect(out.stats!.scenesRegenerated).toBe(0); expect(author.lastDraft!.scenes[1].lines[1].text).toBe(fixed); expect(author.lastDraft!.scenes[1].lines[2].text).toBe(bad.lines[2].text);   // el resto de la escena no se toca
  });
  it("un secundario que solo valida o enseña: se reescribe su línea para darle una reacción propia", async () => {
    const a = arc(), bad = { ...scene(1), lines: scene(1).lines.map((l, i) => (i === 2 ? { ...l, text: "KAP, tienes algo especial. Yo te apoyo." } : l)) }, fixed = "¿Y mi bocadillo? Me dijiste que ibas a traerlo";
    const { llm, author, out } = await run([a, scene(0), bad, patch(fixed), ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(llm.calls.filter(isPatch)).toHaveLength(1); expect(llm.calls.find(isPatch)!.prompt).toMatch(/solo valida o enseña[\s\S]*reacción propia/); expect(author.lastDraft!.scenes[1].lines[2].text).toBe(fixed); expect(out.stats!.scenesRegenerated).toBe(0);
  });
  it("AGRUPACIÓN: explicar + validar + coste sin mostrar en la misma escena = UNA llamada local con las tres líneas", async () => {
    const a = arc(), cost = a.cost as string, bad = { ...scene(4), lines: [{ speaker: "", text: text(30, 20) }, { speaker: "KAP", text: "No voy a rendirme, este es mi sueño y estoy nervioso" }, { speaker: "Hermano de KAP", text: "Yo te apoyo, KAP, tienes algo especial" }, { speaker: "KAP", text: text(30, 10, 40) }, { speaker: "Hermano de KAP", text: text(30, 10, 60) }] };
    const replies: unknown[] = [a, ...a.beats.map((_, i) => (i === 4 ? bad : scene(i)))]; replies.splice(6, 0, patch(`El tendero se queda con ${cost.replace(/^Pierde /, "").split(" y ")[0]} y cierra la reja`, "Se me cayó el cuaderno y lo pisé sin querer", "¿Y mi bocadillo? Me dijiste que ibas a traerlo"));
    const { llm, out } = await run(replies); const p = llm.calls.filter(isPatch); expect(p).toHaveLength(1); expect(p[0].prompt).toMatch(/línea 1[\s\S]*línea 2[\s\S]*línea 3/); expect(p[0].prompt).toMatch(/coste concreto/); expect(out.stats!.localPatches).toBe(1); expect(out.stats!.scenesRegenerated).toBe(0); expect(out.stats!.gateIssues).toMatchObject({ "explica-emocion": 1, "validacion-moraleja": 1, "coste-ausente": 1 });
  });
  it("la escena de consecuencia recibe el COSTE de la decisión y el arco lo exige", async () => {
    const { llm } = await run(happy()); const conseq = llm.calls.find((c) => /"stage":"consecuencia"/.test(c.prompt))!; expect(conseq.prompt).toMatch(/costeQueSeDebeVer/); expect(llm.calls[0].prompt).toMatch(/"cost"/); expect(llm.calls[0].system).toMatch(/COSTE concreto/);
    expect(EpisodeArc.safeParse({ ...arc(), cost: undefined }).success).toBe(false);
  });
  it("el final de manual (dicho por el narrador) se reescribe SOLO el cierre y nace de lo ocurrido", async () => {
    const a = arc(), last = scene(7), bad = { ...last, lines: [...last.lines.slice(0, 4), { speaker: "", text: "Tu camino no será fácil." }] }, closing = `Suena el teléfono ${text(7, 5, 110)}`;
    const { llm, author, out } = await run([a, ...a.beats.slice(0, 7).map((_, i) => scene(i)), bad, patch(closing)]); const p = llm.calls.filter(isPatch); expect(p).toHaveLength(1); expect(p[0].prompt).toMatch(/frase de tráiler[\s\S]*nace de lo que acaba de ocurrir/); expect(author.lastDraft!.scenes.at(-1)!.lines.at(-1)!.text).toBe(closing); expect(out.stats!.scenesRegenerated).toBe(0);
  });
  it("KAP_REALISM_CHECK: se ejecuta tras generar, informa de las nueve comprobaciones y no regenera nada", async () => {
    const { llm, author, out } = await run(happy()); expect(author.lastRealism!.total).toBe(13); expect(author.lastRealism!.passed + author.lastRealism!.failed.length).toBe(13); expect(out.stats!.realism).toEqual({ passed: author.lastRealism!.passed, total: 13, failed: author.lastRealism!.failed });
    for (const f of author.lastRealism!.failed) expect(out.warnings.some((w) => w.startsWith(`KAP_REALISM_CHECK · ${f}`))).toBe(true); expect(llm.calls).toHaveLength(9);   // revisar no cuesta ninguna llamada al modelo
  });
  it("los prompts fijan acción > reacción > diálogo > explicación, voz de niño real, decisión con coste, secundarios con reacción propia y finales que nacen de la acción", async () => {
    const { llm } = await run(happy()); for (const c of [llm.calls[0], llm.calls[1]]) { const t = c.system ?? ""; expect(t).toMatch(/ACCIÓN de KAP > REACCIÓN de KAP > DIÁLOGO natural > EXPLICACIÓN/); expect(t).toMatch(/estoy nervioso/); expect(t).toMatch(/equivocarse al hablar[\s\S]*broma en un momento inoportuno/); expect(t).toMatch(/SITUACIÓN → PROBLEMA → DECISIÓN de KAP → CONSECUENCIA → NUEVA SITUACIÓN/); expect(t).toMatch(/Ramiro puede equivocarse[\s\S]*profesora puede no saber qué hacer[\s\S]*INFLUYE/); expect(t).toMatch(/EL FINAL NACE DE LO QUE ACABA DE OCURRIR/); expect(t).toMatch(/El escenario y el momento cambian solo porque la historia lo necesita/); }
  });
  it("CONDUCTA planificada en el arco: los momentos de conducta llegan al encargo de SU escena (aunque se reordenen las etapas) y el error se pasa a todas", async () => {
    const beats = arc().beats, a = arc({ behaviorBeats: [{ beat: 2, kind: "malentendido", does: "Entiende que el rapero le prohíbe cantar y se lo cuenta a Dani", provokes: "Dani lo cuenta en el colegio y todos se ríen" }, { beat: 99, kind: "tonteria", does: "No debería existir esta referencia fuera de rango", provokes: "se ignora" }].slice(0, 1), mistake: { misread: "cree que el rapero lo echa", actsOn: "se lo cuenta a Dani", reaction: "Dani lo difunde", discovery: "el rapero solo pedía que bajara la voz", fix: "va a pedirle perdón al rapero con Dani delante" }, beats: [beats[1], beats[0], ...beats.slice(2)] });   // etapas desordenadas: los beats 0 y 1 se intercambian al repararlas
    const { llm, author } = await run([a, ...a.beats.map((_, i) => scene(i))]); const brief = llm.calls.map((c) => c.prompt).filter((p) => /comportamientoDeKAP/.test(p));
    expect(brief).toHaveLength(1); expect(brief[0]).toMatch(/"stage":"escalada"[\s\S]*comportamientoDeKAP[\s\S]*malentendido/); expect(llm.calls[1].prompt).toMatch(/"behaviorBeats":\[\{"beat":3,"kind":"malentendido"/); expect(llm.calls[1].prompt).toMatch(/"mistake":\{"misread":"cree que el rapero lo echa"/);
    expect(author.lastArc!.behaviorBeats).toHaveLength(1);
  });
  it("la conducta es OPCIONAL: un arco sin momentos de conducta ni error sigue siendo válido y no se inventa ninguno", async () => {
    expect(EpisodeArc.safeParse({ ...arc(), behaviorBeats: [] }).success).toBe(true); expect(EpisodeArc.safeParse({ ...arc(), mistake: undefined }).success).toBe(true); expect(EpisodeArc.safeParse({ ...arc(), behaviorBeats: Array(5).fill({ beat: 1, kind: "impulso", does: "hace algo sin pensar", provokes: "alguien reacciona" }) }).success).toBe(false);   // máximo 4: no es una plantilla
    const { llm } = await run(happy()); expect(llm.calls.filter((c) => /comportamientoDeKAP/.test(c.prompt))).toHaveLength(0);
  });
  it("las escenas declaran lo que KAP HACE y su estado, y las siguientes ven los estados anteriores", async () => {
    const { llm, author } = await run(happy()); expect(llm.calls[1].system).toMatch(/"kapDoes"[\s\S]*acción visible[\s\S]*"kapState"/); expect(llm.calls[1].system).toMatch(/Si el estado de KAP ya era ese en la escena anterior/); expect(llm.calls[2].prompt).toMatch(/KAP: KAP agarra la bolsa y sale corriendo detrás del tendero \(nervioso\)/);
    const bad = arc(); expect(() => EpisodeArc.parse(bad)).not.toThrow(); void author;
  });
  it("KAP que solo piensa: se repara UNA línea narrada con una llamada pequeña; no se regenera la escena ni se pasa de una llamada", async () => {
    const a = arc(), talky = { ...scene(2), kapDoes: "Piensa en lo que ha pasado", lines: [{ speaker: "", text: text(2, 20) }, { speaker: "KAP", text: text(2, 12, 40) }, { speaker: "Hermano de KAP", text: text(2, 12, 70) }, { speaker: "KAP", text: text(2, 10, 90) }, { speaker: "Hermano de KAP", text: text(2, 10, 110) }] }, fixed = "KAP le quita la bolsa de las manos al tendero y echa a correr con ella";
    const { llm, author, out } = await run([a, scene(0), scene(1), talky, patch(fixed), ...a.beats.slice(3).map((_, i) => scene(i + 3))]); const p = llm.calls.filter(isPatch); expect(p).toHaveLength(1); expect(p[0].prompt).toMatch(/KAP habla o piensa pero no hace nada/); expect(p[0].prompt).not.toContain("Arco del episodio");
    expect(out.stats!.scenesRegenerated).toBe(0); expect(out.stats!.localPatches).toBe(1); expect(author.lastDraft!.scenes[2].lines[0].text).toBe(fixed); expect(author.lastDraft!.scenes[2].lines[1].text).toBe(talky.lines[1].text);   // solo cambia la línea narrada
  });
  it("la misma emoción dos escenas seguidas sin avanzar: se repara la línea narrada (sin regenerar), junto con lo demás en una sola llamada", async () => {
    const a = arc(), stuck = scene(1, { state: "nervioso", doing: "Sigue pensando en lo que hizo" }), fixed = "KAP marca el número del tendero y cuelga de golpe cuando lo oye respirar";
    const { llm, out } = await run([a, scene(0, { state: "nervioso" }), stuck, patch(fixed), ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(llm.calls.filter(isPatch)).toHaveLength(1); expect(out.stats!.gateIssues).toMatchObject({ "emocion-repetida": 1 }); expect(out.stats!.scenesRegenerated).toBe(0);
  });
  it("COSTE: un episodio con conducta correcta no añade ninguna llamada (9 llamadas: arco + 8 escenas)", async () => { const { llm, out } = await run(happy()); expect(llm.calls).toHaveLength(9); expect(out.stats!.localPatches).toBe(0); expect(out.stats!.scenesRegenerated).toBe(0); });
  it("CADENA CAUSAL: cada escena recibe el cambio de la anterior y lo que la conducta de KAP dejó abierto", async () => {
    const a = arc({ behaviorBeats: [{ beat: 1, kind: "esconder", does: "KAP esconde el pan bajo la camisa", provokes: "el tendero cree que lo robó", reaction: "el tendero avisa al hermano mayor" }] });
    const { llm } = await run([a, ...a.beats.map((_, i) => scene(i))]), brief = (k: number) => JSON.parse(llm.calls[k].prompt.split("corresponde a este beat del arco:\n")[1].split("\n")[0]);
    expect(brief(1).heredaDeLaEscenaAnterior).toBeUndefined();   // primera escena: nada que heredar
    expect(brief(2).heredaDeLaEscenaAnterior).toMatchObject({ cambio: expect.stringContaining("Pasa"), kapHizo: expect.any(String) }); expect(brief(3).heredaDeLaEscenaAnterior.quedaAbierto).toMatch(/robó → el tendero avisa/);
    expect(llm.calls[2].prompt).toContain("cambió:");   // el resumen de las escenas ya escritas incluye lo que cambió
  });
  it("CADENA CAUSAL: un rumor que aparece sin causa se repara con UNA llamada local sobre la línea de apertura (sin regenerar la escena)", async () => {
    const a = arc(), orphan = { ...scene(2), lines: [{ speaker: "", text: "Un rumor recorre toda la escuela sobre algo que nadie sabe explicar bien" }, ...scene(2).lines.slice(1)] };
    const { llm, out } = await run([a, scene(0), scene(1), orphan, patch(`${text(1, 3, 120)} Dani cuenta lo que vio en la mochila de KAP durante el recreo largo`), ...a.beats.slice(3).map((_, i) => scene(i + 3))]);
    expect(llm.calls.filter(isPatch)).toHaveLength(1); expect(out.stats!.patchKinds!["sin-antecedente"]).toBe(1); expect(out.stats!.scenesRegenerated).toBe(0);
  });
  it("KAP_REALISM_CHECK incluye ahora las comprobaciones de conducta y lee lo declarado por las escenas", async () => {
    const a = arc(), states = ["triste", "enfadado", "nervioso", "asustado", "avergonzado", "culpable", "aliviado", "confuso"], pensive = a.beats.map((_, i) => { const sc = scene(i, { doing: "Piensa en lo que pasó", state: states[i] }); return { ...sc, lines: [sc.lines[0], sc.lines[1], sc.lines[2], sc.lines[4], { speaker: "Hermano de KAP", text: text(i, 10, 130) }] }; });   // una sola línea de KAP: no hay nada que reparar en la puerta, solo que informar
    const { author, out } = await run([a, ...pensive]); expect(author.lastRealism!.total).toBe(13); expect(author.lastRealism!.failed).toEqual(expect.arrayContaining(["kap-actua", "no-demasiado-reflexivo"])); expect(out.warnings.some((w) => /KAP_REALISM_CHECK · no-demasiado-reflexivo/.test(w))).toBe(true); expect(out.stats!.localPatches).toBe(0);
  });
  it("el prompt prioriza conducta sobre lenguaje y fija ACCIÓN → REACCIÓN → IMPROVISACIÓN → CONSECUENCIA, el error que mueve la historia y finales sin moraleja", async () => {
    const { llm } = await run(happy()); for (const c of [llm.calls[0], llm.calls[1]]) { const t = c.system ?? ""; expect(t).toMatch(/CONDUCTA INFANTIL, NO SOLO LENGUAJE INFANTIL/); expect(t).toMatch(/ACCIÓN → REACCIÓN → IMPROVISACIÓN → CONSECUENCIA, nunca SITUACIÓN → REFLEXIÓN → MORALEJA/); expect(t).toMatch(/naturalidad > comportamiento infantil > conflicto > moraleja/); expect(t).toMatch(/No es una lista que cumplir/); expect(t).toMatch(/El ERROR mueve la historia[\s\S]*tiene que arreglar el problema que él mismo creó/); expect(t).toMatch(/Una emoción ya establecida NO se repite/); expect(t).toMatch(/filósofo pequeño/); expect(t).toMatch(/Sin caricatura/); expect(t).toMatch(/Los secundarios tienen voluntad propia[\s\S]*KAP no controla siempre la conversación/); expect(t).toMatch(/consecuencia concreta → reacción de KAP → nuevo problema o pregunta natural → corte/); }
    expect(llm.calls[0].system).toMatch(/nunca plantilla[\s\S]*"behaviorBeats"/);
  });
});

// ------------------------------------------------------------------ capa de SECUENCIAS (planificación: idea → arco → secuencias → beats visuales → escenas)
/** Arco en formato nuevo: SECUENCIAS (sin «beats»), con acontecimientos visibles, lugar/hora/personajes y nivel de diálogo. */
const seqArc = (places: string[] = ["Calle", "Tienda", "Casa de KAP", "Calle", "Tienda", "Casa de KAP"], over: Record<string, unknown> = {}) => {
  const { beats: _legacy, ...rest } = arc(), n = places.length;
  return { ...rest, sequences: places.map((loc, i) => ({ purpose: `Aporta ${text(i, 3, 600)} a la historia`, stage: i === 0 ? "inicio" : i === n - 1 ? "gancho" : "escalada", location: loc, time: i % 2 ? "noche" : "mañana", characters: ["KAP", "Hermano de KAP"],
    beats: [`KAP entra y deja algo ${text(i, 2, 500)}`, `se oye un ruido ${text(i, 2, 520)}`, `mira hacia la puerta ${text(i, 2, 540)}`], change: `Cambia ${text(i, 5, 300)} de forma visible`, shot: i === 1 ? "general" : "medio", ...(i === 1 ? { talk: "ninguno" } : {}) })), ...over };
};
describe("secuencias: planificación ligera antes de las escenas", () => {
  it("una secuencia puede contener beats (acontecimientos) y se valida; no hace falta «beats», ni 8 secuencias, ni decisión/consecuencia", () => {
    const r = EpisodeArc.safeParse(seqArc()); expect(r.success).toBe(true); expect(arcBeats(r.data!)).toHaveLength(6);
    expect(EpisodeArc.safeParse(seqArc(["Calle", "Tienda", "Casa de KAP", "Calle"])).success).toBe(true);   // 4 secuencias: las que pida la historia
    const noEnd = seqArc(); (noEnd.sequences as { stage: string }[])[5].stage = "escalada"; const bad = EpisodeArc.safeParse(noEnd); expect(bad.success).toBe(false); expect(JSON.stringify(bad.error!.issues)).toMatch(/falta la etapa «gancho»/);
    const noStages = { ...arc(), beats: undefined, sequences: undefined }; expect(EpisodeArc.safeParse(noStages).success).toBe(false);
    expect(EpisodeArc.safeParse(arc()).success).toBe(true);   // el formato anterior (beats) sigue valiendo
  });
  it("secuencia → beat: conserva lugar, hora, personajes y cambio; los acontecimientos y el diálogo viajan al encargo de la escena", () => {
    const s = (seqArc().sequences as Parameters<typeof sequenceToBeat>[0][])[1], b = sequenceToBeat(s);
    expect(b).toMatchObject({ stage: s.stage, location: s.location, time: s.time, characters: s.characters, change: s.change, why: s.purpose, shot: "general", talk: "ninguno", fn: "avanzar-historia" });
    expect(b.events).toEqual(s.beats); expect(b.summary).toContain(s.beats[0]); expect(b.summary).toContain(" → "); expect(b.summary.length).toBeLessThanOrEqual(280);
    const mk = (location: string, interior?: boolean) => sequenceToBeat({ ...s, location, ...(interior === undefined ? {} : { interior }) }).interior;
    expect(mk("Pasillo")).toBe(true); expect(mk("Habitación de KAP")).toBe(true); expect(mk("Patio de la casa")).toBe(false); expect(mk("Calle")).toBe(false); expect(mk("Calle", true)).toBe(true);   // interior/exterior se infiere salvo que la secuencia lo diga
    expect(sequenceToBeat({ ...s, beats: ["Sale"] , purpose: "Cierra la escena con un gesto" }).summary.length).toBeGreaterThanOrEqual(12);
  });
  it("el plan se convierte en escenas: una por secuencia (6, no 8), con su lugar y hora, y el encargo trae los acontecimientos y el diálogo pedido", async () => {
    const a = seqArc(), { llm, author, out } = await run([a, ...a.sequences.map((_, i) => scene(i))]);
    expect(author.lastDraft!.scenes).toHaveLength(6); expect(author.lastDraft!.scenes.map((x) => x.location)).toEqual(a.sequences.map((x) => x.location)); expect(author.lastDraft!.scenes.map((x) => x.time)).toEqual(a.sequences.map((x) => x.time));
    const brief = (k: number) => JSON.parse(llm.calls[k].prompt.split("corresponde a este beat del arco:\n")[1].split("\n")[0]);
    expect(brief(1).acontecimientos).toEqual(a.sequences[0].beats); expect(brief(1).dialogo).toBeUndefined(); expect(brief(2).dialogo).toBe("ninguno"); expect(brief(2).acontecimientos).toHaveLength(3);
    expect(author.lastArc!.beats).toHaveLength(6); expect(out.stats!.scenesDropped).toBe(0); expect(llm.calls).toHaveLength(7);   // 1 arco + 6 escenas: la capa NO añade llamadas
  });
  it("el flujo anterior (beats) sigue igual: 8 escenas, sin acontecimientos ni diálogo en el encargo", async () => {
    const { llm, author } = await run(happy()); expect(author.lastDraft!.scenes).toHaveLength(8); expect(llm.calls[1].prompt).not.toContain("acontecimientos"); expect(author.lastArc!.sequences).toBeUndefined();
  });
  it("la personalidad de KAP y la planificación por secuencias llegan al arco y a las escenas", async () => {
    const a = seqArc(), { llm } = await run([a, ...a.sequences.map((_, i) => scene(i))]);
    expect(llm.calls[0].system).toContain(KAP_PERSONALITY); expect(llm.calls[0].system).toMatch(/PLANIFICAS EN SECUENCIAS/); expect(llm.calls[0].system).toMatch(/NO es un beat/);
    expect(llm.calls[1].system).toContain(KAP_PERSONALITY); expect(llm.calls[1].system).toMatch(/LA ESCENA SALE DE LA SECUENCIA/); expect(llm.calls[1].system).toMatch(/no verbaliza lo que siente/);
  });
  it("el piloto usa otra planificación (historia de origen, varias fases y lugares, sin exigir el coste) y los episodios normales no", async () => {
    const places = ["Habitación de KAP", "Habitación de KAP", "Pasillo", "Cocina", "Pasillo", "Habitación de KAP", "Habitación de KAP"], a = seqArc(places);
    const pilot = await run([a, ...a.sequences.map((_, i) => scene(i))], ctx({ number: 1, notes: "Crea el episodio 1: el piloto" }));
    expect(pilot.llm.calls[0].prompt).toMatch(/HISTORIA DE ORIGEN/); expect(pilot.llm.calls[1].prompt).toMatch(/PILOTO \(historia de origen\)/);
    expect(pilot.author.lastDraft!.scenes.map((x) => x.location)).toEqual(places); expect(pilot.out.stats!.gateIssues!["coste-ausente"]).toBeUndefined();   // en el piloto no se exige el coste de una decisión
    const normal = await run([a, ...a.sequences.map((_, i) => scene(i))], ctx({ number: 4 }), { previousEpisodes: [{ locations: ["Calle"], settings: [], hook: "x", ending: "y" }] } as never);
    expect(normal.llm.calls[0].prompt).not.toMatch(/HISTORIA DE ORIGEN/); expect(normal.llm.calls[1].prompt).not.toMatch(/PILOTO \(historia de origen\)/);
  });
});

describe("menos escenas, mejores: el mismo momento no es otra escena", () => {
  it("beats consecutivos que cuentan lo mismo (mismo lugar, mismos personajes, mismos acontecimientos) se fusionan; los distintos no", () => {
    const b = (summary: string, loc = "Habitación de KAP", stage = "escalada") => sequenceToBeat({ purpose: "Aporta algo a la historia", stage, location: loc, time: "noche", characters: ["KAP", "Hermano de KAP"], beats: summary.split(" / "), change: `Cambia ${summary.slice(0, 12)} de forma visible`, } as never);
    const same = mergeRepeatedBeats([b("KAP mira el teléfono / el hermano mira la pantalla", "Habitación de KAP", "inicio"), b("KAP mira el teléfono / el hermano mira la pantalla otra vez"), b("KAP guarda el teléfono / el hermano intenta quitárselo / KAP lo aparta")]);
    expect(same.merged).toBe(1); expect(same.beats).toHaveLength(2); expect(same.beats[0].stage).toBe("inicio"); expect(same.beats[0].events).toContain("KAP mira el teléfono");
    expect(mergeRepeatedBeats([b("KAP mira el teléfono / el hermano mira la pantalla"), b("KAP mira el teléfono / el hermano mira la pantalla", "Pasillo")]).merged).toBe(0);   // otro lugar: es otra escena
  });
  it("en la generación: un arco con dos beats repetidos produce una escena menos y lo avisa (no se alarga con relleno)", async () => {
    const a = arc(); a.beats.splice(6, 0, { ...a.beats[5] });   // 9 beats, el 6.º y el 7.º son el mismo momento
    const { author, out } = await run([a, ...a.beats.slice(0, 8).map((_, i) => scene(i))]);
    expect(author.lastDraft!.scenes).toHaveLength(8); expect(out.warnings.some((w) => /fusionado 1 beat/.test(w))).toBe(true);
  });
});
