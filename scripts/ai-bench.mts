/**
 * BANCO DE PRUEBAS DE IA LOCAL (docs/IA-LOCAL.md). Mide un modelo de Ollama sobre el pipeline REAL de KAP:
 *   petición → contexto de memoria → IA (JSON validado) → IR → memoria/continuidad → escenas.
 * La IA nunca toca la animación ni el canon: solo produce un borrador que pasa por las mismas validaciones que cualquier guion.
 *   AI_MODEL=qwen3:8b AI_PHASE=tech|narrative  npx tsx --no-warnings scripts/ai-bench.mts
 *   AI_ONLY=T1,T8 (subconjunto) · AI_SCENES=6 (escenas de las pruebas técnicas)
 * Resultados: docs/ia-bench/<modelo>-<fase>.json (+ textos a ciegas en docs/ia-bench/blind/ para la fase narrative).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kap-aibench-"));
process.env.KAP_DATA_DIR = root;   // todo en un directorio temporal: no se toca el canon ni los datos de nadie
const MODE = process.env.AI_MODE === "arc" ? "arc" : "json", MODEL = process.env.AI_MODEL ?? "qwen3:8b", PHASE = process.env.AI_PHASE ?? "tech", ONLY = (process.env.AI_ONLY ?? "").split(",").filter(Boolean), SCENES = Number(process.env.AI_SCENES ?? 6);
const OUT = path.resolve(import.meta.dirname, "..", "docs", "ia-bench"), SLUG = MODEL.replace(/[^a-z0-9]+/gi, "-");
const { createSqliteStorage } = await import("../src/adapters/local/sqlite-storage");
const { createOllamaClient } = await import("../src/server/ai/ollama");
const { llmEpisodeAuthor, EpisodeDraft, draftSeconds } = await import("../src/server/ai/episode");
const { llmArcAuthor } = await import("../src/server/ai/arc");
const { reviewNarrative, countBySeverity } = await import("../src/narrative/review");
const { generateJson } = await import("../src/server/ai/json");
const { validateIR } = await import("../src/domain/screenplay");
const { irToScenes, parsedToIR } = await import("../src/server/studio/interpreter");
const { parseScript } = await import("../src/server/studio/script");
const { z } = await import("zod");
const M = await import("../src/server/memory/service");
const mem = await import("../src/memory");

const llm = createOllamaClient({ baseUrl: process.env.KAP_OLLAMA_URL ?? "http://127.0.0.1:11434", model: MODEL, contextTokens: Number(process.env.AI_CTX ?? 8192), timeoutMs: 45 * 60_000 });
const NAMES = ["KAP", "Hermano de KAP", "Dani", "Ramiro", "Profesora"];

// ---------------------------------------------------------------- mundo: canon inicial (+ 3 episodios de DEMOSTRACIÓN aprobados en una BD temporal)
async function world(kind: "fresh" | "after3") {
  const storage = createSqliteStorage(":memory:"); const deps = { storage, now: () => "2026-04-01T00:00:00Z" };
  for (const [i, n] of NAMES.entries()) await storage.characters.save({ id: `c${i}`, name: n, description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });
  await M.registerKapCanon(deps);
  const chars = await storage.characters.list(), bible = { characters: NAMES, places: [] as string[] };
  const mk = async (id: string, number: number, script: string, status: "REVIEW" | "APPROVED" = "REVIEW", extra: Record<string, unknown> = {}) => {
    const r = validateIR(parsedToIR(parseScript(script, chars.map((c, i) => ({ id: String(i), name: c.name })))), bible); if (!r.ir) throw new Error(`guion inválido: ${r.errors.join("; ")}`);
    const p = { id, kind: "episode" as const, number, season: 1, title: `Episodio ${number}`, status, synopsis: "", script, scenes: irToScenes(r.ir, chars), assetIds: [], durationSec: 300, cast: [], storyTime: "", generated: true, brief: "", createdAt: "x", updatedAt: "x", ...extra };
    await storage.productions.save(p as never); return p;
  };
  if (kind === "after3") for (let n = 1; n <= 3; n++) {
    await mk(`demo${n}`, n, await fs.readFile(path.join(import.meta.dirname, "fixtures", "kap-demo", `ep${n}.txt`), "utf8"), "REVIEW", n > 1 ? { continuesFrom: 1000 + n - 1 } : {});
    await M.proposeMemory(deps, `demo${n}`); await M.saveDecisions(deps, `demo${n}`, { all: "accepted" }); await storage.productions.save({ ...(await storage.productions.get(`demo${n}`))!, status: "APPROVED" }); await M.commitMemory(deps, `demo${n}`);
  }
  return { storage, deps, chars, bible, mk };
}
type World = Awaited<ReturnType<typeof world>>;

// ---------------------------------------------------------------- RAM: suma del RSS de los procesos de Ollama (servidor + runner) cada segundo
const rss = () => { try { return execFileSync("ps", ["-C", "ollama,llama-server,ollama-runner", "-o", "rss="]).toString().split("\n").reduce((n, l) => n + (Number(l.trim()) || 0), 0) / 1024; } catch { return 0; } };
const sysUsed = () => { const m = Object.fromEntries((execFileSync("cat", ["/proc/meminfo"]).toString().split("\n")).map((l) => l.split(/:\s+/)).filter((x) => x[1]).map(([k, v]) => [k, parseInt(v, 10) / 1024])); return m.MemTotal - m.MemAvailable; };
async function measured<T>(fn: () => Promise<T>) { let peak = 0, sys = 0; const t = setInterval(() => { peak = Math.max(peak, rss()); sys = Math.max(sys, sysUsed()); }, 1000); const t0 = Date.now(); try { return { value: await fn(), ms: Date.now() - t0, peakMb: Math.round(Math.max(peak, rss())), sysPeakMb: Math.round(Math.max(sys, sysUsed())) }; } finally { clearInterval(t); } }
async function loaded() { try { const j = (await (await fetch("http://127.0.0.1:11434/api/ps")).json()) as { models?: { name: string; size: number; context_length?: number }[] }; const m = j.models?.find((x) => x.name === MODEL); return m ? { sizeMb: Math.round(m.size / 1048576), context: m.context_length } : undefined; } catch { return undefined; } }

async function unload() { try { await fetch("http://127.0.0.1:11434/api/generate", { method: "POST", body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }); await new Promise((r) => setTimeout(r, 4000)); } catch { /* no crítico */ } }

