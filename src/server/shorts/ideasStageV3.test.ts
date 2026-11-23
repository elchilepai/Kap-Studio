import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import { ideaV3 } from "@/narrative/ideasV3.fixture";
import type { CategoryV3 } from "@/narrative/ideasV3";
import { CRITIC_SYSTEM, HOOKS_V3_SYSTEM, IDEAS_V3_SYSTEM, generateHooksV3 } from "@/server/ai/ideasV3";
import { hooksStageV3, ideaStageV3, type HooksStageOutV3, type IdeaStageOutV3 } from "./ideasStageV3";
import { loadStage, runStages } from "./stages";

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "kap-ideas3-"));
const OK = { enlaces: ["situacion-motivo", "motivo-accion", "accion-consecuencia", "consecuencia-decision", "decision-nueva-accion", "nueva-accion-resultado", "resultado-mentalidad"].map((enlace) => ({ enlace, coherente: true, motivo: "se sigue del anterior" })), accionCausadaPorMotivo: true, identificacion: 3, fuerzaSituacion: 3, potencialShort: 2 };
const HOOKS = { hooks: [{ type: "situacion", text: "KAP tenía los apuntes justo para la noche. Se los dio a un compañero sin pestañear." }, { type: "conflicto", text: "Los apuntes eran suyos y el compañero no los devolvía. KAP sonreía igual." }, { type: "curiosidad", text: "Hasta las tres de la madrugada KAP no entendió qué le había costado aquella sonrisa." }, { type: "contradiccion", text: "KAP quería caer bien y se quedó estudiando con una libreta en blanco." }, { type: "mini-historia", text: "Pidieron sus apuntes en la biblioteca. KAP dijo que sí. La noche empezó a ir mal." }] };
class Scripted implements LlmClient {
  id = "s"; label = "doble"; model = "m"; contextTokens = 8192; calls: LlmRequest[] = []; failAt: number | undefined; bad: Record<string, object> = {}; critic: object = OK; hooks: unknown[] = [];
  async available() { return true; }
  async generate(req: LlmRequest) {
    this.calls.push(req); if (this.failAt === this.calls.length) throw new Error("Ollama se cayó (OOM)");
    if (req.system === IDEAS_V3_SYSTEM) { const cat = /categoría «([a-z-]+)»/.exec(req.prompt)![1] as CategoryV3; const U: Record<string, string[]> = { aprobacion: ["entrega", "biblioteca", "carpeta", "Un compañero pide apuntes justo cuando KAP necesita estudiar esa noche."], comparacion: ["abandona", "taller", "maqueta", "Una amiga presume del premio mientras KAP termina su proyecto olvidado."], evitacion: ["ordena", "oficina", "informe", "El plazo vence mañana pero el escritorio parece un almacén revuelto."] }, [verb, place, thing, sit] = U[cat] ?? ["mueve", "calle", "cosa", "Sucede algo distinto y raro."]; const uniq = { titulo: `Historia de ${cat}`, situacion: `${sit} Ocurre en la ${place} con la ${thing} delante.`, accionKap: `KAP ${verb} la ${thing} sin avisar a nadie.`, objeto: `${thing}`, motivo: `Teme perder el ${place} si no actúa ya delante de todos.`, consecuencia: `La ${thing} termina fuera de su sitio y ya nadie la encuentra.`, mentalidad: ({ aprobacion: "KAP descubre que regalar su tiempo para gustar le costó una noche completa de estudio.", comparacion: "KAP entiende que mirar los premios ajenos le robó semanas enteras de su propia maqueta.", evitacion: "KAP se da cuenta de que limpiar el escritorio era la excusa perfecta para esquivar el informe." } as Record<string, string>)[cat] ?? "KAP descubre algo muy distinto." }; return { text: JSON.stringify({ ideas: [{ ...ideaV3(), ...uniq, ...(this.bad[cat] ?? {}), category: cat }] }) }; }
    if (req.system === CRITIC_SYSTEM) return { text: JSON.stringify(this.critic) };
    return { text: JSON.stringify(this.hooks.shift() ?? HOOKS) };
  }
}
const cats: CategoryV3[] = ["aprobacion", "comparacion", "evitacion"];

