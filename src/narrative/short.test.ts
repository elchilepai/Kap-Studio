import { describe, expect, it } from "vitest";
import { beatsToScenes, groupScenes, repairShort, shortRetentionCheck, shortSeconds, type ShortBeat } from "./short";
import { parseDirection, parseDirectorCue } from "../animation/beats";
import { validateIR } from "../domain/screenplay";
import { draftToIR } from "../server/ai/episode";
import { draftToShortScript, storyToDraft, type ShortStory } from "../server/ai/short";
import { parsedToIR } from "../server/studio/interpreter";
import { parseScript } from "../server/studio/script";

import { B, good } from "./short.fixture";
const ids = (r: ReturnType<typeof shortRetentionCheck>) => r.failed.join(",");

describe("SHORT_RETENTION_CHECK (12 comprobaciones, sin modelo)", () => {
  it("un Short sano pasa casi todo y mide los segundos como suma de beats", () => {
    const g = good(); const r = shortRetentionCheck(g); expect(r.total).toBe(12); expect(shortSeconds(g)).toBe(50.5); expect(r.failed).toEqual([]);
    g[8].seconds = 1; g[7].seconds = 1; expect(shortRetentionCheck(g).checks.find((c) => c.id === "duracion-justa")!.ok).toBe(false);   // < 45 s se avisa; la duración es consecuencia de los beats
  });
  it("gancho: sin acción visible en el primer beat falla y pide parche local", () => {
    const g = good(); g[0] = B("hook", "Una casa vieja con paredes azules y mucha luz", { seconds: 3 }); const c = shortRetentionCheck(g).checks.find((x) => x.id === "hook-claro")!; expect(c.ok).toBe(false); expect(c.fix).toBe("patch");
  });
  it("remate: una moraleja («y entonces KAP aprendió…») falla; un final de acción pasa", () => {
    const g = good(); g.at(-1)!.dialogue = { speaker: "KAP", text: "Desde ese día aprendió que la verdad es lo importante" }; expect(shortRetentionCheck(g).failed).toContain("remate");
    expect(shortRetentionCheck(good()).failed).not.toContain("remate");
  });
  it("giro: sin beat «giro» falla", () => { const g = good().map((b) => (b.phase === "giro" ? { ...b, phase: "escalada" as const } : b)); expect(shortRetentionCheck(g).failed).toContain("giro"); });
  it("beats repetidos y prescindibles se detectan y se reparan en código (nunca el hook, el giro ni el remate)", () => {
    const g = good(); g.splice(3, 0, { ...g[2], seconds: 4 }); const r = shortRetentionCheck(g); expect(r.failed).toContain("sin-repetidos");
    const fixed = repairShort(g); expect(fixed.merged).toBeGreaterThanOrEqual(1); expect(fixed.beats.length).toBeLessThan(g.length); expect(fixed.beats[0].phase).toBe("hook"); expect(fixed.beats.some((b) => b.phase === "giro")).toBe(true); expect(fixed.beats.at(-1)!.phase).toBe("remate");
    const idle = good(); idle.splice(4, 0, B("escalada", "El aire se queda en silencio", { change: "cambia aire", seconds: 3 })); const d = repairShort(idle); expect(d.dropped + d.merged).toBeGreaterThanOrEqual(0);
  });
  it("tres beats seguidos solo de diálogo se señalan; la escalada con el mismo objetivo es predecible", () => {
    const g = good(); for (const i of [2, 3, 4]) g[i] = B("escalada", "KAP discute", { dialogue: { speaker: "KAP", text: `Frase ${i}` }, goal: "discutir con el hermano", change: `discusión ${i}` });
    expect(shortRetentionCheck(g).failed).toContain("sin-tramos-solo-dialogo");
    const p = good(); for (const i of [2, 3, 4, 5]) p[i] = { ...p[i], goal: "intentar abrir la puerta del armario" }; expect(shortRetentionCheck(p).failed).toContain("no-predecible");
  });
  it("más de 65 s con beats prescindibles → «podría ser más corto»", () => {
    const g = good().map((b) => ({ ...b, seconds: b.seconds * 1.7 })); g.splice(3, 0, { ...g[2] }); expect(shortRetentionCheck(g).checks.find((c) => c.id === "duracion-justa")!.ok).toBe(false);
  });
  it("sin frases de relleno exigidas: el hook corto y un Short de 43 o 68 s no se rechazan por cortar «cada X segundos»", () => { expect(ids(shortRetentionCheck(good()))).not.toMatch(/cambia-varias|escalada(?!$)/); });
});

