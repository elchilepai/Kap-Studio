import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import { ideaGates, type CategoryV2, type IdeaV2 } from "@/narrative/ideasV2";
import { HOOKS_V2_SYSTEM, IDEAS_V2_SYSTEM, generateHooksV2, generateIdeaBatchV2 } from "@/server/ai/ideasV2";
import { hooksStageV2, ideaStageV2, type HooksStageOutV2, type IdeaStageOutV2 } from "./ideasStageV2";
import { loadStage, runStages } from "./stages";

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "kap-ideas2-"));
const FLAVOR: Record<string, string[]> = { "limites-decir-no": ["Un compañero pide prestados los auriculares nuevos un viernes", "entrega sonriendo a un compañero el", "perdidos en otra mochila", "Un favor aceptado sin pensar roba el fin de semana"], aprobacion: ["Cada grupo del patio juzga la camiseta que lleva puesta", "cambia de ropa delante del patio con el", "según quién se acerque", "Gustar a todos obliga a ser otro cada hora"], disciplina: ["El plazo del trabajo vence mañana y el escritorio está lleno de cables", "alinea lápices y cables junto al", "mientras el reloj corre", "Limpiar alrededor es una forma elegante de no empezar"], responsabilidad: ["Una carta del banco aparece bajo los cojines del sofá", "esconde bajo los cojines el", "con intereses nuevos cada mes", "Lo que no abres sigue creciendo igualmente"] };
const idea = (category: CategoryV2, titulo: string, objeto: string, o: Partial<IdeaV2> = {}): IdeaV2 => { const [sit, verbo, cons, mental] = FLAVOR[category] ?? [`Escena rara de ${category}`, "mueve de sitio el", "sin pistas", `Enseñanza distinta de ${category} aquí`]; return {  category, titulo, situacion: `${sit} y KAP no quiere discutirlo con nadie delante de todos.`, problema: `${sit.split(" ").slice(0, 4).join(" ")} acaba costándole tiempo y dinero a KAP.`, accionKap: `KAP ${verbo} ${objeto}.`, objeto, consecuencia: `El ${objeto} queda ${cons} y el día siguiente empieza peor.`, momentoDecision: `Al día siguiente KAP tiene el ${objeto} delante y debe elegir qué hacer.`, hacerDiferente: `KAP recoge el ${objeto} y lo resuelve esa misma tarde con una frase.`, mentalidad: `${mental}: decirlo a tiempo cuesta menos que arreglarlo.`, imagenes: (["general", "detalle", "primer-plano", "entorno", "cenital", "metafora", "pov", "decision", "medio"] as const).map((plano, n) => ({ plano, que: `${["KAP entrega el OBJ al compañero en el pasillo", "Mano ajena sujeta el OBJ sobre un pupitre", "KAP sonríe forzado con la mano vacía", "Aula vacía al atardecer con el OBJ olvidado", "Escritorio visto desde arriba sin el OBJ", "Cuerda enorme une a KAP con el OBJ lejano", "Pantalla del móvil con un mensaje borrado", "KAP pulsa el botón de enviar con decisión", "KAP recoge el OBJ y lo guarda en la mochila"][n].replace("OBJ", objeto)}` })), ...o }; };
const ID: Record<string, [string, string]> = { "limites-decir-no": ["Los auriculares que nunca volvieron", "auricular"], aprobacion: ["La camiseta de cada grupo", "camiseta"], disciplina: ["El escritorio perfecto", "informe"], responsabilidad: ["El recibo bajo el sofá", "recibo"] };
class Scripted implements LlmClient {
  id = "s"; label = "doble"; model = "m"; contextTokens = 8192; calls: LlmRequest[] = []; failAt: number | undefined; dupFirst = false; hooks: unknown[] = [];
  async available() { return true; }
  async generate(req: LlmRequest) {
    this.calls.push(req); if (this.failAt === this.calls.length) throw new Error("Ollama se cayó (OOM)");
    if (req.system === IDEAS_V2_SYSTEM) { const cats = [...req.prompt.matchAll(/^- ([a-z-]+): /gm)].map((m) => m[1]).concat(/categoría «([a-z-]+)»/.exec(req.prompt)?.[1] ?? []).filter(Boolean) as CategoryV2[]; return { text: JSON.stringify({ ideas: cats.map((c) => { const [t, o] = ID[c] ?? [`Idea de ${c}`, `objeto${c.length}`]; return idea(c, this.dupFirst && c === "aprobacion" && !/Corrección/.test(req.prompt) ? ID["limites-decir-no"][0] : t, o); }) }) }; }
    return { text: JSON.stringify(this.hooks.shift() ?? { hooks: [{ type: "situacion", text: "Prestó los auriculares un viernes y el sábado entrenó sin música." }, { type: "conflicto", text: "KAP sabía que necesitaba los auriculares; lo difícil era decirlo." }, { type: "curiosidad", text: "¿Qué hizo KAP el lunes con los auriculares y el mensaje sin enviar?" }, { type: "contradiccion", text: "Quería caer bien y terminó sin auriculares ni plan." }, { type: "mini-historia", text: "KAP entregó los auriculares sin pestañear. El compañero nunca los devolvió." }] }) };
  }
}
const batches: CategoryV2[][] = [["limites-decir-no", "aprobacion"], ["disciplina", "responsabilidad"]];

