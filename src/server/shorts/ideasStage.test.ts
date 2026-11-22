import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import { CRITERIA } from "@/narrative/ideas";
import { HOOKS_SYSTEM, IDEAS_SYSTEM, generateHooks, generateIdeaBatch } from "@/server/ai/ideas";
import { BATCHES, hooksStage, ideaStage, type HooksStageOut, type IdeaStageOut } from "./ideasStage";
import { loadStage, readState, runStages } from "./stages";

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "kap-ideas-"));
const scores = Object.fromEntries(CRITERIA.map((c) => [c, 7]));
const TOPICS: Record<string, [string, string, string]> = { mentalidad: ["Dejas de hacer algo porque otro lo hace mejor", "abres el vídeo de otro y cierras tu proyecto", "KAP cierra su cuaderno de dibujo cuando ve el de un amigo"], disciplina: ["Entrenas tres días y lo dejas", "compras zapatillas nuevas y a los cuatro días duermes", "KAP apaga la alarma del gimnasio y sigue durmiendo"], autoestima: ["Esperas una respuesta todo el día", "escribes y borras un mensaje tres veces", "KAP comprueba el móvil cada dos minutos esperando respuesta"], confianza: ["Te callas en la reunión por miedo", "levantas la mano y la bajas antes de hablar", "KAP baja la mano en clase cuando otro empieza a hablar"], "relaciones-sanas": ["Dices sí cuando quieres decir no", "te piden un favor y aceptas con una sonrisa falsa", "KAP acepta ayudar a un amigo y cancela su plan"] };
const idea = (cat: string, k = 0) => { const [titulo, situacion, kapVive] = TOPICS[cat] ?? [`Idea sobre ${cat} número ${k}`, `situación cotidiana de ${cat} con el móvil y la mesa de trabajo`, `KAP vive la situación de ${cat} con el móvil en la mano`]; return { category: cat, titulo: `${titulo} (${cat})`, problema: `El problema real de ${cat} que cualquiera reconoce al instante`, situacion: `Cuando ${situacion} delante de todos`, kapVive, errorInicial: "Reaccionar sin pensar y empeorarlo todo", hacerDiferente: "Hacer una acción pequeña y distinta ahora mismo", aprendizaje: `Lo que se entiende de ${cat}: depende de lo que haces después`, visual: "Un objeto que crece y se encoge mientras KAP lo observa y camina", publico: "Hombres jóvenes", scores }; };
const goodHooks = (extra = "") => ({ hooks: [{ type: "pregunta-incomoda", text: `¿Cuántas veces cambias lo que dices para gustar?${extra}` }, { type: "situacion-reconocible", text: "Llevas veinte minutos mirando si te ha respondido." }, { type: "contradiccion", text: "Quieres gustar y cada vez que finges, gustas menos." }, { type: "afirmacion-inesperada", text: "Mirar el móvil cada minuto no es esperar: es huir." }, { type: "mini-historia", text: "KAP escribió el mismo mensaje cinco veces y no envió ninguno." }] });
class Scripted implements LlmClient {
  id = "s"; label = "doble"; model = "m"; contextTokens = 8192; calls: LlmRequest[] = []; failAt: number | undefined; hooks: unknown[] = [];
  async available() { return true; }
  async generate(req: LlmRequest) {
    this.calls.push(req); if (this.failAt === this.calls.length) throw new Error("Ollama se cayó (OOM)");
    if (req.system === IDEAS_SYSTEM) { const cats = /categorías \(usa el valor exacto en "category"\): ([^\n.]*)\./.exec(req.prompt)![1].split(", "); return { text: JSON.stringify({ ideas: cats.map((c, i) => idea(c, i)) }) }; }
    return { text: JSON.stringify(this.hooks.shift() ?? goodHooks()) };
  }
}

describe("generador de ideas y hooks (Qwen simulado)", () => {
  it("el lote devuelve una idea por categoría pedida y descarta categorías no pedidas y duplicadas", async () => {
    const llm = new Scripted(); llm.generate = async (req) => { llm.calls.push(req); return { text: JSON.stringify({ ideas: [idea("mentalidad"), idea("mentalidad", 2), idea("dinero"), idea("disciplina")] }) }; };
    const r = await generateIdeaBatch(llm, { categories: ["mentalidad", "disciplina"], avoid: ["Ya hecha"] }); expect(r.ideas.map((i) => i.category)).toEqual(["mentalidad", "disciplina"]); expect(r.dropped).toBe(2);
    expect(llm.calls[0].prompt).toMatch(/NO repitas[\s\S]*Ya hecha/); expect(llm.calls[0].jsonSchema).toBeDefined(); expect(IDEAS_SYSTEM).toMatch(/hombres jóvenes/); expect(IDEAS_SYSTEM).toMatch(/NO es un gurú ni un coach perfecto/); expect(IDEAS_SYSTEM).toMatch(/respeto propio, responsabilidad, propósito, independencia emocional/); expect(IDEAS_SYSTEM).not.toMatch(/Temach/i);
  });
  it("cada categoría es un lote corto y las 4 tandas cubren las 19 categorías", () => { expect(BATCHES.map((b) => b.length)).toEqual([5, 5, 5, 4]); expect(new Set(BATCHES.flat()).size).toBe(19); });
  it("los hooks: 5 de tipos distintos; si el conjunto no cumple, UNA corrección con los motivos y se queda con el mejor", async () => {
    const llm = new Scripted(), bad = goodHooks(); bad.hooks[0].text = "Hoy vamos a hablar de cómo dejar de buscar aprobación"; llm.hooks = [bad, goodHooks()];
    const ideaOne = { ...idea("autoestima"), id: "idea-01", modelScore: 7, issues: [], flags: [], score: 7 }; const r = await generateHooks(llm, ideaOne as never); expect(r.repaired).toBe(true); expect(r.issues).toEqual([]); expect(llm.calls).toHaveLength(2); expect(llm.calls[1].prompt).toMatch(/Corrección obligatoria[\s\S]*muletilla/); expect(llm.calls[0].system).toBe(HOOKS_SYSTEM); expect(HOOKS_SYSTEM).toMatch(/PROHIBIDO empezar con «Hoy vamos a hablar de…»/);
    const llm2 = new Scripted(); llm2.hooks = [bad, bad]; const r2 = await generateHooks(llm2, ideaOne as never); expect(r2.issues.length).toBeGreaterThan(0); expect(llm2.calls).toHaveLength(2);   // sin inventar: se entrega con los avisos
  });
});