describe("generador V3 (Qwen simulado)", () => {
  it("los prompts piden cadena causal, viñetas-acontecimiento, mentalidad concreta, tercera persona y no nombran a creadores", () => {
    for (const t of [/COHERENTE, enlace a enlace/, /NO aceptes contradicciones/, /PROHIBIDO empezar con «A veces»/, /MÁXIMO un tercio de viñetas de pura reacción/, /EXACTAMENTE 1 idea/]) expect(IDEAS_V3_SYSTEM).toMatch(t);
    expect(HOOKS_V3_SYSTEM).toMatch(/TERCERA PERSONA/); expect(HOOKS_V3_SYSTEM).toMatch(/PROHIBIDO empezar con «¿Qué pasó cuando/); expect(IDEAS_V3_SYSTEM + HOOKS_V3_SYSTEM + CRITIC_SYSTEM).not.toMatch(/Temach/i);
  });
  it("etapa idea: una llamada por candidata; las que fallan el código se descartan SIN llamar al crítico; las demás se puntúan", async () => {
    const dir = await tmp(), llm = new Scripted(); llm.bad.comparacion = { accionKap: "KAP se queda callado y mira al suelo." };
    await runStages(dir, "t", { idea: ideaStageV3(llm, dir, { categories: cats }) }, { stopAfter: "idea" }); const out = await loadStage<IdeaStageOutV3>(dir, "idea");
    expect(out.candidates.map((c) => c.rejected)).toEqual([false, true, false]); expect(out.candidates[1].blocks.map((b) => b.id)).toContain("accion"); expect(out.stats.criticCalls).toBe(2); expect(out.stats.calls).toBe(3);
    expect(out.selected).toEqual(expect.arrayContaining(["idea-01", "idea-03"])); expect(out.selected).toHaveLength(2); expect(out.candidates[0].score).toBeGreaterThan(0); expect(out.candidates[1].score).toBeUndefined();
  });
  it("el crítico descarta una historia incoherente aunque pase el código (no se salva con puntuación)", async () => {
    const dir = await tmp(), llm = new Scripted(); llm.critic = { ...OK, accionCausadaPorMotivo: false, enlaces: OK.enlaces.map((e, n) => (n === 1 ? { ...e, coherente: false, motivo: "la acción no sale del motivo" } : e)) };
    await runStages(dir, "t", { idea: ideaStageV3(llm, dir, { categories: ["aprobacion"] }) }, { stopAfter: "idea" }); const out = await loadStage<IdeaStageOutV3>(dir, "idea"); expect(out.candidates[0].rejected).toBe(true); expect(out.candidates[0].blocks.map((b) => b.id)).toEqual(["coherencia", "causalidad"]); expect(out.selected).toEqual([]);
  });
  it("tras una caída solo pide las candidatas que faltan, y descarta duplicados entre candidatas", async () => {
    const dir = await tmp(), llm = new Scripted(); llm.failAt = 4;   // idea 1 (2 llamadas: idea+crítico) + idea 2 (idea) + crítico cae
    expect((await runStages(dir, "t", { idea: ideaStageV3(llm, dir, { categories: cats }) }, { stopAfter: "idea" })).failed?.stage).toBe("idea");
    llm.failAt = undefined; llm.calls = []; await runStages(dir, "t", { idea: ideaStageV3(llm, dir, { categories: cats }) }, { stopAfter: "idea" }); expect((await loadStage<IdeaStageOutV3>(dir, "idea")).stats.resumed).toBe(1);
    const d2 = await tmp(), l2 = new Scripted(); l2.bad.comparacion = { titulo: "Historia de aprobacion" }; await runStages(d2, "t", { idea: ideaStageV3(l2, d2, { categories: cats }) }, { stopAfter: "idea" }); const o2 = await loadStage<IdeaStageOutV3>(d2, "idea"); expect(o2.candidates[1].duplicateOf).toBe("idea-01"); expect(o2.candidates[1].rejected).toBe(true);
  });
  it("hooks: 5 candidatos → 3 finales; un conjunto que mezcla personas se corrige una vez", async () => {
    const llm = new Scripted(); llm.hooks = [{ hooks: HOOKS.hooks.map((h, n) => (n === 1 ? { ...h, text: "Mis apuntes eran míos y yo no los pedí de vuelta nunca." } : h)) }];
    const r = await generateHooksV3(llm, ideaV3()); expect(r.repaired).toBe(true); expect(r.issues).toEqual([]); expect(llm.calls[1].prompt).toMatch(/mezcla personas/);
    const dir = await tmp(), l2 = new Scripted(); await runStages(dir, "t", { idea: ideaStageV3(l2, dir, { categories: ["aprobacion"] }), hooks: hooksStageV3(l2, dir) }, { stopAfter: "hooks" }); const out = await loadStage<HooksStageOutV3>(dir, "hooks"); expect(Object.values(out.byIdea)[0].final).toHaveLength(3); expect(Object.values(out.byIdea)[0].candidates).toHaveLength(5);
  });
});
