import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import { chainV4 } from "@/narrative/chainV4.fixture";
import type { CategoryV4 } from "@/narrative/chainV4";
import { CHAIN_SYSTEM, ChainSchema, SCHEMA_MAX, generateChainV4 } from "@/server/ai/chainV4";
import { chainStageV4, chainsMarkdown, type ChainStageOut } from "./chainStageV4";
import { loadStage, runStages } from "./stages";

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "kap-chain4-"));
const UNIQ: Record<string, Partial<ReturnType<typeof chainV4>>> = {
  aprobacion: { titulo: "El favor del viernes", objeto: "agenda", situacion: "Un compañero pide a KAP que cubra su turno justo el día de su cumpleaños.", conflicto: "KAP acepta cubrirlo y su fiesta queda sin organizar a medias.", motivo: "KAP teme que el compañero lo considere poco colaborador si se niega.", accion: "KAP tacha su cumpleaños de la agenda y apunta el turno del compañero.", consecuencia: "La agenda queda llena de turnos ajenos y la tarta del cumpleaños se estropea en la nevera.", decision: "Cuando otro compañero pide un turno más, KAP abre la agenda y debe elegir.", nuevaAccion: "KAP cierra la agenda, rechaza el turno y recupera la hoja de su cumpleaños.", resultado: "El cumpleaños se celebra completo y la agenda vuelve a tener huecos propios.", mentalidad: "KAP descubre que su agenda se llenaba de turnos ajenos porque nunca reservaba huecos propios." },
  comparacion: { titulo: "La maqueta que cambió de forma" },
  justificarse: { titulo: "La excusa del informe", objeto: "informe", situacion: "Su jefa señala un error en el informe de ventas que KAP entregó ayer.", conflicto: "KAP interrumpe con excusas y la jefa termina corrigiendo todo ella misma.", motivo: "KAP quiere evitar que lo vean como alguien que se equivoca en el trabajo.", accion: "KAP imprime el informe y subraya todas las frases que justifican su error.", consecuencia: "El informe llena la mesa de la jefa de subrayados y ella decide revisar sola las cifras.", decision: "Con el informe corregido delante, KAP debe elegir entre defender los subrayados o escuchar.", nuevaAccion: "KAP guarda los subrayados, abre el informe corregido y toma nota de cada cambio.", resultado: "El informe nuevo sale sin errores y la jefa firma la entrega esa misma tarde.", mentalidad: "KAP entiende que subrayar sus excusas le dejó sin leer lo que el informe corregido le decía." },
};
class Scripted implements LlmClient {
  id = "s"; label = "doble"; model = "m"; contextTokens = 8192; calls: LlmRequest[] = []; failAt: number | undefined; first: Record<string, object> = {}; over: Record<string, object> = {};
  async available() { return true; }
  async generate(req: LlmRequest) {
    this.calls.push(req); if (this.failAt === this.calls.length) throw new Error("Ollama se cayó (OOM)");
    const cat = /categoría «([a-z-]+)»/.exec(req.prompt)![1] as CategoryV4, retry = /Corrección obligatoria/.test(req.prompt), bad = !retry ? this.first[cat] : undefined;
    return { text: JSON.stringify({ cadenas: [{ ...chainV4(), ...(UNIQ[cat] ?? {}), ...(bad ?? {}), ...(this.over[cat] ?? {}), category: cat }] }) };
  }
}
const cats: CategoryV4[] = ["aprobacion", "comparacion", "justificarse"];