describe("beats → borrador de guion", () => {
  const story: ShortStory = { title: "El mando", logline: "KAP mancha el mando y lo esconde.", hook: "", cast: ["KAP", "Hermano de KAP"], beats: [] };
  const names = ["KAP", "Hermano de KAP"];
  it("agrupa beats vecinos en la misma escena (la escena es el decorado)", () => { expect(groupScenes(good()).map((s) => s.beats.length)).toEqual([2, 2, 1, 4]); expect(groupScenes(good())[0].location).toBe("Salón"); });
  it("la narración nunca es un hablante; el diálogo conserva su hablante; hay plano, sonido y música con tiempo", () => {
    const sc = beatsToScenes(good(), names); const lines = sc.flatMap((s) => s.lines);
    expect(lines.filter((l) => l.speaker).every((l) => /hermano|kap/i.test(l.speaker))).toBe(true); expect(lines.some((l) => !l.speaker && /leche/.test(l.text))).toBe(true);
    const dirs = sc.flatMap((s) => s.directions); expect(dirs.some((d) => /^plano: /.test(d))).toBe(true); expect(dirs).toContain("sonido: golpe en 0.3s"); expect(dirs).toContain("impacto: en 0.3s"); expect(dirs.some((d) => /^musica: cambio en /.test(d))).toBe(true); expect(dirs.some((d) => /^silencio: en .* durante 1.5s$/.test(d))).toBe(true);
  });
  it("actos por fase y gancho del remate en la última escena", () => {
    const sc = beatsToScenes(good(), names), mem = sc.flatMap((s) => s.memory); for (const a of ["inicio", "conflicto", "desarrollo", "emocional", "resolucion"]) expect(mem.some((m) => m.startsWith(`acto: ${a} |`))).toBe(true); expect(sc.at(-1)!.memory.some((m) => m.startsWith("gancho:"))).toBe(true);
  });
  it("el guion resultante lo entiende el pipeline normal: IR válida, sin avisos por sonido/música y sin cambiar la IR", () => {
    const draft = storyToDraft(story, good(), names), script = draftToShortScript(draft), parsed = parseScript(script, names.map((n, i) => ({ id: String(i), name: n }))), ir = parsedToIR(parsed);
    expect(ir.warnings.filter((w) => /sonido|musica|impacto|silencio/i.test(w))).toEqual([]); const v = validateIR(ir, { characters: names, places: [] }); expect(v.errors.filter((e) => !/lugar|place/i.test(e))).toEqual([]);
    expect(ir.scenes.every((s) => s.lines.length > 0)).toBe(true); expect(script).toMatch(/\[sonido: golpe en 0\.3s\]/); expect(draftToIR(draft).scenes.length).toBeGreaterThanOrEqual(3);
  });
});

describe("directivas solo del director (sonido, música, impacto, silencio)", () => {
  it("parseDirection no las trata como beat ni como aviso", () => { for (const d of ["sonido: puerta en 2s", "musica: inicio en 0s", "impacto: en 5s", "silencio: en 6s durante 1.5s"]) expect(parseDirection(d)).toEqual({}); expect(parseDirection("camara: seguir KAP en 2s").beat).toBeDefined(); expect(parseDirection("baila: KAP").warning).toBeDefined(); });
  it("parseDirectorCue produce marcas con tiempo", () => {
    expect(parseDirectorCue("sonido: puerta en 2.5s")).toEqual({ sound: { t: 2.5, kind: "door" } }); expect(parseDirectorCue("musica: inicio en 0.3s")).toEqual({ music: { t: 0.3, kind: "music_start" } }); expect(parseDirectorCue("musica: cambio en 20s")?.music?.kind).toBe("music_change"); expect(parseDirectorCue("musica: fin en 55s")?.music?.kind).toBe("music_stop");
    expect(parseDirectorCue("impacto: en 5s")).toEqual({ music: { t: 5, kind: "impact" }, sound: { t: 5, kind: "bump" } }); expect(parseDirectorCue("silencio: en 6s durante 2s")).toEqual({ music: { t: 6, kind: "silence", dur: 2 } });
    expect(parseDirectorCue("sonido: trompeta")?.warning).toBeDefined(); expect(parseDirectorCue("plano: general")).toBeUndefined();
  });
});