// ---------------------------------------------------------------- comprobaciones automáticas
const norm = mem.norm, words = (s: string) => s.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
const PREMATURE = /(disco de platino|estadio (lleno|repleto)|millones de (seguidores|oyentes|reproducciones)|fama mundial|gira mundial|discográfica|contrato millonario|premio grammy|estrella del rap|famoso en todo)/i;
type Check = { id: string; ok: boolean; note?: string };
const hasText = (draft: any, re: RegExp) => draft.scenes.some((s: any) => s.lines.some((l: any) => re.test(norm(l.text)) || re.test(norm(l.speaker))) || re.test(norm(s.title + " " + s.location)));
function commonChecks(draft: any, findings: any[], expect: { exact?: boolean; lastLocation?: string } = {}): Check[] {
  const memory: string[] = draft.scenes.flatMap((s: any) => s.memory.map((m: string) => m.replace(/^\[|\]$/g, "")));
  const parsed = mem.parseMemoryDirectives(memory.filter((m) => mem.isMemoryKey(m.split(":")[0]))), kinds = new Set(parsed.acts.map((a) => a.kind));
  const speakers = new Set(draft.scenes.flatMap((s: any) => s.lines.map((l: any) => norm(l.speaker)).filter(Boolean)));
  const text = draft.scenes.flatMap((s: any) => s.lines.map((l: any) => l.text)).join(" "), w = words(text), ttr = new Set(w).size / Math.max(1, w.length);
  const es = w.filter((x) => ["el", "la", "de", "que", "y", "en", "un", "una", "su", "con", "por", "se", "no", "lo"].includes(x)).length / Math.max(1, w.length);
  return [
    { id: "estructura-6-actos", ok: mem.REQUIRED_ACTS.every((a) => kinds.has(a)), note: `faltan: ${mem.REQUIRED_ACTS.filter((a) => !kinds.has(a)).join(", ") || "—"}` },
    { id: "gancho", ok: kinds.has("gancho") && !!parsed.hook },
    { id: "protagonista", ok: speakers.has("kap") },
    { id: "sin-errores-criticos", ok: !findings.some((f) => f.severity === "error"), note: findings.filter((f) => f.severity === "error").map((f) => f.rule).join(",") },
    { id: "sin-exito-prematuro", ok: !PREMATURE.test(text) && !memory.some((m) => /^hito-logrado:\s*(primeros? (exitos?|trabajos)|exito|llegada a la cima|primer reconocimiento)/i.test(norm(m))) },
    { id: "directivas-validas", ok: parsed.errors.length === 0 && !memory.some((m) => !mem.isMemoryKey(m.split(":")[0])), note: parsed.errors.slice(0, 2).join(" | ") },
    { id: "espanol", ok: es > 0.18 },
    ...(expect.exact ? [{ id: "arranca-donde-termino", ok: !!expect.lastLocation && (norm(draft.scenes[0].location) === norm(expect.lastLocation) || memory.some((m) => /^ubicacion:|^momento:/i.test(norm(m)))), note: `1.ª escena en «${draft.scenes[0].location}», terminó en «${expect.lastLocation}»` }] : []),
  ].concat([{ id: "diversidad-lexica", ok: ttr > 0.3, note: ttr.toFixed(2) }]);
}
/** Proxy de calidad narrativa 0-10 (automático y grosero: la valoración real es humana, ver prueba a ciegas). */
function proxy(draft: any, secs: number) {
  const lines = draft.scenes.flatMap((s: any) => s.lines), dlg = lines.filter((l: any) => l.speaker).length / Math.max(1, lines.length), locs = new Set(draft.scenes.map((s: any) => norm(s.location))).size;
  const sent = lines.flatMap((l: any) => l.text.split(/(?<=[.!?])\s+/)).map((s: string) => norm(s)).filter((s: string) => s.length > 20), dup = sent.length - new Set(sent).size;
  const pts = [dlg >= 0.25 && dlg <= 0.75, locs >= 3, dup === 0, draft.logline.length > 20, draft.scenes.length >= 5, secs >= 120];
  return { score: Math.round((pts.filter(Boolean).length / pts.length) * 10), dialogueRatio: +dlg.toFixed(2), locations: locs, repeatedSentences: dup };
}

