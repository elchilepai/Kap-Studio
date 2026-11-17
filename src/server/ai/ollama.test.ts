import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { assertLocalUrl, createOllamaClient } from "./ollama";
import { generateJson } from "./json";
import { EpisodeDraft, draftToIR, irToScript, llmEpisodeAuthor } from "./episode";
import { ScreenplayIR } from "@/domain/screenplay";
import { parseScript } from "@/server/studio/script";
import { parsedToIR } from "@/server/studio/interpreter";
import { buildContextPack, emptyCanon } from "@/memory";
import type { LlmClient, LlmRequest } from "@/ports/studio";

/** Servidor HTTP falso con la forma de la API de Ollama: comprueba qué se envía, sin ningún modelo real. */
let srv: http.Server, url = "", seen: { path: string; body: any }[] = [], replies: ((b: any) => { status?: number; json: unknown } | undefined)[] = [];
beforeAll(async () => {
  srv = http.createServer((req, res) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const body = raw ? JSON.parse(raw) : undefined; seen.push({ path: req.url!, body });
    if (req.url === "/api/tags") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ models: [{ name: "qwen3:8b", model: "qwen3:8b" }] })); }
    const r = replies.shift()?.(body) ?? { json: { message: { content: "{}" }, prompt_eval_count: 5, eval_count: 7 } };
    res.writeHead(r.status ?? 200, { "Content-Type": "application/json" }); res.end(JSON.stringify(r.json)); }); });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r)); url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => srv.close());
const client = (model = "qwen3:8b") => createOllamaClient({ baseUrl: url, model, contextTokens: 8192, timeoutMs: 5000 });

describe("cliente de Ollama (LlmClient)", () => {
  it("solo habla con loopback salvo que se permita expresamente", () => {
    expect(() => assertLocalUrl("http://127.0.0.1:11434")).not.toThrow(); expect(() => assertLocalUrl("http://localhost:11434")).not.toThrow();
    expect(() => assertLocalUrl("http://192.168.1.50:11434")).toThrow(/no local/); expect(() => assertLocalUrl("https://api.ejemplo.com")).toThrow(/solo usa modelos locales/); expect(() => assertLocalUrl("http://192.168.1.50:11434", true)).not.toThrow(); expect(() => assertLocalUrl("ftp://localhost")).toThrow();
  });
  it("available(): comprueba que el modelo existe; modelo ausente o servidor caído → false (no se simula)", async () => {
    expect(await client("qwen3:8b").available()).toBe(true); expect(await client("qwen3:14b").available()).toBe(false);
    expect(await createOllamaClient({ baseUrl: "http://127.0.0.1:1", model: "qwen3:8b", contextTokens: 8192, timeoutMs: 1000 }).available()).toBe(false);
  });
  it("envía el esquema como `format`, desactiva el razonamiento, fija contexto y parámetros, y devuelve el uso medido", async () => {
    seen = []; replies = [() => ({ json: { message: { content: "hola" }, prompt_eval_count: 120, eval_count: 30, total_duration: 5e9, load_duration: 1e9, prompt_eval_duration: 2e9, eval_duration: 2e9 } })];
    const r = await client().generate({ system: "sé breve", prompt: "di hola", jsonSchema: { type: "object" }, temperature: 0.3, maxTokens: 50 });
    const b = seen.find((s) => s.path === "/api/chat")!.body;
    expect(b).toMatchObject({ model: "qwen3:8b", stream: false, think: false, format: { type: "object" }, options: { temperature: 0.3, num_ctx: 8192, num_predict: 50 } }); expect(b.messages).toEqual([{ role: "system", content: "sé breve" }, { role: "user", content: "di hola" }]);
    expect(r).toMatchObject({ text: "hola", usage: { promptTokens: 120, outputTokens: 30, totalMs: 5000, loadMs: 1000, promptMs: 2000, evalMs: 2000 } });
  });
  it("errores HTTP y de modelo se lanzan con motivo; el tiempo máximo se respeta", async () => {
    replies = [() => ({ status: 500, json: { error: "boom" } })]; await expect(client().generate({ prompt: "x" })).rejects.toThrow(/Ollama respondió 500/);
    replies = [() => ({ json: { error: "model not found" } })]; await expect(client().generate({ prompt: "x" })).rejects.toThrow(/model not found/);
    const slow = http.createServer(() => {}); await new Promise<void>((r) => slow.listen(0, "127.0.0.1", r)); const c = createOllamaClient({ baseUrl: `http://127.0.0.1:${(slow.address() as AddressInfo).port}`, model: "m", contextTokens: 2048, timeoutMs: 200 });
    await expect(c.generate({ prompt: "x" })).rejects.toThrow(); slow.closeAllConnections(); slow.close();
  });
  it("generateJson con Ollama: registra el tipo de fallo de cada intento y suma el uso", async () => {
    const S = z.object({ n: z.number() }); seen = [];
    replies = [() => ({ json: { message: { content: "no es json" }, prompt_eval_count: 10, eval_count: 5 } }), () => ({ json: { message: { content: '{"n":"x"}' }, prompt_eval_count: 10, eval_count: 5 } }), () => ({ json: { message: { content: '{"n":2}' }, prompt_eval_count: 10, eval_count: 5 } })];
    const r = await generateJson(client(), S, { prompt: "p" }); expect(r).toMatchObject({ ok: true, attempts: 3, data: { n: 2 } }); expect(r.log.map((l) => l.kind)).toEqual(["json", "schema", "ok"]); expect(r.usage).toMatchObject({ promptTokens: 30, outputTokens: 15 });
    expect(seen.filter((s) => s.path === "/api/chat")[0].body.format).toMatchObject({ type: "object", properties: { n: { type: "number" } } });
  });
});