describe("etapas idea → hooks: recuperables", () => {
  const batches: (readonly string[])[] = [["mentalidad", "disciplina"], ["autoestima", "confianza"], ["relaciones-sanas"]];
  it("guarda cada lote en cuanto termina; si Ollama se cae a mitad, al repetir solo se piden los lotes que faltan", async () => {
    const dir = await tmp(), llm = new Scripted(); llm.failAt = 2;   // el lote 1 va bien (llamada 1) y el 2 falla (llamada 2)
    const a = await runStages(dir, "ideas", { idea: ideaStage(llm, dir, { batches }) }); expect(a.failed).toMatchObject({ stage: "idea", error: expect.stringContaining("Ollama se cayó") });
    expect((await fs.readdir(path.join(dir, "stages", "parts"))).sort()).toEqual(["idea-batch-1.json"]); expect(llm.calls).toHaveLength(2); llm.failAt = undefined;
    const b = await runStages(dir, "ideas", { idea: ideaStage(llm, dir, { batches }) }); expect(b.failed).toBeUndefined(); expect(llm.calls).toHaveLength(4);   // +2: solo los lotes 2 y 3
    const out = await loadStage<IdeaStageOut>(dir, "idea"); expect(out.stats).toMatchObject({ batches: 3, resumedBatches: 1 }); expect(out.ideas).toHaveLength(5); expect(out.ideas.map((i) => i.id)).toEqual(["idea-01", "idea-02", "idea-03", "idea-04", "idea-05"]);
    expect(llm.calls.slice(2).every((c) => !/mentalidad|disciplina/.test(c.prompt.split("Ya existen")[0]))).toBe(true); expect((await readState(dir))!.stages.idea.attempts).toBe(2);
  });
  it("puntúa y selecciona sin repetir categoría; los hooks se piden solo para las seleccionadas y también se guardan por idea", async () => {
    const dir = await tmp(), llm = new Scripted(); const steps = { idea: ideaStage(llm, dir, { batches, select: { k: 3, min: 6 } }), hooks: hooksStage(llm, dir) };
    const r = await runStages(dir, "ideas", steps); expect(r.ran).toEqual(["idea", "hooks"]); const ideas = await loadStage<IdeaStageOut>(dir, "idea"), hooks = await loadStage<HooksStageOut>(dir, "hooks");
    expect(ideas.selected).toHaveLength(3); expect(Object.keys(hooks.byIdea)).toEqual(ideas.selected); for (const h of Object.values(hooks.byIdea)) expect(h.hooks).toHaveLength(5);
    expect((await fs.readdir(path.join(dir, "stages", "parts"))).filter((f) => f.startsWith("hooks-"))).toHaveLength(3); expect(llm.calls).toHaveLength(3 + 3);   // 3 lotes + 3 conjuntos de hooks
  });
  it("si se interrumpe a mitad de los hooks, al repetir solo se piden los de las ideas que faltan", async () => {
    const dir = await tmp(), llm = new Scripted(), steps = () => ({ idea: ideaStage(llm, dir, { batches, select: { k: 3, min: 6 } }), hooks: hooksStage(llm, dir) });
    await runStages(dir, "ideas", { idea: steps().idea }); const before = llm.calls.length; llm.failAt = before + 2;   // hooks de la 1.ª idea bien; la 2.ª falla
    const a = await runStages(dir, "ideas", steps()); expect(a.failed?.stage).toBe("hooks"); expect(a.skipped).toEqual(["idea"]); expect((await fs.readdir(path.join(dir, "stages", "parts"))).filter((f) => f.startsWith("hooks-"))).toHaveLength(1);
    llm.failAt = undefined; const callsAfterFail = llm.calls.length; const b = await runStages(dir, "ideas", steps()); expect(b.failed).toBeUndefined(); expect(llm.calls.length - callsAfterFail).toBe(2); expect((await loadStage<HooksStageOut>(dir, "hooks")).stats.resumed).toBe(1);   // solo faltaban 2
  });
});