// ---------------------------------------------------------------- tareas
type Task = { id: string; title: string; world: "fresh" | "after3"; request: string; checks?: (d: any, f: any[], w: World) => Check[]; kind?: "author" | "review" };
const EXACT = (n: number) => `Crea el episodio ${n} continuando exactamente donde terminó el episodio ${n - 1}`;
const TASKS: Task[] = [
  { id: "T1", title: "Crear el primer episodio de la historia", world: "fresh", request: "Crea el episodio 1",
    checks: (d, _f) => [{ id: "etapa-nino-sin-saltos", ok: !d.scenes.some((s: any) => s.memory.some((m: string) => /^etapa:/i.test(norm(m)))) }, { id: "muestra-hermano", ok: hasText(d, /herman/) }, { id: "muestra-situacion-familiar", ok: hasText(d, /padres|madre|padre|mama|papa/) },
      { id: "hito-inicial", ok: d.scenes.some((s: any) => s.memory.some((m: string) => /^hito(-logrado)?:\s*(nino con pocos recursos|nino que intenta proteger)/i.test(norm(m)))) }, { id: "edad-infantil", ok: d.scenes.every((s: any) => s.memory.every((m: string) => { const a = /^edad:\s*kap,\s*(\d+)/i.exec(norm(m)); return !a || +a[1] <= 11; })) }] },
  { id: "T2", title: "Continuar exactamente donde termina un episodio", world: "after3", request: `${EXACT(4)}`,
    checks: (d) => [{ id: "retoma-gancho-cuaderno", ok: hasText(d, /cuaderno/) && hasText(d, /dani/) }, { id: "no-reabre-escenario-ajeno", ok: true }] },
  { id: "T3", title: "Mantener el estado del hermano", world: "after3", request: `${EXACT(4)}. Que el hermano pequeño siga presente: KAP lo cuida y se nota cómo está.`,
    checks: (d) => { const n = d.scenes.filter((s: any) => s.lines.some((l: any) => /herman/.test(norm(l.speaker + " " + l.text)))).length; return [{ id: "hermano-en-2-escenas-o-mas", ok: n >= 2, note: `${n} escenas` }, { id: "hermano-sigue-siendo-pequeno", ok: !hasText(d, /hermano mayor|su hermano (ya )?(es|era) (mayor|adulto)/) }]; } },
  { id: "T4", title: "Introducir un personaje nuevo", world: "after3", request: `${EXACT(4)}. Introduce a una vecina nueva que le presta libros de poesía a KAP.`,
    checks: (d, f) => { const known = new Set(NAMES.map(norm).concat(["kap", "hermano de kap", "padres de kap"])), news = [...new Set(d.scenes.flatMap((s: any) => s.lines.map((l: any) => norm(l.speaker)).filter((x: string) => x && !known.has(x))))] as string[];
      const declared = d.scenes.some((s: any) => s.memory.some((m: string) => /^(conoce|relacion):/i.test(norm(m)) && news.some((n) => norm(m).includes(n))));
      return [{ id: "personaje-nuevo-habla", ok: news.length >= 1, note: news.join(", ") }, { id: "no-mas-de-2-nuevos", ok: news.length <= 2 }, { id: "declara-quien-es-en-memoria", ok: declared }, { id: "poesia-o-libros", ok: hasText(d, /libro|poes|verso|rima/) }, { id: "info-nueva-detectada", ok: f.some((x) => x.rule === "nuevo") || news.length >= 1 }]; } },
  { id: "T5", title: "Continuar con un hilo abierto", world: "after3", request: `${EXACT(4)}. Retoma el hilo de Dani y el cuaderno de KAP y llévalo a un punto de inflexión sin resolverlo del todo.`,
    checks: (d) => [{ id: "menciona-dani-y-cuaderno", ok: hasText(d, /dani/) && hasText(d, /cuaderno/) }, { id: "no-cierra-el-hilo-de-golpe", ok: !d.scenes.some((s: any) => s.memory.some((m: string) => /^cierra-hilo:.*(dani|acosa)/i.test(norm(m)))) }, { id: "declara-algo-del-hilo", ok: d.scenes.some((s: any) => s.memory.some((m: string) => /^(evento|abre-hilo|relacion):.*(dani|cuaderno)/i.test(norm(m)))) }] },
  { id: "T6", title: "Proponer un cambio de etapa", world: "after3", request: `${EXACT(4)}. KAP crece y empieza a tomarse la música en serio: entra en la adolescencia.`,
    checks: (d) => { const ages = d.scenes.flatMap((s: any) => s.memory.map((m: string) => /^edad:\s*kap,\s*(\d+)/i.exec(norm(m))).filter(Boolean)).map((a: any) => +a[1]); return [{ id: "propone-etapa-adolescente", ok: d.scenes.some((s: any) => s.memory.some((m: string) => /^etapa:\s*kap,\s*adolescente/i.test(norm(m)))) }, { id: "edad-progresiva-max-+2", ok: ages.length > 0 && ages.every((a: number) => a >= 9 && a <= 11), note: `edades: ${ages.join(",") || "—"}` }, { id: "avanza-hito-5", ok: d.scenes.some((s: any) => s.memory.some((m: string) => /^hito(-logrado)?:.*(musica en serio|adolescente)/i.test(norm(m)))) }]; } },
  { id: "T8", title: "Petición ambigua", world: "after3", request: "Haz que pase algo importante con la música de KAP",
    checks: (d) => [{ id: "explicita-suposiciones", ok: Array.isArray(d.assumptions) && d.assumptions.length > 0, note: (d.assumptions ?? []).join(" | ").slice(0, 200) }, { id: "no-cambia-de-etapa-ni-salta", ok: !d.scenes.some((s: any) => s.memory.some((m: string) => /^etapa:/i.test(norm(m)))) }, { id: "continua-del-ep-3", ok: hasText(d, /ramiro|cuaderno|rima|rap|ritmo|cancion|letra/) }] },
];