describe("autor JSON → IR (el modelo no toca el motor)", () => {
  const draft = (n: number, words = 60) => ({ title: "T", logline: "L", assumptions: [], scenes: Array.from({ length: n }, (_, i) => ({ title: `Escena ${i + 1}`, location: i % 2 ? "Calle" : "Casa", lines: [{ speaker: "", text: Array(words).fill("palabra").join(" ") }, { speaker: "KAP", text: "Hola, hermano." }], memory: i === 0 ? ["acto: inicio | x", "edad: KAP, 9"] : [] })) });
  class Fake implements LlmClient { id = "f"; label = "f"; model = "fake:1b"; contextTokens = 8192; calls: LlmRequest[] = []; constructor(private r: string[]) {} async available() { return true; } async generate(q: LlmRequest) { this.calls.push(q); return { text: this.r.shift() ?? "", usage: { promptTokens: 100, outputTokens: 200, totalMs: 1000, loadMs: 0, promptMs: 300, evalMs: 700 } }; } }
  const pack = () => buildContextPack({ request: { text: "x", number: 1, season: 1, exact: false, cast: [], notes: "Crea el episodio 1" }, canon: emptyCanon(), episodes: [] });

  it("convierte el borrador a IR válida y a guion que el intérprete reconstruye igual", () => {
    const d = EpisodeDraft.parse(draft(6, 30)), ir = draftToIR(d); expect(ScreenplayIR.safeParse(ir).success).toBe(true);
    const script = irToScript(ir), back = parsedToIR(parseScript(script, []));
    expect(back.scenes.map((s) => [s.location, s.lines.length, s.memory])).toEqual(ir.scenes.map((s) => [s.location, s.lines.length, s.memory ?? []])); expect(script).toMatch(/^# Casa/m); expect(script).toMatch(/^KAP: Hola, hermano\.$/m); expect(script).toMatch(/^\[acto: inicio \| x\]$/m);
  });
  it("estadísticas: intentos, reintentos por tipo, directivas inválidas y duración; amplía UNA vez si queda corto", async () => {
    const short = JSON.stringify(draft(4, 30)), long = JSON.stringify({ ...draft(18, 50), scenes: draft(18, 50).scenes.map((s, i) => (i === 1 ? { ...s, memory: ["inventada: x"] } : s)) });
    const llm = new Fake(["{no json", short, long]); const a = llmEpisodeAuthor(llm, { scenes: 18 }); const r = await a.write({ request: pack().request, context: pack() });
    expect(r.stats).toMatchObject({ attempts: 3, retries: 2, jsonErrors: 1, schemaErrors: 0, lengthRetries: 1, memoryDirectiveErrors: 1 }); expect(r.stats!.usage.outputTokens).toBe(600); expect(r.stats!.estimatedSec).toBeGreaterThan(240);
    expect(llm.calls[2].prompt).toMatch(/Ampliación[\s\S]*dura ≈/); expect(r.warnings.join("\n")).toMatch(/Directiva de memoria inválida/); expect(ScreenplayIR.safeParse(r.ir).success).toBe(true); expect(r.script).toMatch(/^# Casa/m);
  });
  it("si el modelo nunca devuelve JSON válido, falla con motivo (no inventa un episodio)", async () => {
    const a = llmEpisodeAuthor(new Fake(["x", "y", "z"]), { scenes: 6, expand: false }); await expect(a.write({ request: pack().request, context: pack() })).rejects.toThrow(/no devolvió un episodio válido tras 3 intento/);
  });
  it("el prompt lleva el contexto de la memoria y la orden de no tocar la animación; el esquema viaja al motor", async () => {
    const llm = new Fake([JSON.stringify(draft(18, 60))]); await llmEpisodeAuthor(llm, { scenes: 18, expand: false }).write({ request: pack().request, context: pack() });
    expect(llm.calls[0].system).toMatch(/Nunca metas indicaciones de cámara ni de animación/); expect(llm.calls[0].prompt).toMatch(/# Contexto de continuidad/); expect(llm.calls[0].jsonSchema).toMatchObject({ type: "object", properties: { scenes: { type: "array" } } });
  });
});
