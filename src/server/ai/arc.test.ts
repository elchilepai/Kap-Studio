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
const STAGES = ["inicio", "problema", "escalada", "decision", "consecuencia", "resolucion", "gancho"], PLACES = ["Casa de KAP", "Calle", "Tienda", "Casa de KAP"];
const beat = (i: number, stage = STAGES[Math.min(i, 6)]) => ({ stage, fn: stage === "problema" ? "conflicto" : "avanzar-historia", summary: `Ocurre algo distinto número ${i} con consecuencias`, location: PLACES[i % 4], characters: ["KAP"], time: i % 2 ? "noche" : "mañana", interior: i % 2 === 0, shot: ["general", "medio", "primer plano"][i % 3], visual: "KAP mira la puerta" });
const arc = (over: Record<string, unknown> = {}) => ({ title: "El fiado", logline: "KAP pide fiado y la tienda se lo niega.", assumptions: [], problem: "No hay comida para el hermano", kapWant: "Conseguir pan", kapChoice: "Vende su radio sin pensarlo bien", consequence: "Pierde su radio y sigue sin pan", outcome: "amargo", hook: "El tendero guarda la radio de KAP bajo el mostrador y pide el resto del dinero mañana.",
  usedFromMemory: ["Hermano de KAP"], newCharacters: [], newPlaces: [], beats: [0, 1, 2, 3, 4, 5, 5, 6].map((i, k) => beat(k, STAGES[i])), ...over });
const VOC = ["pan caliente mostrador monedas", "radio antigua pilas oxidadas", "puerta chirriante pasillo oscuro", "deuda vecina escalera cartel", "tienda balanza tendero cuaderno", "calle farola charco bicicleta", "mochila cremallera zapatillas rotas", "ventana cortina luciérnaga almohada"], SPK = ["precio justo", "hambre vieja", "miedo callado", "rabia contenida", "plan absurdo", "error tonto", "tiempo robado", "casa fría"];
const scene = (n: number) => ({ title: `Escena ${n}`, lines: [{ speaker: "", text: `KAP observa ${VOC[n % 8]} mientras amanece despacio.` }, { speaker: "KAP", text: `Esto es ${SPK[n % 8]}, y nadie lo arregla por mí.` }], directions: ["expresion: KAP triste", "baila: KAP por la luna"], memory: ["acto: inicio | no debería pasar", "inventa: algo raro", "obtiene: KAP, radio"] });
const ctx = (over: Partial<ContextPack["request"]> = {}): ContextPack => ({ request: { text: "x", number: 4, season: 1, exact: false, cast: [], notes: "Crea el episodio 4", ...over }, budgetTokens: 1000, usedTokens: 10, sections: [{ id: "lastshot", title: "Último plano", text: "Escena «Fin» en Calle de noche; personajes: KAP", tokens: 5, itemsTotal: 1, itemsIncluded: 1 }], dropped: [], relevantCharacters: ["KAP", "Hermano de KAP"], text: "# Contexto\n- KAP, 9 años" });

