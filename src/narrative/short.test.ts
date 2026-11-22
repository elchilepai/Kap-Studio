import { describe, expect, it } from "vitest";
import { beatsToScenes, estimateRenderSeconds, groupScenes, repairShort, shortRetentionCheck, MAX_SCENE_WORDS, type ShortBeat } from "./short";
import { parseDirection, parseDirectorCue } from "../animation/beats";
import { validateIR } from "../domain/screenplay";
import { draftToIR } from "../server/ai/episode";
import { draftToShortScript, storyToDraft, type ShortStory } from "../server/ai/short";
import { parsedToIR } from "../server/studio/interpreter";
import { parseScript } from "../server/studio/script";
import { B, good } from "./short.fixture";

const names = ["KAP", "Hermano de KAP"];
const story: ShortStory = { title: "Las latas", logline: "KAP copia una torre y la hace a su manera.", hook: "", cast: names, beats: [] };
const failed = (b: ShortBeat[]) => shortRetentionCheck(b, { renderSeconds: estimateRenderSeconds(beatsToScenes(b, names)) }).failed;
/** El primer Short real: tristeza → abrazo → sonrisa. No debe pasar. */
const hugs = (): ShortBeat[] => [
  B("hook", "situacion", "KAP mira por la ventana con una mirada triste, observando a otros niños en el parque.", { location: "Habitación" }),
  B("contexto", "situacion", "KAP entra en la habitación donde su hermano juega. El hermano sonríe al ver a KAP.", { location: "Habitación", change: "el hermano sonríe" }),
  B("escalada", "intento", "KAP mira a su hermano y luego se mira las manos, frustrado.", { location: "Habitación", change: "KAP se siente frustrado" }),
  B("escalada", "fallo", "El hermano lo observa y le da un abrazo pequeño.", { location: "Habitación", change: "abrazo" }),
  B("escalada", "segundo-intento", "KAP se pone de pie y empieza a limpiar la habitación.", { location: "Habitación", change: "KAP limpia" }),
  B("giro", "descubrimiento", "El hermano lo mira con admiración y le da otro abrazo, sonriendo.", { location: "Habitación", change: "otro abrazo" }),
  B("remate", "remate", "KAP mira a su hermano y suspira, con una sonrisa pequeña. El hermano le devuelve la sonrisa.", { location: "Habitación", change: "sonrisa" }),
];

