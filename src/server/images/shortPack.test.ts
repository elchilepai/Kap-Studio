import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { qualityChecklist, srt, toSpecScene, voiceScript, writeShortPack } from "./shortPack";
import { demoPack } from "@/narrative/visualShort.fixture";

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "kap-vpack-"));
describe("pack de un Short de KAP", () => {
  it("escribe idea, hooks, guion por voces, storyboard, subtítulos, prompts, movimiento, audio, CapCut, afirmaciones, apariciones, ritmo y control de calidad", async () => {
    const dir = await tmp(), pack = demoPack(), { files, warnings, checklist, ready } = await writeShortPack(dir, pack);
    for (const f of ["01-idea.md", "02-hooks.md", "03-guion.md", "guion-por-voces.txt", "elevenlabs-kap.txt", "04-storyboard.md", "storyboard.json", "subtitulos.srt", "subtitulos.txt", "prompts/scene-01.txt", "prompts/scene-11.txt", "prompts-cortos.md", "video-motion-prompts.md", "audio-plan.md", "capcut-plan.md", "afirmaciones.md", "orden-y-duracion.md", "apariciones-kap.md", "ritmo-visual.md", "quality-check.md", "globales/style-bible.txt", "globales/kap-character-bible.txt", "globales/format-9-16.txt", "LEEME.md"]) expect(files).toContain(f);
    expect(files).not.toContain("elevenlabs-narrador.txt");   // KAP habla > narrador externo: sin narrador, no hay fichero
    expect(warnings).toEqual([]); expect(ready).toBe(true); expect(checklist.filter((c) => c.ok === false)).toEqual([]); expect(checklist.filter((c) => c.ok === null).length).toBeGreaterThanOrEqual(4);
    expect(await fs.readFile(path.join(dir, "quality-check.md"), "utf8")).toMatch(/LISTO para exportar/); expect(await fs.readFile(path.join(dir, "apariciones-kap.md"), "utf8")).toMatch(/KAP aparece en 11 de 11/);
    expect(await fs.readFile(path.join(dir, "afirmaciones.md"), "utf8")).toMatch(/⚠️ VERIFICAR[\s\S]*Opiniones/); expect(await fs.readFile(path.join(dir, "02-hooks.md"), "utf8")).toMatch(/👉 \*\*pregunta-incomoda\*\*/);
  });
  it("el guion para ElevenLabs separa KAP y narrador y es SOLO lo que se dice, sin descripciones visuales ni marcas de escena", () => {
    const pack = demoPack(), v = voiceScript(pack.scenes); expect(v.narrator).toBe(""); expect(v.kap.trim().split("\n\n")).toHaveLength(8); expect(v.ordered.split("\n").filter(Boolean).every((l) => l.startsWith("KAP: "))).toBe(true);
    for (const s of pack.scenes) { expect(v.kap + v.ordered).not.toContain(s.visual); expect(v.kap + v.ordered).not.toContain(s.action); } expect(v.kap).not.toMatch(/SCENE|ESCENA/);
    const withNarr = demoPack(); withNarr.scenes[1].narration = "Veinte minutos después."; withNarr.scenes[1].silent = false; const w = voiceScript(withNarr.scenes); expect(w.narrator).toBe("Veinte minutos después.\n"); expect(w.ordered).toMatch(/NARRADOR: Veinte minutos después\./);
  });
  it("storyboard.json usa los nombres de campo de la especificación", () => {
    const s = toSpecScene(demoPack().scenes[0]); for (const k of ["sceneNumber", "sceneType", "duration", "kapPresent", "action", "visualDescription", "camera", "composition", "lighting", "dialogue", "narration", "subtitle", "soundEffect", "transition", "purpose"]) expect(s).toHaveProperty(k);
    expect(s.sceneNumber).toBe(1); expect(s.kap).toMatchObject({ why: "hook", speaks: true }); expect(toSpecScene(demoPack().scenes[1]).silent).toBe(true);
  });
  it("los subtítulos .srt acumulan los tiempos de las duraciones", () => { const out = srt(demoPack().scenes); expect(out).toMatch(/^1\n00:00:00,000 --> 00:00:03,950\n¿Cuántas veces/); expect(out).toMatch(/\n2\n00:00:04,000 --> 00:00:07,450\n/); expect(out.trim().split(/\n\n/)).toHaveLength(11); });
  it("el plan de CapCut, el de audio y los prompts de movimiento salen de los datos de cada escena", async () => {
    const dir = await tmp(); await writeShortPack(dir, demoPack());
    const cap = await fs.readFile(path.join(dir, "capcut-plan.md"), "utf8"), audio = await fs.readFile(path.join(dir, "audio-plan.md"), "utf8"), motion = await fs.readFile(path.join(dir, "video-motion-prompts.md"), "utf8");
    expect(cap).toMatch(/Zoom in lento/); expect(cap).toMatch(/imagenes\/scene-09\.png/); expect(cap).toMatch(/wipe de izquierda a derecha/); expect(audio).toMatch(/\*\*tension\*\*/); expect(audio).toMatch(/## Silencios[\s\S]*Escena 06[\s\S]*sin efectos/); expect(audio).toMatch(/No hay música real generada/); expect(motion).toMatch(/Very slow push-in on KAP's face/);
  });
  it("el control de calidad comprueba lo comprobable y marca ❌ lo que falla (hook con muletilla, voz con instrucciones visuales, contenido de gurú) y deja pendiente lo humano", () => {
    const bad = demoPack(); bad.hooks[bad.chosenHook].text = "Hola chicos, hoy vamos a hablar de los mensajes"; expect(qualityChecklist(bad).find((x) => /Hook: entra directo/.test(x.text))!.ok).toBe(false);
    const leak = demoPack(); leak.scenes[2].dialogue = "En la imagen se ve cómo el plano general cambia"; expect(qualityChecklist(leak).find((x) => /instrucciones visuales/.test(x.text))!.ok).toBe(false);
    const guru = demoPack(); guru.scenes[2].dialogue = "Cree en ti, tú puedes con todo."; expect(qualityChecklist(guru).find((x) => /manipulador/.test(x.text))!.ok).toBe(false);
    const gen = demoPack(); gen.scenes[10].dialogue = "Nunca te rindas y persigue tus sueños."; expect(qualityChecklist(gen).find((x) => /cliché genérico/.test(x.text))!.ok).toBe(false);
  });
  it("un storyboard inválido no se exporta; uno con avisos de ritmo sí, y el control de calidad lo refleja", async () => {
    const dir = await tmp(), bad = demoPack(); bad.scenes = bad.scenes.slice(0, 5); await expect(writeShortPack(dir, bad)).rejects.toThrow(/no es válido/);
    const warn = demoPack(); for (const i of [1, 2, 3, 4]) warn.scenes[i].shot = "medium"; const r = await writeShortPack(dir, warn); expect(r.warnings.map((w) => w.id)).toContain("planos-iguales"); expect(r.ready).toBe(false); expect(await fs.readFile(path.join(dir, "quality-check.md"), "utf8")).toMatch(/NO LISTO/);
  });
});
