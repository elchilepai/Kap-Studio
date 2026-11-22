import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { narrationClean, qualityChecklist, srt, writeShortPack } from "./shortPack";
import { demoPack } from "@/narrative/visualShort.fixture";

describe("pack de un Short visual", () => {
  it("escribe idea, hooks, guion, storyboard, narración, subtítulos, prompts, orden, apariciones de KAP, ritmo y checklist", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kap-vpack-")), pack = demoPack(), { files, warnings, checklist } = await writeShortPack(dir, pack);
    for (const f of ["01-idea.md", "02-hooks.md", "03-guion.md", "04-storyboard.md", "storyboard.json", "narracion-elevenlabs.txt", "subtitulos.srt", "subtitulos.txt", "prompts/scene-01.txt", "prompts/scene-11.txt", "prompts-cortos.md", "orden-y-duracion.md", "apariciones-kap.md", "ritmo-visual.md", "checklist.md", "globales/style-bible.txt", "globales/kap-character-bible.txt", "globales/secondary-character-bible.txt", "globales/global-negative-prompt.txt", "globales/format-9-16.txt", "LEEME.md"]) expect(files).toContain(f);
    expect(warnings).toEqual([]); expect(checklist.filter((c) => c.ok === false)).toEqual([]);
    expect(await fs.readFile(path.join(dir, "apariciones-kap.md"), "utf8")).toMatch(/Escena 01 \(hook\)[\s\S]*Escena 06 \(opinion\)[\s\S]*Escena 11 \(cierre\)[\s\S]*3 de 11/);
    expect(await fs.readFile(path.join(dir, "02-hooks.md"), "utf8")).toMatch(/👉 \*\*pregunta-incomoda\*\*/); expect((await fs.readFile(path.join(dir, "prompts-cortos.md"), "utf8")).match(/```/g)).toHaveLength(22);
    const p6 = await fs.readFile(path.join(dir, "prompts/scene-06.txt"), "utf8"); expect(p6).toMatch(/Cuban chain/); expect(await fs.readFile(path.join(dir, "prompts/scene-04.txt"), "utf8")).not.toMatch(/Cuban chain/);
  });
  it("la narración para ElevenLabs es SOLO lo que se dice (un párrafo por escena), sin descripciones visuales ni marcas", () => {
    const pack = demoPack(), n = narrationClean(pack.scenes); for (const s of pack.scenes) { expect(n).toContain(s.narration); expect(n).not.toContain(s.visual); expect(n).not.toContain(s.visualAction); } expect(n.trim().split("\n\n")).toHaveLength(11); expect(n).not.toMatch(/SCENE|ESCENA|KAP:/);
  });
  it("los subtítulos .srt acumulan los tiempos de las duraciones", () => {
    const out = srt(demoPack().scenes); expect(out).toMatch(/^1\n00:00:00,000 --> 00:00:05,450\n¿Cuántas veces/); expect(out).toMatch(/\n2\n00:00:05,500 --> 00:00:09,450\n/); expect(out.trim().split(/\n\n/)).toHaveLength(11);
  });
  it("la checklist comprueba lo comprobable y deja pendiente lo que necesita criterio humano", () => {
    const pack = demoPack(), c = qualityChecklist(pack); expect(c.filter((x) => x.ok === null).length).toBeGreaterThanOrEqual(3); expect(c.find((x) => /hook elegido/.test(x.text))!.ok).toBe(true);
    const bad = demoPack(); bad.hooks[bad.chosenHook].text = "Hola chicos, hoy vamos a hablar de los mensajes"; expect(qualityChecklist(bad).find((x) => /hook elegido/.test(x.text))!.ok).toBe(false);
    const leak = demoPack(); leak.scenes[2].narration = "KAP camina hacia la ventana y mira"; expect(qualityChecklist(leak).find((x) => /instrucciones visuales/.test(x.text))!.ok).toBe(false);
  });
  it("un storyboard inválido no se exporta; uno con avisos de ritmo sí (son guía, no reglas)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kap-vpack-")), bad = demoPack(); bad.scenes = bad.scenes.slice(0, 5); await expect(writeShortPack(dir, bad)).rejects.toThrow(/no es válido/);
    const warn = demoPack(); for (const i of [1, 2, 3, 4]) warn.scenes[i].shot = "medium"; const r = await writeShortPack(dir, warn); expect(r.warnings.map((w) => w.id)).toContain("planos-iguales"); expect(await fs.readFile(path.join(dir, "ritmo-visual.md"), "utf8")).toMatch(/planos-iguales/);
  });
});