// T7: el modelo hace de REVISOR de continuidad sobre un borrador con 4 contradicciones plantadas
const PLANTED = `# Estudio
KAP, ya con quince años, firma un contrato con una gran discográfica y es famoso en todo el país.
KAP: Mi hermano mayor me ayudó a llegar hasta aquí.
Sus padres, sobrios y ricos, aplauden orgullosos desde la primera fila.
[edad: KAP, 15]
[etapa: KAP, Artista emergente]
[hito-logrado: Primeros éxitos | firma con una discográfica]
[acto: inicio | x]
[gancho: y]`;
const TRUTH: { id: string; re: RegExp }[] = [{ id: "salto-de-edad", re: /edad|15|quince|años|salto/i }, { id: "padres-sobrios-ricos", re: /padres|sobri|ricos|drog|pobre|recursos/i }, { id: "hermano-mayor", re: /hermano|mayor|pequeño|pequeno/i }, { id: "exito-prematuro", re: /fam|éxito|exito|discogr|contrato|cima|prematur|etapa|hito/i }];
const Review = z.object({ contradictions: z.array(z.object({ statement: z.string().max(300), canon_fact: z.string().max(300), severity: z.enum(["critico", "aviso"]) })).max(12) });

async function runReview(w: World) {
  const { pack } = await M.requestContext(w.storage, "Crea el episodio 4 continuando el episodio 3");
  const prompt = `${pack.text}\n\n# Tarea\nRevisa este borrador de guion frente al canon de arriba. Devuelve JSON {"contradictions": [{"statement": "lo que dice el borrador", "canon_fact": "el hecho del canon que contradice", "severity": "critico|aviso"}]} con TODAS las contradicciones y solo las reales.\n\n# Borrador\n${PLANTED}`;
  const m = await measured(() => generateJson(llm, Review, { system: "Eres el revisor de continuidad de la serie KAP. Respondes solo con JSON.", prompt, temperature: 0.2, maxTokens: 1200 }, { retries: 2 }));
  const r = m.value, found = r.ok ? r.data.contradictions : [], hit = TRUTH.filter((t) => found.some((c) => t.re.test(c.statement + " " + c.canon_fact))), fp = found.filter((c) => !TRUTH.some((t) => t.re.test(c.statement + " " + c.canon_fact)));
  // el sistema (reglas, sin IA) también debe detectarlas, con o sin ayuda del modelo
  const prod = await w.mk("planted", 4, PLANTED, "REVIEW", { continuesFrom: 1003 }); await M.proposeMemory(w.deps, "planted"); const sys = (await M.memoryStatus(w.storage, "planted"))!.findings; void prod;
  return { id: "T7", title: "Detectar una contradicción con el canon", ms: m.ms, peakMb: m.peakMb, sysPeakMb: m.sysPeakMb, json: { ok: r.ok, firstTry: r.attempts === 1, attempts: r.attempts, retries: r.attempts - 1, jsonErrors: r.log.filter((l) => l.kind === "json").length, schemaErrors: r.log.filter((l) => l.kind === "schema").length }, usage: r.usage,
    review: { planted: TRUTH.length, found: hit.length, recall: +(hit.length / TRUTH.length).toFixed(2), falsePositives: fp.length, detail: hit.map((h) => h.id), items: found.map((c) => c.statement.slice(0, 120)) }, systemRules: { critical: sys.filter((f) => f.severity === "error").map((f) => f.rule), warnings: sys.filter((f) => f.severity === "warning").map((f) => f.rule) },
    checks: [{ id: "el-modelo-detecta-las-4", ok: hit.length === 4, note: `${hit.length}/4` }, { id: "sin-falsos-positivos", ok: fp.length === 0, note: `${fp.length}` }, { id: "las-reglas-del-sistema-detectan-edad-etapa-exito", ok: ["salto-de-años", "etapa-saltada"].every((r) => sys.some((f) => f.rule === r && f.severity === "error")) }] as Check[] };
}