describe("SHORT_RETENTION_CHECK (12 comprobaciones, sin modelo)", () => {
  it("un Short con la cadena completa pasa; el render dura lo que dice su contenido, no lo que declara el modelo", () => {
    const g = good(), est = estimateRenderSeconds(beatsToScenes(g, names)); const r = shortRetentionCheck(g, { renderSeconds: est });
    expect(r.total).toBe(12); expect(r.failed).toEqual([]); expect(est).toBeGreaterThanOrEqual(45); expect(est).toBeLessThanOrEqual(75);
    expect(shortRetentionCheck(g, { renderSeconds: 25.9 }).checks.find((c) => c.id === "duracion-justa")).toMatchObject({ ok: false, fix: "rewrite" });   // 20-30 s no cuenta como Short terminado
    expect(shortRetentionCheck(g, { renderSeconds: 58 }).checks.find((c) => c.id === "duracion-justa")!.ok).toBe(true); expect(shortRetentionCheck(g, { renderSeconds: 90 }).checks.find((c) => c.id === "duracion-justa")!.ok).toBe(false);
  });
  it("CONTRATO: sin intento → fallo → segundo intento → descubrimiento no pasa y pide reescritura", () => {
    const g = good().map((b) => (b.step === "segundo-intento" ? { ...b, step: "reaccion" as const } : b)); const c = shortRetentionCheck(g).checks.find((x) => x.id === "escalada")!;
    expect(c.ok).toBe(false); expect(c.fix).toBe("rewrite"); expect(c.note).toMatch(/SEGUNDO INTENTO/);
    expect(shortRetentionCheck(good().map((b) => (b.step === "fallo" ? { ...b, step: "reaccion" as const } : b))).checks.find((x) => x.id === "escalada")!.note).toMatch(/FALLO/);
  });
  it("el segundo intento no puede repetir el primero", () => { const g = good(), a = g.find((b) => b.step === "intento")!, k = g.findIndex((b) => b.step === "segundo-intento"); g[k] = { ...g[k], goal: a.goal, action: a.action }; expect(shortRetentionCheck(g).checks.find((x) => x.id === "escalada")!.note).toMatch(/repite el primero/); });
  it("tristeza → abrazo → sonrisa (el primer Short real) NO pasa como Short válido, aunque declare los pasos", () => {
    const c = shortRetentionCheck(hugs()).checks.find((x) => x.id === "escalada")!; expect(c.ok).toBe(false); expect(c.note).toMatch(/no son acciones concretas|solo emoción|abrazos/);
  });
  it("muchos beats solo emocionales fallan aunque haya una acción", () => { const g = good().map((b, i) => (i === 1 || i === 4 || i === 7 ? { ...b, action: "KAP mira a su hermano y sonríe", reaction: "" } : b)); expect(shortRetentionCheck(g).checks.find((x) => x.id === "escalada")!.ok).toBe(false); });
  it("gancho: sin acción visible en el primer beat falla y pide parche local", () => {
    const g = good(); g[0] = B("hook", "situacion", "Una casa vieja con paredes azules y mucha luz", { seconds: 3 }); const c = shortRetentionCheck(g).checks.find((x) => x.id === "hook-claro")!; expect(c.ok).toBe(false); expect(c.fix).toBe("patch");
  });
  it("remate: una moraleja o una conferencia falla; un final de frase corta pasa", () => {
    const g = good(); g.at(-1)!.dialogue = { speaker: "KAP", text: "Desde ese día aprendió que la verdad es lo importante" }; expect(shortRetentionCheck(g).failed).toContain("remate");
    g.at(-1)!.dialogue = { speaker: "KAP", text: "Bueno… algo es algo." }; expect(shortRetentionCheck(g).failed).not.toContain("remate");
    g.at(-1)!.dialogue = { speaker: "KAP", text: "Cada persona tiene su propio ritmo y comparar el camino de los demás con el mío solo me hace daño sin motivo" }; expect(shortRetentionCheck(g).failed).toContain("remate");
    const m = good(); m[4].dialogue = { speaker: "KAP", text: "Lo importante es que cada uno avance a su ritmo" }; expect(shortRetentionCheck(m).failed).toContain("sin-tramos-solo-dialogo");
  });
  it("beats repetidos y prescindibles se detectan y se reparan en código (nunca el hook, el giro ni el remate)", () => {
    const g = good(); g.splice(3, 0, { ...g[2], seconds: 4 }); expect(shortRetentionCheck(g).failed).toContain("sin-repetidos");
    const fixed = repairShort(g); expect(fixed.merged).toBeGreaterThanOrEqual(1); expect(fixed.beats.length).toBeLessThan(g.length); expect(fixed.beats[0].phase).toBe("hook"); expect(fixed.beats.some((b) => b.phase === "giro")).toBe(true); expect(fixed.beats.at(-1)!.phase).toBe("remate");
  });
});