describe("generador V4 de cadenas (Qwen simulado)", () => {
  it("el prompt pide cadena causal corta, frases completas, objeto con función, sin viñetas ni hooks, y no usa ningún crítico", () => {
    for (const t of [/UNA frase CORTA y COMPLETA/, /NUNCA dejes una frase a medias/, /PARTICIPA en la historia/, /NO inventes una acción llamativa solo porque sea visual/, /Todavía NO hay escenas, viñetas, hooks ni guion/, /EXACTAMENTE 1 cadena/]) expect(CHAIN_SYSTEM).toMatch(t); expect(CHAIN_SYSTEM).not.toMatch(/Temach/i);
  });
  it("el esquema NO limita los campos a una longitud estrecha (evita que la frase se corte y continúe en el campo siguiente)", () => {
    expect(SCHEMA_MAX).toBeGreaterThanOrEqual(400); const ok = Object.fromEntries(Object.entries(chainV4()).map(([k, v]) => [k, v])); expect(ChainSchema.safeParse(ok).success).toBe(true);
    const long = "KAP " + "dice una frase muy larga ".repeat(14) + "y termina bien."; expect(long.length).toBeLessThan(SCHEMA_MAX); expect(ChainSchema.safeParse({ ...ok, motivo: long }).success).toBe(true);
  });
  it("si falla la estructura regenera UNA vez con los motivos y conserva la mejor; no llama a ningún juez", async () => {
    const llm = new Scripted(); llm.first.comparacion = { motivo: "KAP teme que su maqueta parezca pequeña y poco ambiciosa al lado de la", objeto: "mesa" };
    const r = await generateChainV4(llm, { category: "comparacion", avoid: [] }); expect(r.attempts).toHaveLength(2); expect(r.attempts[0].issues.map((i) => i.id)).toEqual(expect.arrayContaining(["truncado", "objeto"])); expect(r.issues).toEqual([]); expect(llm.calls).toHaveLength(2); expect(llm.calls[1].prompt).toMatch(/Corrección obligatoria[\s\S]*cortado a mitad de frase/); expect(llm.calls.every((c) => c.system === CHAIN_SYSTEM)).toBe(true);
  });
  it("etapa: guarda cada cadena, marca duplicados, escribe el documento de aprobación y se detiene sin viñetas ni hooks", async () => {
    const dir = await tmp(), llm = new Scripted(); await runStages(dir, "t", { idea: chainStageV4(llm, dir, { categories: cats }) }, { stopAfter: "idea" }); const out = await loadStage<ChainStageOut>(dir, "idea");
    expect(out.chains).toHaveLength(3); expect(out.chains.map((c) => c.structurallyOk)).toEqual([true, true, true]); expect(Object.keys(out.chains[0].chain)).toEqual(expect.arrayContaining(["situacion", "conflicto", "motivo", "accion", "consecuencia", "decision", "nuevaAccion", "resultado", "mentalidad"])); expect(JSON.stringify(out)).not.toMatch(/vinetas|hooks/);
    const md = chainsMarkdown(out); expect(md).toMatch(/La maqueta que cambió de forma/); expect(md).toMatch(/Momento de decisión/); expect(md).toMatch(/aprobada/); expect(md).toMatch(/La lógica de la historia la decides tú/);
  });
  it("no hay truncados en las cadenas guardadas y los duplicados entre cadenas se marcan", async () => {
    const dir = await tmp(), llm = new Scripted(); llm.over.justificarse = { titulo: "La maqueta que cambió de forma" };
    await runStages(dir, "t", { idea: chainStageV4(llm, dir, { categories: cats }) }, { stopAfter: "idea" }); const out = await loadStage<ChainStageOut>(dir, "idea");
    for (const c of out.chains) for (const f of ["situacion", "conflicto", "motivo", "accion", "consecuencia", "decision", "nuevaAccion", "resultado", "mentalidad"] as const) expect(c.chain[f]).toMatch(/[.!?]$/);
    expect(out.chains[2].duplicateOf).toBe("cadena-02"); expect(out.chains[2].structurallyOk).toBe(false);
  });
  it("tras una caída solo pide las cadenas que faltan", async () => {
    const dir = await tmp(), llm = new Scripted(); llm.failAt = 2; const a = await runStages(dir, "t", { idea: chainStageV4(llm, dir, { categories: cats }) }, { stopAfter: "idea" }); expect(a.failed?.stage).toBe("idea");
    llm.failAt = undefined; llm.calls = []; await runStages(dir, "t", { idea: chainStageV4(llm, dir, { categories: cats }) }, { stopAfter: "idea" }); expect(llm.calls).toHaveLength(2); expect((await loadStage<ChainStageOut>(dir, "idea")).stats.resumed).toBe(1);
  });
});