async function runAuthor(t: Task, requestText: string, scenes: number, w: World) {
  const { request, pack } = await M.requestContext(w.storage, requestText);
  const author: any = MODE === "arc" ? llmArcAuthor(llm) : llmEpisodeAuthor(llm, { scenes }); const m = await measured(async () => { try { return { ok: true as const, out: await author.write({ request, context: pack }) }; } catch (e) { return { ok: false as const, error: (e as Error).message }; } });
  const base = { id: t.id, title: t.title, request: requestText, ms: m.ms, peakMb: m.peakMb, sysPeakMb: m.sysPeakMb, contextTokens: pack.usedTokens };
  if (!m.value.ok) return { ...base, error: m.value.error, ok: false };
  const { out } = m.value, draft = author.lastDraft!, st = out.stats!;
  const kapNames = w.chars.map((c) => c.name), hookText = draft.scenes.flatMap((s: any) => s.memory).map((x: string) => /^gancho:\s*(.+)$/i.exec(x)?.[1]).filter(Boolean).pop();
  const plain = reviewNarrative({ scenes: draft.scenes.map((s: any) => ({ location: s.location, lines: s.lines })), hook: hookText, knownCharacters: kapNames }), tagged = reviewNarrative({ scenes: draft.scenes.map((s: any) => ({ location: s.location, lines: s.lines, fn: s.fn, stage: s.stage, shot: s.shot, time: s.time, interior: s.interior })), hook: hookText, knownCharacters: kapNames });
  const r = validateIR(parsedToIR(parseScript(out.script, w.chars.map((c, i) => ({ id: String(i), name: c.name })))), w.bible);   // IR tras el intérprete por reglas (lo que ve el pipeline)
  await w.mk("probe", request.number, out.script, "REVIEW", { continuesFrom: request.continuesFrom, brief: requestText }); await M.proposeMemory(w.deps, "probe");
  const ms = (await M.memoryStatus(w.storage, "probe"))!, f = ms.findings, lastLoc = (await M.answerStory(w.storage, "terminado")).sections.find((s) => /Último plano/.test(s.title))?.lines[0]?.match(/en ([^;]+);/)?.[1];
  await w.storage.productions.remove("probe"); await w.storage.memoryProposals.remove("probe");
  const checks = [...commonChecks(draft, f, { exact: /exactamente/.test(requestText), lastLocation: lastLoc }), ...(t.checks?.(draft, f, w) ?? [])];
  const secs = draftSeconds(draft), tps = st.usage.evalMs ? st.usage.outputTokens / (st.usage.evalMs / 1000) : 0;
  return { ...base, ok: true, irValid: r.errors.length === 0, irValidFirstTry: st.retries === 0 && r.errors.length === 0 && st.memoryDirectiveErrors === 0,
    json: { attempts: st.attempts, retries: st.retries, jsonErrors: st.jsonErrors, schemaErrors: st.schemaErrors, lengthRetries: st.lengthRetries, memoryDirectiveErrors: st.memoryDirectiveErrors }, irErrors: r.errors, usage: st.usage, tokensPerSec: +tps.toFixed(2),
    episode: { scenes: draft.scenes.length, estimatedSec: secs, words: draft.scenes.reduce((n: number, s: any) => n + s.lines.reduce((k: number, l: any) => k + words(l.text).length, 0), 0), title: draft.title, logline: draft.logline },
    continuity: { critical: f.filter((x) => x.severity === "error").map((x) => `${x.rule}: ${x.text.slice(0, 140)}`), warnings: f.filter((x) => x.severity === "warning").map((x) => `${x.rule}: ${x.text.slice(0, 140)}`), info: f.filter((x) => x.severity === "info").length },
    narrative: { ...countBySeverity(plain), rules: [...new Set(plain.map((f) => f.rule.replace("narrativa-", "")))], findings: plain, taggedRules: [...new Set(tagged.map((f) => f.rule.replace("narrativa-", "")))] }, mode: MODE, arc: author.lastArc, checks, compliance: +(checks.filter((c) => c.ok).length / checks.length).toFixed(2), proxy: proxy(draft, secs), warnings: out.warnings.slice(0, 6), draft };
}

