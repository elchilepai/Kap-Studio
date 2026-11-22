import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import type { ContextPack } from "@/memory";
import { generateStoryboard } from "./storyboard";
import { STORYBOARD_SYSTEM } from "./prompts";
import { goodStoryboard } from "@/narrative/storyboard.fixture";
import { manualImageProvider, missingImages, writeImagePack } from "@/server/images/pack";

class Scripted implements LlmClient {
  id = "s"; label = "doble"; model = "m"; contextTokens = 8192; calls: LlmRequest[] = [];
  constructor(private replies: unknown[]) {}
  async available() { return true; }
  async generate(req: LlmRequest) { this.calls.push(req); const r = this.replies.shift(); if (r === undefined) throw new Error("sin más respuestas"); return { text: JSON.stringify(r) }; }
}
const ctx = { request: { text: "x", number: 1, season: 1, exact: false, cast: [], notes: "Un Short sobre avanzar" }, budgetTokens: 1000, usedTokens: 1, sections: [], text: "# Contexto\nKAP", warnings: [] } as unknown as ContextPack;
const draft = () => { const g = goodStoryboard(); return { title: g.title, objeto: g.objeto, objetivo: g.objetivo, scenes: g.scenes }; };

describe("autor del storyboard", () => {
  it("UNA llamada si el contenido cumple; el prompt exige la estructura de 5 escenas, narración ≠ visual y una imagen por escena", async () => {
    const llm = new Scripted([draft()]), r = await generateStoryboard(llm, { context: ctx, cast: ["KAP", "Hermano de KAP"] });
    expect(llm.calls).toHaveLength(1); expect(r.rewrites).toBe(0); expect(r.reasons).toEqual([]); expect(r.storyboard.scenes).toHaveLength(5); expect(llm.calls[0].jsonSchema).toBeDefined();
    for (const re of [/5 escenas/, /"narration"/, /NUNCA es una instrucción visual/, /"visualEn"/, /UNA ILUSTRACIÓN/, /INSTANTE del fallo/, /no hay animación/]) expect(STORYBOARD_SYSTEM).toMatch(re);
  });
  it("si la historia no se ve en las imágenes (el primer Short: mira, camina, abrazo), pide UNA reescritura con los motivos y se queda con la mejor; nunca fabrica", async () => {
    const bad = draft(); bad.scenes[2].visual = "KAP mira con tristeza a su hermano sentado en la alfombra del salón mientras tiene los bloques de colores en las manos y no sabe qué hacer."; bad.scenes[2].narration = "KAP camina hacia la ventana";
    const llm = new Scripted([bad, draft()]), r = await generateStoryboard(llm, { context: ctx, cast: ["KAP", "Hermano de KAP"] });
    expect(llm.calls).toHaveLength(2); expect(llm.calls[1].prompt).toMatch(/Corrección obligatoria/); expect(r.rewrites).toBe(1); expect(r.reasons).toEqual([]);
    const still = await generateStoryboard(new Scripted([bad, bad]), { context: ctx, cast: ["KAP"] }); expect(still.reasons.length).toBeGreaterThan(0); expect(still.warnings.some((w) => /STORYBOARD_CHECK/.test(w))).toBe(true);
  });
});

describe("paquete para generar las imágenes fuera (flujo manual)", () => {
  it("escribe guion, narración para la voz, un prompt por escena y las referencias; detecta qué imágenes faltan; el proveedor manual declara que NO genera", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kap-pack-")), sb = goodStoryboard(), { files } = await writeImagePack(dir, sb);
    for (const f of ["storyboard.md", "storyboard.json", "narracion-elevenlabs.txt", "prompts/scene-01.txt", "prompts/scene-05.txt", "LEEME.md", "referencias/reference.jpg"]) expect(files).toContain(f);
    const prompt = await fs.readFile(path.join(dir, "prompts/scene-03.txt"), "utf8"); expect(prompt).toMatch(/NEGATIVE PROMPT/); expect(prompt).toMatch(/ATTACH AS REFERENCE/); expect(prompt).toContain(sb.scenes[2].visualEn);
    expect(await fs.readFile(path.join(dir, "narracion-elevenlabs.txt"), "utf8")).not.toContain(sb.scenes[2].visual);
    expect(await missingImages(dir, sb)).toEqual([1, 2, 3, 4, 5]); await fs.writeFile(path.join(dir, "imagenes", "scene-02.png"), "x"); await fs.writeFile(path.join(dir, "imagenes", "scene-04.jpg"), "x"); expect(await missingImages(dir, sb)).toEqual([1, 3, 5]);
    expect(await manualImageProvider.available()).toBe(false); await expect(manualImageProvider.generate("x", { width: 1, height: 1 })).rejects.toThrow(/No hay generador/);
  });
});