describe("beats → escenas: sin relleno ni pérdida", () => {
  it("una historia de una sola localización NO duplica ninguna línea para fabricar escenas (la IR admite 1 escena)", () => {
    const one = [B("hook", "situacion", "KAP apila tres latas en el patio."), B("remate", "remate", "KAP empuja la torre con un dedo y aguanta.", { goal: "probar" })], sc = beatsToScenes(one, names), all = sc.flatMap((s) => s.lines.map((l) => l.text));
    expect(new Set(all).size).toBe(all.length); expect(all).toHaveLength(2); expect(sc).toHaveLength(1);
    const { draft, scenes } = storyToDraft(story, one, names); expect(draft.scenes).toHaveLength(1); expect(validateIR(parsedToIR(parseScript(draftToShortScript(draft, scenes), names.map((n, i) => ({ id: String(i), name: n })))), { characters: names, places: [] }).errors.filter((e) => !/lugar|place/i.test(e))).toEqual([]);
  });
  it("varias escenas en el mismo sitio salen de beats distintos (≤ 46 palabras), con corte seco entre ellas y sin líneas repetidas", () => {
    const g = good(), sc = beatsToScenes(g, names); expect(sc.length).toBeGreaterThan(1); const all = sc.flatMap((s) => s.lines.map((l) => l.text)); expect(new Set(all).size).toBe(all.length);
    for (const s of sc) expect(s.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)).toBeLessThanOrEqual(MAX_SCENE_WORDS + 40);   // un beat grande puede ser una escena sola
    expect(sc.slice(1).every((s) => s.transition === "cut")).toBe(true); expect(sc[0].transition).toBeUndefined();
    expect(groupScenes(g).flatMap((s) => s.beats)).toEqual(g);   // ningún beat se pierde ni se repite
  });
  it("NINGUNA directiva se recorta (antes: slice(0, 8)) y cada escena conserva las suyas, con tiempos de la duración real de las líneas", () => {
    const many = Array.from({ length: 9 }, (_, i) => B(i === 0 ? "hook" : i === 8 ? "remate" : "escalada", i === 8 ? "remate" : "intento", `KAP apila la lata ${i}.`, { sound: "bump", music: i % 2 ? "change" : "none", goal: `lata ${i}`, change: `lata ${i} puesta`, seconds: 2 }));
    const sc = beatsToScenes(many, names), dirs = sc.flatMap((s) => s.directions); expect(dirs.filter((d) => /^plano|^camara/.test(d))).toHaveLength(9); expect(dirs.filter((d) => /^sonido: golpe/.test(d))).toHaveLength(9); expect(dirs.filter((d) => /^marca-musica: cambio/.test(d))).toHaveLength(4);
    const { draft, scenes } = storyToDraft(story, many, names), script = draftToShortScript(draft, scenes); expect((script.match(/^\[sonido: golpe/gm) ?? []).length).toBe(9);
    const parsed = parseScript(script, names.map((n, i) => ({ id: String(i), name: n }))); expect(parsed.flatMap((p) => p.directions ?? []).filter((d) => /^sonido: golpe/.test(d))).toHaveLength(9);   // llegan al director, ninguna se pierde al partir escenas
    const t = dirs.filter((d) => /^plano|^camara/.test(d)).map((d) => Number(/en ([\d.]+)s/.exec(d)![1])); expect(t[1]).toBeGreaterThan(t[0]);
  });
  it("la narración nunca es un hablante; el diálogo conserva su hablante", () => {
    const lines = beatsToScenes(good(), names).flatMap((s) => s.lines); expect(lines.filter((l) => l.speaker).every((l) => /hermano|kap/i.test(l.speaker))).toBe(true); expect(lines.some((l) => !l.speaker && /latas/.test(l.text))).toBe(true);
  });
  it("el guion lo entiende el pipeline normal: IR válida y sin avisos por sonido/marcas", () => {
    const { draft, scenes } = storyToDraft(story, good(), names), script = draftToShortScript(draft, scenes), ir = parsedToIR(parseScript(script, names.map((n, i) => ({ id: String(i), name: n }))));
    expect(ir.warnings.filter((w) => /sonido|musica|impacto|silencio/i.test(w))).toEqual([]); expect(validateIR(ir, { characters: names, places: [] }).errors.filter((e) => !/lugar|place/i.test(e))).toEqual([]); expect(draftToIR(draft).scenes.length).toBe(scenes.length); expect(ir.scenes.length).toBeGreaterThanOrEqual(scenes.length);   // solo un beat de más de 52 palabras puede partirse (por eso el prompt lo limita)
    expect(ir.scenes[0].hints.transition).toBeUndefined(); expect(ir.scenes.slice(1).every((x) => x.hints.transition === "cut")).toBe(true);
  });
  it("las marcas de música NO se convierten en música real: ninguna escena recibe una pista (hint de música)", () => {
    const { draft, scenes } = storyToDraft(story, good(), names), script = draftToShortScript(draft, scenes), ir = parsedToIR(parseScript(script, names.map((n, i) => ({ id: String(i), name: n }))));
    expect(script).toMatch(/\[marca-musica: inicio/); expect(script).not.toMatch(/\[musica:/); expect(ir.scenes.every((s) => !s.hints.music)).toBe(true);
  });
});

describe("directivas solo del director (sonido, marca-musica, impacto, silencio)", () => {
  it("parseDirection no las trata como beat ni como aviso", () => { for (const d of ["sonido: puerta en 2s", "marca-musica: inicio en 0s", "impacto: en 5s", "silencio: en 6s durante 1.5s"]) expect(parseDirection(d)).toEqual({}); expect(parseDirection("camara: seguir KAP en 2s").beat).toBeDefined(); expect(parseDirection("baila: KAP").warning).toBeDefined(); });
  it("parseDirectorCue produce marcas con tiempo", () => {
    expect(parseDirectorCue("sonido: puerta en 2.5s")).toEqual({ sound: { t: 2.5, kind: "door" } }); expect(parseDirectorCue("marca-musica: inicio en 0.3s")).toEqual({ music: { t: 0.3, kind: "music_start" } }); expect(parseDirectorCue("marca-musica: cambio en 20s")?.music?.kind).toBe("music_change"); expect(parseDirectorCue("marca-musica: fin en 55s")?.music?.kind).toBe("music_stop");
    expect(parseDirectorCue("impacto: en 5s")).toEqual({ music: { t: 5, kind: "impact" }, sound: { t: 5, kind: "bump" } }); expect(parseDirectorCue("silencio: en 6s durante 2s")).toEqual({ music: { t: 6, kind: "silence", dur: 2 } });
    expect(parseDirectorCue("sonido: trompeta")?.warning).toBeDefined(); expect(parseDirectorCue("plano: general")).toBeUndefined();
  });
});
