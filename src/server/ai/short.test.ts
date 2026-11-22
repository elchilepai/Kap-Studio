import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest } from "@/ports/studio";
import type { ContextPack } from "@/memory";
import { aiFrom, withShortMode } from "./registry";
import { llmShortAuthor } from "./short";
import { SHORT_SYSTEM } from "./prompts";
import { good } from "@/narrative/short.fixture";
import { direct } from "@/animation/director";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createEpisodeFromRequest } from "@/server/memory/service";

class Scripted implements LlmClient {
  id = "scripted"; label = "doble"; model = "m"; contextTokens = 8192; calls: LlmRequest[] = [];
  constructor(private replies: unknown[]) {}
  async available() { return true; }
  async generate(req: LlmRequest) { this.calls.push(req); const r = this.replies.shift(); if (r === undefined) throw new Error("sin más respuestas"); return { text: typeof r === "string" ? r : JSON.stringify(r) }; }
}
const ctx = (over: Partial<ContextPack["request"]> = {}): ContextPack => ({ request: { text: "x", number: 1, season: 1, exact: false, cast: [], notes: "Un Short: KAP derrama leche en la consola y su hermano casi lo descubre", ...over }, budgetTokens: 1000, usedTokens: 10, sections: [{ id: "x", title: "x", text: "x", tokens: 1 }] as never, text: "# Contexto\nKAP", warnings: [] } as unknown as ContextPack);
const story = (beats = good(), extra: Record<string, unknown> = {}) => ({ title: "El mando mojado", logline: "KAP moja el mando y lo esconde.", hook: "la leche cae", cast: ["KAP", "Hermano de KAP"], beats, ...extra });
const write = async (replies: unknown[], c = ctx(), cast = ["KAP", "Hermano de KAP"]) => { const llm = new Scripted(replies), author = llmShortAuthor(llm), out = await author.write({ request: { ...c.request, cast }, context: c, hints: { mode: "short" } }); return { llm, author, out }; };

