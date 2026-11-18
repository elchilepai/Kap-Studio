import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import { EpisodeArc, llmArcAuthor } from "./arc";
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
const arc = (over: Record<string, unknown> = {}) => ({ title: "El fiado", logline: "KAP pide fiado y la tienda se lo niega.", assumptions: [], problem: "No hay comida para el hermano", kapWant: "Conseguir pan", kapChoice: "Vende su radio sin pensarlo bien", consequence: "Pierde su radio y sigue sin pan", outcome: "amargo", hook: "El tendero guarda la radio de KAP bajo el mostrador y pide el resto del dinero mañana.",
  extraCharacters: [{ name: "Hermano de KAP", why: "está en casa sin comer" }], castActions: [{ name: "Hermano de KAP", does: "esconde el último pan" }], usedFromMemory: ["Hermano de KAP"], newCharacters: [], newPlaces: [], beats: [0, 1, 2, 3, 4, 5, 5, 6].map((i, k) => beat(k, STAGES[i], k % 2 ? ["KAP", "Hermano de KAP"] : ["KAP"])), ...over });
/** Escena válida de ≈ 70 palabras con otro personaje y un cambio propio. */
const scene = (n: number, o: { words?: number; speaker?: string; same?: string; change?: string; sib?: string } = {}) => ({ title: `Escena ${n}`, lines: [{ speaker: "", text: o.same ?? text(n, o.words ?? 20) }, { speaker: "KAP", text: `${text(n, 12, 40)}` }, { speaker: o.speaker ?? "Hermano de KAP", text: o.sib ?? `${text(n, 12, 70)}` }, { speaker: "KAP", text: text(n, 10, 90) }, { speaker: o.speaker ?? "Hermano de KAP", text: o.sib ?? text(n, 10, 110) }], change: o.change ?? `Pasa ${text(n, 6, 120)}`, directions: ["expresion: KAP triste", "baila: KAP por la luna"], memory: ["acto: inicio | no debería pasar", "inventa: algo raro", "obtiene: KAP, radio"] });
const ctx = (over: Partial<ContextPack["request"]> = {}): ContextPack => ({ request: { text: "x", number: 4, season: 1, exact: false, cast: [], notes: "Crea el episodio 4", ...over }, budgetTokens: 1000, usedTokens: 10, sections: [{ id: "lastshot", title: "Último plano", text: "Escena «Fin» en Calle de noche; personajes: KAP", tokens: 5, itemsTotal: 1, itemsIncluded: 1 }], dropped: [], relevantCharacters: ["KAP", "Hermano de KAP", "Ramiro"], text: "# Contexto\n- KAP, 9 años" });
const run = async (replies: unknown[], c = ctx(), hints?: Parameters<ReturnType<typeof llmArcAuthor>["write"]>[0]["hints"]) => { const llm = new Scripted(replies.map((r) => (typeof r === "string" ? r : JSON.stringify(r)))), author = llmArcAuthor(llm); const out = await author.write({ request: c.request, context: c, hints }); return { llm, author, out }; };
const happy = () => { const a = arc(); return [a, ...a.beats.map((_, i) => scene(i))]; };

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
    expect(out.script).toMatch(/\[mood: mañana, interior\]/); expect(out.stats!.scenesRegenerated).toBe(0); expect(out.stats!.scenesDropped).toBe(0);
  });
  it("una escena corta se regenera pidiendo contenido real (no relleno) y se queda con la mejor", async () => {
    const a = arc(), replies: unknown[] = [a, scene(0, { words: 8 }), scene(0), ...a.beats.slice(1).map((_, i) => scene(i + 1))];
    const { llm, out } = await run(replies); expect(llm.calls).toHaveLength(1 + 8 + 1); expect(llm.calls[2].prompt).toMatch(/Escena corta \(\d+ palabras\)[\s\S]*no relleno ni frases motivacionales/); expect(llm.calls[2].prompt).toMatch(/¿qué ha cambiado al terminar esta escena/);
    expect(out.stats!.scenesRegenerated).toBe(1); expect(out.stats!.gateIssues!.corta).toBe(1);
  });
  it("una repetición clara se regenera; si sigue repitiendo, la escena se ELIMINA (salvo las esenciales)", async () => {
    const a = arc(), clone = { ...scene(0), change: "Pasa otro cambio inventado qrs distinto" };   // copia de la escena 0 salvo el cambio declarado
    const { llm, author, out } = await run([a, scene(0), scene(1), scene(2), scene(3), scene(4), clone, clone, clone, scene(6), scene(7)]);
    expect(author.lastDraft!.scenes).toHaveLength(7); expect(out.stats!.scenesDropped).toBe(1); expect(out.stats!.gateIssues!["repite-escena"]).toBe(3); expect(out.warnings.some((w) => /eliminada/.test(w))).toBe(true);
    expect(llm.calls.filter((c) => /no era aceptable/.test(c.prompt))).toHaveLength(2); expect(author.lastDraft!.scenes.flatMap((s) => s.memory).filter((m) => m.startsWith("acto: "))).toHaveLength(6);   // los actos se recalculan sobre las escenas finales
  });
  it("una escena esencial (única de su etapa) no se elimina aunque repita: se conserva con aviso", async () => {
    const a = arc(), clone = { ...scene(0), change: "Pasa otro cambio inventado qrs distinto" };
    const { author, out } = await run([a, scene(0), clone, clone, clone, ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(author.lastDraft!.scenes).toHaveLength(8); expect(out.stats!.scenesDropped).toBe(0); expect(out.warnings.some((w) => /Escena 2: Repite casi literalmente/.test(w))).toBe(true);
  });
  it("un diálogo repetido de una escena anterior bloquea y regenera", async () => {
    const a = arc(), dupLine = text(0, 12, 40), s2 = { ...scene(1), lines: [{ speaker: "", text: text(1, 20) }, { speaker: "KAP", text: dupLine }, { speaker: "Hermano de KAP", text: text(1, 12, 70) }, { speaker: "KAP", text: text(1, 10, 90) }, { speaker: "Hermano de KAP", text: text(1, 10, 110) }] };
    const { llm, out } = await run([a, scene(0), s2, scene(1), ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(out.stats!.gateIssues!["repite-frase"]).toBe(1); expect(llm.calls[3].prompt).toMatch(/ya se había dicho/);
  });
  it("la memoria no entra por defecto: Ramiro se quita del beat y su aparición en una escena se regenera", async () => {
    const withRamiro = arc({ beats: arc().beats.map((b, k) => (k === 2 ? { ...b, characters: ["KAP", "Ramiro"] } : b)) });
    const replies: unknown[] = [withRamiro, scene(0), scene(1), scene(2, { speaker: "Ramiro" }), scene(2), ...withRamiro.beats.slice(3).map((_, i) => scene(i + 3))];
    const { author, out } = await run(replies); expect(author.lastArc!.beats[2].characters).toEqual(["KAP"]); expect(out.warnings.some((w) => /Ramiro.*sin justificarlo/.test(w))).toBe(true); expect(out.stats!.gateIssues!["personaje-no-previsto"]).toBe(1);
  });
  it("un personaje de la memoria justificado como extra del arco sí puede aparecer", async () => {
    const a = arc({ extraCharacters: [{ name: "Hermano de KAP", why: "está en casa sin comer" }, { name: "Ramiro", why: "tiene el micrófono que KAP necesita" }], beats: arc().beats.map((b, k) => (k === 2 ? { ...b, characters: ["KAP", "Ramiro"] } : b)) });
    const { author } = await run([a, scene(0), scene(1), scene(2, { speaker: "Ramiro" }), ...a.beats.slice(3).map((_, i) => scene(i + 3))]); expect(author.lastArc!.beats[2].characters).toContain("Ramiro");
  });
  it("el hermano que solo reacciona con frases cortas se regenera para darle algo propio", async () => {
    const a = arc(), s1 = scene(1, { sib: "Kap... ¿estás bien?" }), s1b = { ...s1, lines: [...s1.lines, { speaker: "Hermano de KAP", text: "Kap... duele." }] };
    const { llm, out } = await run([a, scene(0), s1b, scene(1), ...a.beats.slice(2).map((_, i) => scene(i + 2))]); expect(out.stats!.gateIssues!["hermano-reactivo"]).toBe(1); expect(llm.calls[3].prompt).toMatch(/solo reacciona/);
  });
  it("la voz de adulto o los lemas de KAP se regeneran", async () => {
    const a = arc(), s0 = { ...scene(0), lines: [{ speaker: "", text: text(0, 30) }, { speaker: "KAP", text: "No me rendiré jamás, mi voz va más allá y mi sueño nadie lo detiene." }, { speaker: "Hermano de KAP", text: text(0, 12, 70) }, { speaker: "KAP", text: text(0, 10, 90) }, { speaker: "Hermano de KAP", text: text(0, 10, 110) }] };
    const { llm, out } = await run([a, s0, scene(0), ...a.beats.slice(1).map((_, i) => scene(i + 1))]); expect(out.stats!.gateIssues!["voz-adulta"]).toBe(1); expect(llm.calls[2].prompt).toMatch(/suena a eslogan/);
  });
  it("la primera rima pide nacer de la situación concreta, sin discurso genérico", async () => {
    const a = arc({ kapChoice: "KAP improvisa una rima por primera vez" }), { llm } = await run([a, ...a.beats.map((_, i) => scene(i))]); expect(llm.calls[1].prompt).toMatch(/RIMA \(primera vez/); expect(llm.calls[1].prompt).toMatch(/nombrando cosas concretas/);
  });
  it("hints de la serie: escenarios y desenlaces recientes entran en el prompt del arco", async () => {
    const { llm } = await run(happy(), ctx(), { previousEpisodes: [{ locations: ["Calle", "Calle"], settings: ["Calle de noche ×5"] }], previousOutcomes: ["amargo"] }); expect(llm.calls[0].prompt).toMatch(/VARIEDAD DE LA SERIE[\s\S]*Calle de noche ×5/); expect(llm.calls[0].prompt).toMatch(/Desenlaces recientes: amargo/);
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
  it("el esquema del arco rechaza menos de 8 beats", () => { expect(EpisodeArc.safeParse(arc({ beats: arc().beats.slice(0, 5) })).success).toBe(false); });
});