describe("generador V2 de ideas y hooks (Qwen simulado)", () => {
  it("el prompt pide acción, objeto, 8-14 imágenes, stickman estático, sin coach ni nombres de creadores", () => {
    for (const t of [/ACCIÓN/, /8-14 ILUSTRACIONES ESTÁTICAS 2D estilo stickman/, /NO tiene que salir en todas las imágenes/, /PROHIBIDO que sea callarse, mirar al suelo/, /objeto/i]) expect(IDEAS_V2_SYSTEM).toMatch(t); expect(IDEAS_V2_SYSTEM + HOOKS_V2_SYSTEM).not.toMatch(/Temach/i); expect(HOOKS_V2_SYSTEM).toMatch(/A veces/);
  });
  it("regenera UNA vez una idea duplicada de un lote anterior y conserva la corregida", async () => {
    const llm = new Scripted(), first = await generateIdeaBatchV2(llm, { categories: ["limites-decir-no"], prior: [] }); llm.dupFirst = true;
    const r = await generateIdeaBatchV2(llm, { categories: ["aprobacion"], prior: first.ideas }); expect(r.regenerated).toHaveLength(1); expect(r.regenerated[0].why.join()).toMatch(/duplica/); expect(r.regenerated[0].improved).toBe(true); expect(r.ideas[0].titulo).toBe("La camiseta de cada grupo"); expect(llm.calls.at(-1)!.prompt).toMatch(/Corrección obligatoria/); expect(llm.calls.at(-1)!.jsonSchema).toBeDefined();
  });
  it("etapa idea: guarda cada lote, evalúa todas juntas y selecciona; tras una caída solo pide los lotes que faltan", async () => {
    const dir = await tmp(), llm = new Scripted(); llm.failAt = 2;
    const a = await runStages(dir, "t", { idea: ideaStageV2(llm, dir, { batches }) }, { stopAfter: "idea" }); expect(a.failed?.stage).toBe("idea"); expect(llm.calls).toHaveLength(2);
    llm.failAt = undefined; llm.calls = []; const b = await runStages(dir, "t", { idea: ideaStageV2(llm, dir, { batches }) }, { stopAfter: "idea" }); expect(b.failed).toBeUndefined(); expect(llm.calls).toHaveLength(1);
    const out = await loadStage<IdeaStageOutV2>(dir, "idea"); expect(out.stats.resumedBatches).toBe(1); expect(out.ideas).toHaveLength(4); expect(out.selected).toHaveLength(4); expect(out.ideas[0].subs).toHaveProperty("originalidad");
  });
  it("hooks: 5 de tipos distintos y los mejores; un conjunto sin los 5 tipos se corrige una vez", async () => {
    const llm = new Scripted(), i = idea("limites-decir-no", ...ID["limites-decir-no"], { objeto: "auriculares" });
    llm.hooks = [{ hooks: Array.from({ length: 5 }, () => ({ type: "situacion", text: "Hay personas que nunca saben decir lo que quieren." })) }];
    const r = await generateHooksV2(llm, i); expect(r.repaired).toBe(true); expect(r.issues).toEqual([]); expect(r.hooks.map((h) => h.type).sort()).toEqual(["conflicto", "contradiccion", "curiosidad", "mini-historia", "situacion"]); expect(llm.calls[1].prompt).toMatch(/Corrección obligatoria/);
  });
  it("etapa hooks: una llamada por idea seleccionada y reanuda desde disco", async () => {
    const dir = await tmp(), llm = new Scripted(); const steps = () => ({ idea: ideaStageV2(llm, dir, { batches, k: 2 }), hooks: hooksStageV2(llm, dir) });
    await runStages(dir, "t", steps(), { stopAfter: "hooks" }); const out = await loadStage<HooksStageOutV2>(dir, "hooks"); expect(Object.keys(out.byIdea)).toHaveLength(2); expect(Object.values(out.byIdea)[0].best).toHaveLength(2);
    await fs.rm(path.join(dir, "stages", "02-hooks.json")); llm.calls = []; await runStages(dir, "t", { hooks: hooksStageV2(llm, dir) }, { force: ["hooks"], stopAfter: "hooks" }); expect(llm.calls).toHaveLength(0); expect((await loadStage<HooksStageOutV2>(dir, "hooks")).stats.resumed).toBe(2);
  });
});