describe("autor del Short (SHORT MODE)", () => {
  it("UNA sola llamada al modelo para toda la historia; guion con beats, sonido y música; stats con retención", async () => {
    const { llm, author, out } = await write([story()]);
    expect(llm.calls).toHaveLength(1); expect(llm.calls[0].system).toBe(SHORT_SYSTEM); expect(llm.calls[0].jsonSchema).toBeDefined();
    expect(out.script).toMatch(/\[sonido: golpe en /); expect(out.script).toMatch(/\[impacto: en /); expect(out.stats?.retention).toMatchObject({ total: 12 }); expect(out.stats!.retention!.beats).toBe(9); expect(out.stats!.retention!.seconds).toBeGreaterThanOrEqual(45);
    expect(out.ir).toBeDefined(); expect(author.lastBeats).toHaveLength(9); expect(out.stats!.localPatches).toBe(0);
  });
  it("la narración queda como dirección (sin hablante) y solo se dice el diálogo", async () => {
    const { out } = await write([story()]); const lines = out.script.split("\n").filter((l) => l && !l.startsWith("#") && !l.startsWith("["));
    expect(lines.filter((l) => /^HERMANO DE KAP: /.test(l))).toHaveLength(1); expect(lines.some((l) => /^KAP: /.test(l))).toBe(false);
  });
  it("si falla el gancho: como mucho UNA reescritura local, y se aplica", async () => {
    const bad = story(); bad.beats[0] = { ...bad.beats[0], action: "Una habitación azul con mucha luz y paredes lisas", reaction: "" };
    const { llm, out } = await write([bad, { beats: [{ index: 0, action: "KAP tira el vaso y la leche cae sobre el mando", reaction: "El mando chisporrotea", change: "la consola chispea" }] }]);
    expect(llm.calls).toHaveLength(2); expect(out.stats!.localPatches).toBe(1); expect(out.script).toMatch(/chisporrotea/);
  });
  it("repara en código los beats repetidos (sin llamar al modelo) y avisa", async () => {
    const s = story(); s.beats.splice(3, 0, { ...s.beats[2] }); const { llm, out } = await write([s]);
    expect(llm.calls).toHaveLength(1); expect(out.stats!.codeRepairs).toBeGreaterThanOrEqual(1); expect(out.warnings.some((w) => /Reparación local del Short/.test(w))).toBe(true);
  });
  it("personajes fuera del reparto se retiran; el hermano solo si la petición lo menciona", async () => {
    const s = story(); s.beats[1] = { ...s.beats[1], characters: ["KAP", "Dani"] };
    const { out } = await write([s]); expect(out.warnings.some((w) => /fuera del reparto retirado.*Dani/.test(w))).toBe(true); expect(out.script).not.toMatch(/Dani/);
    const none = story(); const r = await write([none], ctx({ notes: "Un Short de KAP con el mando" }), ["KAP"]); expect(r.out.script).not.toMatch(/^HERMANO DE KAP:/m);
  });
  it("una moraleja final se avisa y se corrige con UNA reescritura local del remate", async () => {
    const s = story(); s.beats.at(-1)!.dialogue = { speaker: "KAP", text: "Desde ese día aprendió que lo importante es decir la verdad" };
    const bad = await write([s, "no es json", "tampoco"]); expect(bad.out.warnings.some((w) => /SHORT_RETENTION_CHECK · remate/.test(w))).toBe(true); expect(bad.out.stats!.localPatches).toBe(1);
    const fixed = await write([s, { beats: [{ index: 8, action: "KAP empuja el vaso bajo el sofá con el pie", reaction: "El hermano lo ve y se ríe", change: "el hermano lo sabe y calla" }] }]);
    expect(fixed.llm.calls).toHaveLength(2); expect(fixed.out.warnings.some((w) => /SHORT_RETENTION_CHECK · remate/.test(w))).toBe(false); expect(fixed.out.script).toMatch(/empuja el vaso/);
  });
});

describe("enrutado por modo (el episodio no cambia)", () => {
  it("hints.mode = short usa el autor de Shorts; sin modo, el autor de episodios", async () => {
    let which = ""; const ep = { id: "ep", label: "ep", free: true, available: async () => true, write: async () => { which = "episode"; return { script: "x", warnings: [] }; } };
    const llm = new Scripted([story()]), routed = withShortMode(ep, llm);
    await routed.write({ request: ctx().request, context: ctx() }); expect(which).toBe("episode"); expect(llm.calls).toHaveLength(0);
    which = ""; await routed.write({ request: { ...ctx().request, cast: ["KAP", "Hermano de KAP"] }, context: ctx(), hints: { mode: "short" } }); expect(which).toBe(""); expect(llm.calls).toHaveLength(1);
    expect(aiFrom(new Scripted([])).author).toBeDefined();
  });
});

describe("dirección creativa del prompt", () => {
  it("pide situación concreta, cuerpo antes que palabras, reacciones variadas y final sin conferencia", () => {
    for (const re of [/duda, problema o situaci[oó]n cotidiana/, /DE LA PREGUNTA A LA SITUACI[OÓ]N/, /nadie dice la lecci[oó]n en voz alta/, /REACCIONA CON EL CUERPO ANTES DE HABLAR/, /REACCIONES VARIADAS/, /MOVIMIENTO CONTINUO/, /no una conferencia/, /silence/]) expect(SHORT_SYSTEM).toMatch(re);
  });
});

describe("formato vertical", () => {
  it("un Short se renderiza en 9:16 a 1080×1920", async () => { const { dimensions } = await import("@/server/render/presets"); expect(dimensions("9:16", "1080p")).toMatchObject({ width: 1080, height: 1920 }); });
});

describe("director en modo Short", () => {
  const base = { duration: 6, tail: 0.5, aspect: 9 / 16, index: 0, fps: 30, width: 1080, height: 1920, location: "Salón", mood: "tarde, interior", tags: [], narration: "KAP mira el mando.", characters: [{ id: "k", name: "KAP", appearance: { kind: "stickman" } as never }], lines: [], style: { ink: "#000", line: 0.045, grade: "none", vignette: 0.3, shadow: true, bars: 0 } as never };
  it("sin relleno automático: ni cámara a la deriva ni aire muerto rellenado; con directivas de sonido/música", () => {
    const dir = ["sonido: puerta en 1s", "musica: inicio en 0.3s", "impacto: en 3s", "silencio: en 4s durante 1.5s"];
    const s = direct({ ...base, short: true, pacing: false, directions: dir }), e = direct({ ...base, pacing: true, directions: [] });
    expect(s.music).toEqual([{ t: 0.3, kind: "music_start" }, { t: 3, kind: "impact" }, { t: 4, kind: "silence", dur: 1.5 }]); expect(s.sounds?.map((x) => x.kind)).toEqual(expect.arrayContaining(["door", "bump"]));
    expect(s.warnings.filter((w) => /sonido|musica/.test(w))).toEqual([]); expect(s.cues.filter((c) => c.type === "camera").every((c) => c.dur === 0.01)).toBe(true);   // solo el encuadre inicial, sin deriva
     expect(e.cues.some((c) => c.type === "camera")).toBe(true);
    expect(direct({ ...base, directions: [] }).music).toBeUndefined();
  });
});

describe("producción de un Short (numeración propia)", () => {
  it("createEpisodeFromRequest con mode short crea kind «short», título «Short N» y no choca con un episodio del mismo número", async () => {
    const st = createSqliteStorage(":memory:"), llm = new Scripted([story(), story()]), deps = { storage: st, now: () => "2026-04-01T00:00:00Z", ai: { author: aiFrom(llm).author } } as never;
    const a = await createEpisodeFromRequest(deps, "Un Short de KAP con el mando", { mode: "short" }); expect(a.production).toMatchObject({ kind: "short", number: 1, title: "Short 1" }); expect(a.authored).toBe(true); expect(a.production.script).toMatch(/^# /m);
    const b = await createEpisodeFromRequest(deps, "Otro Short de KAP", { mode: "short" }); expect(b.production.number).toBe(2);
    const ep = await createEpisodeFromRequest({ storage: st, now: () => "x" } as never, "Crea el episodio 1"); expect(ep.production).toMatchObject({ kind: "episode", number: 1, title: "Episodio 1" });
  });
});