describe("generador por arco (arco → escenas)", () => {
  it("diseña el arco y escribe una escena por beat, con actos y gancho fijados por el código", async () => {
    const a = arc(), llm = new Scripted([JSON.stringify(a), ...a.beats.map((_, i) => JSON.stringify(scene(i)))]); const author = llmArcAuthor(llm);
    const out = await author.write({ request: ctx().request, context: ctx() });
    expect(llm.calls).toHaveLength(1 + a.beats.length); expect(llm.calls[0].system).toMatch(/DISEÑAR EL ARCO/); expect(llm.calls[1].system).toMatch(/UNA escena/);
    expect(llm.calls[1].prompt).toContain("Arco del episodio"); expect(llm.calls[2].prompt).toContain("Escena 0");            // cada escena ve lo ya escrito
    const d = author.lastDraft!; expect(d.scenes).toHaveLength(8);
    const mem = d.scenes.flatMap((s) => s.memory); for (const act of ["inicio", "conflicto", "desarrollo", "emocional", "resolucion", "gancho"]) expect(mem.some((m) => m.startsWith(`acto: ${act} |`))).toBe(true);
    expect(mem.filter((m) => m.startsWith("gancho:"))).toHaveLength(1); expect(d.scenes.at(-1)!.memory.some((m) => m.startsWith("gancho: El tendero"))).toBe(true);
    expect(mem).not.toContain("acto: inicio | no debería pasar");                                                                // el modelo no fija actos
    expect(mem).not.toContain("inventa: algo raro"); expect(mem).toContain("obtiene: KAP, radio");                               // directiva inválida descartada, válida conservada
    expect(out.stats!.memoryDirectiveErrors).toBe(8); expect(out.warnings.some((w) => /descartada/.test(w))).toBe(true);
    expect(d.scenes[0].directions![0]).toBe("plano: general"); expect(d.scenes[1].directions![0]).toMatch(/^plano: medio KAP/); expect(d.scenes[0].directions).toContain("expresion: KAP triste"); expect(d.scenes[0].directions).not.toContain("baila: KAP por la luna");
    const r = validateIR(parsedToIR(parseScript(out.script, [{ id: "1", name: "KAP" }, { id: "2", name: "Hermano de KAP" }])), { characters: ["KAP", "Hermano de KAP"], places: [] }); expect(r.errors).toEqual([]);   // el pipeline normal lo acepta
    expect(out.script).toMatch(/\[mood: mañana, interior\]/); expect(out.script).toMatch(/\[plano: general\]/);
  });
  it("si el arco viola el orden o repite un gancho genérico, el modelo recibe el motivo y corrige", async () => {
    const wrong = arc({ hook: "Esto es solo el principio de todo lo que viene.", beats: [1, 0, 2, 3, 4, 5, 6, 6].map((i, k) => beat(k, STAGES[i])) }), good = arc();
    const llm = new Scripted([JSON.stringify(wrong), JSON.stringify(good), ...good.beats.map((_, i) => JSON.stringify(scene(i)))]); const author = llmArcAuthor(llm);
    const out = await author.write({ request: ctx().request, context: ctx() }); expect(llm.calls[1].prompt).toMatch(/orden|genérico|inicio/); expect(out.stats!.schemaErrors).toBe(1); expect(author.lastArc!.hook).toMatch(/tendero/);
  });
  it("«continuando exactamente»: la primera escena usa el lugar del último plano", async () => {
    const a = arc(), llm = new Scripted([JSON.stringify(a), ...a.beats.map((_, i) => JSON.stringify(scene(i)))]); const author = llmArcAuthor(llm); const c = ctx({ exact: true });
    const out = await author.write({ request: c.request, context: c }); expect(author.lastDraft!.scenes[0].location).toBe("Calle de noche"); expect(out.warnings.some((w) => /Calle de noche/.test(w))).toBe(true); expect(llm.calls[0].prompt).toMatch(/EXACTAMENTE/);
  });
  it("una escena que repite la anterior se regenera una vez; el episodio corto NO se rellena", async () => {
    const a = arc({ beats: [0, 1, 2, 3, 4, 5, 5, 6].map((i, k) => beat(k, STAGES[i])) }), replies = [JSON.stringify(a), JSON.stringify(scene(0)), JSON.stringify(scene(0)), JSON.stringify(scene(1)), ...a.beats.slice(2).map((_, i) => JSON.stringify(scene(i + 2)))];
    const llm = new Scripted(replies); const author = llmArcAuthor(llm); const out = await author.write({ request: ctx().request, context: ctx() });
    expect(llm.calls).toHaveLength(1 + 8 + 1); expect(out.stats!.estimatedSec).toBeLessThan(240); expect(out.warnings.some((w) => /Episodio corto.*no se ha rellenado/.test(w))).toBe(true); expect(llm.calls.some((c) => /Ampliación/.test(c.prompt))).toBe(false);
  });
  it("el esquema del arco rechaza menos de 8 beats", () => { expect(EpisodeArc.safeParse(arc({ beats: arc().beats.slice(0, 5) })).success).toBe(false); });
});