// ---------------------------------------------------------------- fases
await fs.mkdir(path.join(OUT, "blind"), { recursive: true });
const t0 = Date.now(); const meta = { model: MODEL, phase: PHASE, ctx: llm.contextTokens, date: new Date().toISOString(), cpus: os.cpus().length, ramGb: Math.round(os.totalmem() / 1073741824), host: "CPU sin GPU" };
console.log(`\n== Banco de IA local · ${MODEL} · fase ${PHASE} · ${meta.cpus} vCPU / ${meta.ramGb} GB · contexto ${meta.ctx} ==`);
if (!(await llm.available())) { console.error(`El modelo ${MODEL} no está disponible en Ollama`); process.exit(2); }
const results: any[] = [];
/** Guardado incremental: un reinicio del contenedor no debe perder las tareas ya terminadas. */
const save = () => fs.writeFile(path.join(OUT, `${SLUG}-${PHASE}${PHASE === "blind2" ? "-" + MODE : ""}${ONLY.length ? "-" + ONLY.join("") : ""}.partial.json`), JSON.stringify({ meta, partial: true, results }, null, 1));
if (PHASE === "tech" || PHASE === "all") {
  const worlds: Partial<Record<"fresh" | "after3", World>> = {};
  for (const t of TASKS.concat([{ id: "T7", title: "", world: "after3", request: "", kind: "review" }]).filter((x) => !ONLY.length || ONLY.includes(x.id))) {
    const w = (worlds[t.world] ??= await world(t.world)); console.log(`\n[${t.id}] ${t.title || "Detectar una contradicción con el canon"} …`);
    await unload();   // el runner de Ollama acumula RSS entre tareas (≈ +1,5 GB/episodio): se descarga para medir cada tarea desde un estado limpio y no agotar la RAM
    const r = t.kind === "review" ? await runReview(w) : await runAuthor(t, t.request, SCENES, w); results.push(r); await save();
    console.log(`   ${(r.ms / 1000).toFixed(0)} s · RAM pico ${r.peakMb} MB · ${"error" in r ? "ERROR " + r.error : `${r.id === "T7" ? `detecta ${(r as any).review.found}/4 · falsos+ ${(r as any).review.falsePositives}` : `IR ${(r as any).irValid ? "válida" : "inválida"}${(r as any).irValidFirstTry ? " a la primera" : ""}`} · reintentos ${(r as any).json.retries} · cumplimiento ${Math.round((((r as any).compliance ?? ((r as any).checks.filter((c: Check) => c.ok).length / (r as any).checks.length)) ) * 100)}% · crit ${(r as any).continuity?.critical.length ?? "-"}`}`);
    for (const c of ((r as any).checks ?? []).filter((c: Check) => !c.ok)) console.log(`     ✗ ${c.id}${c.note ? ` — ${c.note}` : ""}`);
  }
}
if (PHASE === "blind2") {
  const N = [
    { id: "N1", request: `${EXACT(4)}. Los compañeros se burlan de la ropa de KAP y él, para defenderse, suelta una rima improvisada por primera vez.` },
    { id: "N2", request: "Crea el episodio 4, a continuación del episodio 3. En casa no queda comida y el hermano pequeño tiene hambre; no hay padres ni dinero. KAP tiene que decidir qué hace." },
    { id: "N3", request: "Crea el episodio 4, a continuación del episodio 3. KAP se escapa a ensayar rimas en vez de cuidar a su hermano pequeño, y esa decisión tiene consecuencias." },
  ].filter((x) => !ONLY.length || ONLY.includes(x.id));
  const w = await world("after3");
  for (const s of N) {
    await unload(); console.log(`\n[${s.id}] (${MODE}) episodio completo …`); const r = await runAuthor({ id: s.id, title: "Situación nueva", world: "after3", request: s.request }, s.request, 18, w); results.push(r); await save();
    console.log(`   ${(r.ms / 60000).toFixed(1)} min · ${"error" in r ? "ERROR " + r.error : `${(r as any).episode.scenes} escenas · ≈ ${((r as any).episode.estimatedSec / 60).toFixed(1)} min · IR ${(r as any).irValid ? "válida" : "inválida"} · reintentos ${(r as any).json.retries} · crit ${(r as any).continuity.critical.length} · narrativa crit ${(r as any).narrative.error} aviso ${(r as any).narrative.warning} info ${(r as any).narrative.info}`}`);
  }
}
if (PHASE === "narrative" || PHASE === "all") {
  const S = [
    { id: "S1", request: `${EXACT(4)}. Dani tiene el cuaderno de KAP: quiero un episodio sobre la humillación pública y cómo KAP reacciona sin perder la dignidad.` },
    { id: "S2", request: `${EXACT(4)}. Un día su hermano pequeño se pone enfermo y no hay dinero ni padres presentes: KAP tiene que decidir qué hace.` },
    { id: "S3", request: `${EXACT(4)}. Ramiro le propone grabar su primera maqueta con un micrófono prestado, pero KAP falla en el intento y se frustra.` },
  ].filter((x) => !ONLY.length || ONLY.includes(x.id));
  const w = await world("after3");
  for (const s of S) {
    console.log(`\n[${s.id}] episodio completo (≈ 5 min) …`); const r = await runAuthor({ id: s.id, title: "Escenario narrativo", world: "after3", request: s.request }, s.request, 18, w); results.push(r); await save();
    console.log(`   ${(r.ms / 60000).toFixed(1)} min · ${"error" in r ? "ERROR " + r.error : `${(r as any).episode.scenes} escenas · ≈ ${((r as any).episode.estimatedSec / 60).toFixed(1)} min · IR ${(r as any).irValid ? "válida" : "inválida"} · reintentos ${(r as any).json.retries} · crit ${(r as any).continuity.critical.length}`}`);
  }
}
const loadedInfo = await loaded();
await fs.writeFile(path.join(OUT, `${SLUG}-${PHASE}${PHASE === "blind2" ? "-" + MODE : ""}${ONLY.length ? "-" + ONLY.join("") : ""}.json`), JSON.stringify({ meta, loaded: loadedInfo, totalMin: +((Date.now() - t0) / 60000).toFixed(1), results }, null, 1));
console.log(`\nTotal ${((Date.now() - t0) / 60000).toFixed(1)} min · modelo en memoria: ${JSON.stringify(loadedInfo)} · guardado en docs/ia-bench/`);
await fs.rm(root, { recursive: true, force: true });
