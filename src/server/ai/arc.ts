/**
 * GENERADOR POR ARCO: el modelo primero DISEÑA el arco dramático del episodio (problema → escalada → decisión de KAP → consecuencia →
 * resolución parcial → gancho) y después lo CONVIERTE en escenas, una por beat. Así cada escena tiene una función y el episodio no se
 * alarga repitiendo: la duración sale de la historia. Sigue siendo un `ScriptAuthor` más: devuelve el mismo borrador/IR/guion que el
 * autor «JSON», con la misma validación, y la memoria, la continuidad y el pipeline de animación no cambian. Los actos y el gancho
 * los fija el CÓDIGO a partir del arco (el modelo ya no tiene que acertar el formato de las directivas de memoria).
 */
import { z } from "zod";
import type { AuthorStats, LlmClient, LlmUsage, ScriptAuthor } from "@/ports/studio";
import { norm } from "@/memory/text";
import { ScreenplayIR } from "@/domain/screenplay";
import { parseDirection } from "@/animation/beats";
import { isMemoryKey, parseMemoryDirectives } from "@/memory/directives";
import { GENERIC_HOOK, SCENE_FUNCTIONS, reviewNarrative, type NarrativeFinding } from "@/narrative/review";
import { checkScene, gateFeedback, isBlocking, needsSceneRegen, repairLines, sceneRhyme, type GateIssue, type GateIssueKind, type GateLine } from "@/narrative/gate";
import { endingInterchangeable } from "@/narrative/closing";
import { episodeVariety } from "@/narrative/variety";
import { kapRealismCheck, type RealismResult } from "@/narrative/realism";
import { EpisodeDraft, draftSeconds, draftToIR, irToScript } from "./episode";
import { generateJson, sumUsage, type AttemptLog } from "./json";
import { ARC_SYSTEM, ENDING_SYSTEM, PATCH_SYSTEM, RIMA_RULES, SCENE_SYSTEM, VARIETY_SYSTEM, arcPrompt, endingPrompt, patchPrompt, scenePrompt, varietyPrompt } from "./prompts";

export const BEAT_STAGES = ["inicio", "problema", "escalada", "decision", "consecuencia", "resolucion", "gancho"] as const;
const Beat = z.object({
  stage: z.enum(BEAT_STAGES), fn: z.enum(SCENE_FUNCTIONS), summary: z.string().min(12).max(280), location: z.string().min(1).max(80),
  characters: z.array(z.string().min(1).max(40)).min(1).max(3), change: z.string().min(12).max(220), why: z.string().min(8).max(200), time: z.string().min(2).max(30), interior: z.boolean(), shot: z.enum(["general", "medio", "primer plano"]), visual: z.string().max(200),
});
/** Momentos de CONDUCTA de KAP: hace algo → provoca algo → tiene que reaccionar. Pocos, naturales y opcionales: no es una plantilla. */
const BEHAVIOR_KINDS = ["impulso", "error", "malentendido", "improvisacion", "cambio-de-opinion", "esconder", "exageracion", "interrupcion", "tonteria", "egoismo-puntual"] as const;
const Behavior = z.object({ beat: z.number().int().min(0).max(11), kind: z.enum(BEHAVIOR_KINDS), does: z.string().min(8).max(200), provokes: z.string().min(8).max(200), reaction: z.string().max(200).optional() });   // reaction = quién reacciona y qué problema queda abierto (acción → consecuencia → reacción → siguiente problema)
/** El arco entero; las comprobaciones de orden/cobertura producen mensajes que el modelo ve al reintentar. */
export const EpisodeArc = z.object({
  title: z.string().min(1).max(100), logline: z.string().min(1).max(260), assumptions: z.array(z.string().max(300)).max(8),
  problem: z.string().min(12).max(300), kapWant: z.string().min(5).max(240), kapChoice: z.string().min(12).max(300), cost: z.string().min(10).max(260), consequence: z.string().min(12).max(300),
  openingRhymeReason: z.string().max(300).optional(), outcome: z.string().min(3).max(120), setting: z.object({ main: z.string().max(80), secondary: z.array(z.string().max(80)).max(3), timeOfDay: z.string().max(40), transitions: z.array(z.string().max(160)).max(3) }), hook: z.string().min(20).max(300),
  extraCharacters: z.array(z.object({ name: z.string().min(1).max(40), why: z.string().max(200) })).max(2), castActions: z.array(z.object({ name: z.string().min(1).max(40), does: z.string().max(200) })).max(4),
  usedFromMemory: z.array(z.string().max(120)).max(6), newCharacters: z.array(z.object({ name: z.string().min(1).max(40), function: z.string().max(200) })).max(2), newPlaces: z.array(z.string().max(80)).max(2),
  behaviorBeats: z.array(Behavior).max(4),   // vacío si la historia no lo pide
  mistake: z.object({ misread: z.string().max(200), actsOn: z.string().max(200), reaction: z.string().max(200), discovery: z.string().max(200), fix: z.string().max(200) }).optional(),   // el error de KAP MUEVE la historia: malinterpreta → actúa → reacción ajena → lo descubre → tiene que arreglarlo
  beats: z.array(Beat).min(8).max(12),
}).superRefine((a, ctx) => {
  // Solo lo estructuralmente imposible rechaza el arco (cada reintento cuesta minutos en CPU). El orden se REPARA en código y el resto
  // (gancho genérico, un solo lugar…) lo señala la revisión narrativa como aviso.
  for (const s of BEAT_STAGES) if (!a.beats.some((b) => b.stage === s)) ctx.addIssue({ code: "custom", message: `beats: falta la etapa «${s}»` });
  const dec = a.beats.find((b) => b.stage === "decision"); if (dec && !dec.characters.some((c) => c.trim().toLowerCase() === "kap")) ctx.addIssue({ code: "custom", message: "beats: la decisión debe tomarla KAP (incluye a KAP en los personajes del beat «decision»)" });
});
export type EpisodeArc = z.infer<typeof EpisodeArc>;

const SceneOut = z.object({
  title: z.string().min(1).max(100),
  lines: z.array(z.object({ speaker: z.string().max(40), text: z.string().min(8).max(500) })).min(3).max(10), change: z.string().min(1).max(260), kapDoes: z.string().max(160), kapState: z.string().max(40),
  directions: z.array(z.string().max(120)).max(5), memory: z.array(z.string().max(300)).max(5),
});
const ACT_OF: Record<(typeof BEAT_STAGES)[number], string> = { inicio: "inicio", problema: "conflicto", escalada: "desarrollo", decision: "emocional", consecuencia: "desarrollo", resolucion: "resolucion", gancho: "gancho" };
const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
const jac = (a: string, b: string) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Topes de regeneración por motivo (el coste total es lo que más pesa en CPU: una escena completa ≈ 5 min, una reparación local ≈ 1 min o menos, una reparación en código = 0). */
export type ArcBudgets = { general: number; rhyme: number; closing: number; voice: number; monologue: number; variety: number; ending: number };
const DEFAULT_BUDGETS: ArcBudgets = { general: 2, rhyme: 2, closing: 1, voice: 1, monologue: 1, variety: 1, ending: 2 };
export type ArcAuthorOptions = { temperature?: number; arcRetries?: number; sceneTokens?: number; budgets?: Partial<ArcBudgets>; /** La primera intervención de KAP lleva una rima breve de contexto: OBLIGATORIA por defecto (true). `false` solo se respeta si el arco declara en `openingRhymeReason` una razón narrativa explícita (≥ 20 caracteres); nunca sirve para esquivar una rima difícil. */ openingRhyme?: boolean };
export type ArcAuthor = ScriptAuthor & { lastDraft?: EpisodeDraft; lastArc?: EpisodeArc; lastReview?: NarrativeFinding[]; lastRealism?: RealismResult; lastGate?: { regenerated: number; dropped: number; localPatches: number; codeRepairs: number; arcRevisions: number; issues: Record<string, number>; rhyme_valid?: boolean } };
const RIMA = /\b(rima|rimas|rimar|rap|rapea|rapear|improvis\w*|verso|versos)\b/i;
const SIBLING_RULES = `\n\nEl hermano pequeño no es un espejo emocional de KAP: tiene acciones, preguntas y decisiones propias de su edad (pide algo concreto, esconde o trae un objeto, desobedece, va a buscar a alguien), con palabras simples.`;
const LinePatch = z.object({ lines: z.array(z.string().min(8).max(500)).min(1).max(8) });
const EndingPatch = z.object({ outcome: z.string().min(3).max(120), consequence: z.string().min(12).max(300), hook: z.string().min(20).max(300), closingSummary: z.string().min(12).max(280), closingChange: z.string().min(12).max(220) });
const VarietyPatch = z.object({ beats: z.array(z.object({ index: z.number().int().min(0).max(20), location: z.string().min(1).max(80), time: z.string().min(2).max(30), interior: z.boolean(), why: z.string().min(8).max(200), summary: z.string().max(280).optional() })).min(1).max(3) });

export function llmArcAuthor(llm: LlmClient, opts: ArcAuthorOptions = {}): ArcAuthor {
  const B: ArcBudgets = { ...DEFAULT_BUDGETS, ...opts.budgets };
  const self: ArcAuthor = {
    id: `llm-arc:${llm.model}`, label: `Redactor por arco (arco → escenas) con ${llm.model}`, free: true, available: () => llm.available(),
    async write({ request, context, signal, hints }) {
      if (!(await llm.available())) throw new Error("El modelo de IA no está disponible");
      const logs: AttemptLog[] = [], usages: (LlmUsage | undefined)[] = []; let calls = 0, droppedDirectives = 0; const warnings: string[] = [], gateIssues: Record<string, number> = {};
      let regenerated = 0, dropped = 0, localPatches = 0, codeRepairs = 0, arcRevisions = 0, endingRevisions = 0, varietyRevisions = 0, rhymeValid: boolean | undefined; const patchKinds: Record<string, number> = {};
      const temp = opts.temperature ?? 0.8, sceneOpts = (extra: number) => ({ system: SCENE_SYSTEM, temperature: temp + extra, maxTokens: opts.sceneTokens ?? 800, signal });
      const count = (kind: string) => { gateIssues[kind] = (gateIssues[kind] ?? 0) + 1; };
      const call = async <T>(schema: z.ZodType<T>, req: { system: string; prompt: string; temperature?: number; maxTokens?: number }, retries = 1) => { const r = await generateJson(llm, schema, { ...req, signal }, { retries }); logs.push(...r.log); usages.push(r.usage); calls += r.attempts; return r; };

      // reparto por defecto: KAP + quien pide la petición + quien salía en el último plano (si continúa «exactamente»)
      const lastCast = request.exact ? (/personajes:\s*(.+)$/.exec(context.sections.find((s) => s.id === "lastshot")?.text ?? "")?.[1] ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [];
      const defaultCast = [...new Set(["KAP", ...request.cast, ...lastCast])];

      // 1) EL ARCO
      const a = await call(EpisodeArc, { system: ARC_SYSTEM, prompt: arcPrompt(context, defaultCast, hints, opts.openingRhyme === false), temperature: temp, maxTokens: 3400 }, opts.arcRetries ?? 2);
      if (!a.ok) throw new Error(`El modelo no devolvió un arco válido tras ${a.attempts} intento(s): ${a.errors.join("; ")} · inicio de la respuesta: ${clip(a.raw ?? "", 500)}`);
      const arc = { ...a.data, beats: a.data.beats.map((b, i) => ({ b, i })).sort((x, y) => BEAT_STAGES.indexOf(x.b.stage) - BEAT_STAGES.indexOf(y.b.stage) || x.i - y.i).map((x) => x.b) };   // orden de etapas reparado en código
      if (arc.beats.some((b, i) => b !== a.data.beats[i])) warnings.push("El modelo desordenó las etapas del arco; se han reordenado.");
      const lastLoc = /\ben ([^;]+);/.exec(context.sections.find((s) => s.id === "lastshot")?.text ?? "")?.[1]?.trim();
      if (request.exact && lastLoc && arc.beats[0].location.toLowerCase() !== lastLoc.toLowerCase()) { warnings.push(`El arco empezaba en «${arc.beats[0].location}»; se corrige a «${lastLoc}» (último plano del episodio anterior).`); arc.beats[0].location = lastLoc; }

      // rima de apertura: obligatoria. Solo se omite si la configuración lo permite (openingRhyme:false) Y el arco declara una razón narrativa explícita.
      const reason = (arc.openingRhymeReason ?? "").trim(), skipOpening = opts.openingRhyme === false && reason.length >= 20;
      if (opts.openingRhyme === false && !skipOpening) warnings.push("openingRhyme:false ignorado: el arco no declara una razón narrativa explícita (openingRhymeReason); la rima de apertura sigue siendo obligatoria.");
      if (skipOpening) warnings.push(`Rima de apertura omitida por razón narrativa del arco: ${clip(reason, 160)}`);

      // 1b) DESENLACE: ¿podría intercambiarse por el de uno de los dos episodios anteriores sin cambiar prácticamente nada? → se revisa SOLO el final del arco (≤ 2 veces)
      const prevEnd = (hints?.previousEpisodes ?? []).map((e) => ({ hook: e.hook, closing: e.ending, outcome: e.outcome })).filter((e) => e.hook || e.closing || e.outcome);
      const candEnding = () => ({ hook: arc.hook, consequence: arc.consequence, closing: arc.beats.at(-1)!.summary, outcome: arc.outcome });
      for (let t = 0; t < B.ending; t++) { const same = endingInterchangeable(candEnding(), prevEnd); if (!same) break;
        count("desenlace-repetido"); const r = await call(EndingPatch, { system: ENDING_SYSTEM, prompt: endingPrompt({ problem: arc.problem, kapChoice: arc.kapChoice, consequence: arc.consequence, outcome: arc.outcome, hook: arc.hook, closing: arc.beats.at(-1)!.summary }, same.reason, prevEnd.map((e) => [e.outcome && `desenlace «${e.outcome}»`, e.hook && `gancho «${e.hook.slice(0, 120)}»`, e.closing && `cierre «${e.closing.slice(0, 140)}»`].filter(Boolean).join("; "))), temperature: temp + 0.1, maxTokens: 700 });
        if (!r.ok) break; arcRevisions++; endingRevisions++; Object.assign(arc, { outcome: r.data.outcome, consequence: r.data.consequence, hook: r.data.hook }); Object.assign(arc.beats.at(-1)!, { summary: r.data.closingSummary, change: r.data.closingChange }); }
      { const left = endingInterchangeable(candEnding(), prevEnd); if (left) warnings.push(`Desenlace parecido al de un episodio anterior: ${left.reason}.`); }
      if (GENERIC_HOOK.test(arc.hook)) warnings.push("El gancho del arco es genérico; revísalo.");

      // 1c) VARIEDAD DE ESPACIO/TIEMPO DEL EPISODIO: solo si todo es plano y el propio arco dice que la historia permite desplazarse; se revisan SOLO los beats afectados, 1 vez
      const vr = episodeVariety(arc.beats, arc.setting);
      if (vr.beatsToMove.length && B.variety > 0) { count("episodio-plano");
        const r = await call(VarietyPatch, { system: VARIETY_SYSTEM, prompt: varietyPrompt({ problem: arc.problem, setting: arc.setting }, vr.beatsToMove.map((i) => ({ index: i, summary: arc.beats[i].summary, location: arc.beats[i].location, time: arc.beats[i].time })), arc.beats.map((b, i) => `${i}: ${clip(b.summary, 70)}`)), temperature: temp + 0.1, maxTokens: 700 });
        if (r.ok) { arcRevisions++; varietyRevisions++; for (const p of r.data.beats) if (vr.beatsToMove.includes(p.index)) Object.assign(arc.beats[p.index], { location: p.location, time: p.time, interior: p.interior, why: p.why, ...(p.summary ? { summary: p.summary } : {}) }); } }
      { const v2 = episodeVariety(arc.beats, arc.setting); if (v2.flat) warnings.push(`Variedad: ${v2.reason}.`); }

      // la memoria NO entra por defecto: solo el reparto pedido, los nuevos declarados y los extras JUSTIFICADOS por el arco
      const permitted = new Set([...defaultCast, ...arc.newCharacters.map((c) => c.name), ...arc.extraCharacters.map((c) => c.name)].map(norm));
      const memoryOutside = context.relevantCharacters.filter((n) => !permitted.has(norm(n)));
      for (const b of arc.beats) { const kept = b.characters.filter((c) => !memoryOutside.some((m) => norm(m) === norm(c))); if (kept.length !== b.characters.length) warnings.push(`El arco incluía a ${b.characters.filter((c) => !kept.includes(c)).join(", ")} en un beat sin justificarlo: se ha quitado (la memoria no obliga a reutilizarlo).`); b.characters = kept.length ? kept : ["KAP"]; }
      self.lastArc = arc;
      // los behaviorBeats apuntan al beat por su posición ORIGINAL: se resuelven por referencia (el orden de etapas puede haberse reparado)
      const behaviorOf = new Map<number, { kind: string; does: string; provokes: string; reaction?: string }>(); for (const bb of a.data.behaviorBeats) { const ref = a.data.beats[bb.beat], idx = ref ? arc.beats.indexOf(ref) : -1; if (idx >= 0 && !behaviorOf.has(idx)) behaviorOf.set(idx, { kind: bb.kind, does: bb.does, provokes: bb.provokes, ...(bb.reaction ? { reaction: bb.reaction } : {}) }); }
      const arcView = { ...arc, behaviorBeats: [...behaviorOf.entries()].map(([i, b]) => ({ beat: i + 1, ...b })), beats: arc.beats.map((b, k) => `${k + 1}. [${b.stage}] ${b.summary}`) };
      const siblingOf = (names: string[]) => names.find((n) => /herman/i.test(n));
      // la escena de la PRIMERA RIMA: el primer beat que habla de rimar/improvisar (o, si la petición lo pide, el de la decisión)
      let rhymeBeat = arc.beats.findIndex((b) => RIMA.test(`${b.summary} ${b.change} ${b.visual}`)); if (rhymeBeat < 0 && RIMA.test(request.notes)) rhymeBeat = arc.beats.findIndex((b) => b.stage === "decision");

      // 2) LAS ESCENAS, una por beat, con puerta de calidad. Regla de coste: lo local se arregla en local (código o una llamada pequeña), no regenerando la escena.
      type Out = z.infer<typeof SceneOut>; type Acc = { beat: (typeof arc.beats)[number]; out: Out; lines: GateLine[]; issues: GateIssue[] };
      const accepted: Acc[] = [], done: { n: number; title: string; location: string; text: string }[] = [], prev: { text: string; change: string; lines: string[]; speakers: string[]; state?: string; does?: string }[] = []; let kapSpoke = false;
      for (let i = 0; i < arc.beats.length; i++) {
        // CAUSALIDAD: la escena hereda lo que cambió en la anterior (y lo que la conducta de KAP dejó abierto): no empieza con un problema recién inventado
        const last = prev.at(-1), pb = behaviorOf.get(i - 1), pending = pb ? [pb.provokes, pb.reaction].filter(Boolean).join(" → ") : undefined;
        const inherit = last ? { cambio: last.change, kapHizo: last.does || undefined, ...(pending ? { quedaAbierto: pending } : {}) } : undefined;
        const beat = arc.beats[i], brief = { stage: beat.stage, fn: beat.fn, summary: beat.summary, change: beat.change, why: beat.why, location: beat.location, characters: beat.characters, time: beat.time, interior: beat.interior, shot: beat.shot, visual: beat.visual, ...(beat.stage === "consecuencia" ? { costeQueSeDebeVer: arc.cost } : {}), ...(behaviorOf.get(i) ? { comportamientoDeKAP: behaviorOf.get(i) } : {}), ...(inherit ? { heredaDeLaEscenaAnterior: inherit } : {}) };
        const sibling = siblingOf(beat.characters), hasKap = beat.characters.some((c) => norm(c) === "kap");
        const mode = i === rhymeBeat ? "first-rhyme" as const : !kapSpoke && hasKap && !skipOpening ? "opening" as const : undefined;
        const contextTerms = [beat.summary, beat.change, beat.visual, beat.location, ...beat.characters, request.notes, i === rhymeBeat ? arc.problem : ""], base = `${mode ? RIMA_RULES : ""}${sibling ? SIBLING_RULES : ""}`;
        const check = (lines: GateLine[], change: string, decl?: { kapDoes: string; kapState: string }) => checkScene({ kapDoes: decl?.kapDoes, kapState: decl?.kapState, scene: { lines, change }, previous: prev, speakers: beat.characters, memoryOutside, siblingName: sibling, rhyme: mode ? { mode, contextTerms } : undefined, isLast: i === arc.beats.length - 1, cost: beat.stage === "consecuencia" ? arc.cost : undefined, pending, locationChanged: !!accepted.length && norm(accepted.at(-1)!.beat.location) !== norm(beat.location) });
        const gen = async (extra: string, n: number) => call(SceneOut, { ...sceneOpts(n * 0.05), prompt: scenePrompt(context, arcView, done, i, arc.beats.length, brief, base + extra) });
        // (a) generar; (b) reparar EN CÓDIGO lo que se pueda; (c) solo si queda un problema de toda la escena, regenerarla (máx. B.general veces, con TODAS las razones agrupadas)
        let best: Acc | undefined, regens = 0, res = await gen("", 0);
        for (;;) {
          if (!res.ok) { if (best) break; throw new Error(`El modelo no devolvió la escena ${i + 1} válida tras ${res.attempts} intento(s): ${res.errors.join("; ")}`); }
          let lines: GateLine[] = res.data.lines.map((l) => ({ speaker: l.speaker, text: l.text })), issues = check(lines, res.data.change, res.data);
          for (const x of issues) count(x.kind);   // se cuentan los detectados (aunque luego se reparen en código)
          const rep = repairLines(lines, issues); if (rep.repaired.length) { codeRepairs++; lines = rep.lines; issues = check(lines, res.data.change, res.data); }
          const cand: Acc = { beat, out: res.data, lines, issues }, score = (x: Acc) => [x.issues.filter((k) => k.scope === "scene" || k.scope === "repair").length, x.issues.filter((k) => k.scope === "local").length];
          if (!best || score(cand)[0] < score(best)[0] || (score(cand)[0] === score(best)[0] && score(cand)[1] < score(best)[1])) best = cand;
          const heavy = issues.filter((k) => k.scope === "scene" || k.scope === "repair"), cap = heavy.every((k) => k.kind === "monologo-relleno") ? B.monologue : B.general;
          if (!heavy.length || regens >= cap) break;
          regens++; regenerated++; res = await gen(gateFeedback(issues), regens);
        }
        const keep = best!, essential = i === 0 || i === arc.beats.length - 1 || arc.beats.filter((x) => x.stage === beat.stage).length === 1;
        if (isBlocking(keep.issues) && needsSceneRegen(keep.issues) && !essential) { dropped++; warnings.push(`Escena del beat ${i + 1} («${clip(beat.summary, 60)}») eliminada: ${keep.issues.filter((x) => x.blocking).map((x) => x.text).join(" ")}`); continue; }
        // (d) reparaciones LOCALES (rima, voz, hermano, mención, cierre): una sola llamada pequeña por ronda con TODAS las líneas afectadas; cada motivo con su tope
        const used: Record<string, number> = { rima: 0, cierre: 0, voz: 0, causa: 0 }, lines = keep.lines, budget = (k: GateIssueKind) => (k === "rima-invalida" ? ["rima", B.rhyme] as const : k === "cierre-reflexivo" || k === "cierre-desconectado" ? ["cierre", B.closing] as const : k === "sin-antecedente" ? ["causa", B.voice] as const : ["voz", B.voice] as const);
        let issues = keep.issues;
        for (let round = 0; round < Math.max(B.rhyme, B.closing, B.voice); round++) {
          const targets = new Map<number, string[]>(), kinds: GateIssueKind[] = [];
          for (const x of issues.filter((k) => k.scope === "local" && k.lines?.length)) { const [key, cap] = budget(x.kind); if (used[key] >= cap) continue; kinds.push(x.kind); x.lines!.forEach((l) => targets.set(l, [...(targets.get(l) ?? []), x.text])); }
          if (!targets.size) break;
          const idx = [...targets.keys()].sort((p, q) => p - q), withRhyme = kinds.includes("rima-invalida");
          const r = await call(LinePatch, { system: PATCH_SYSTEM, prompt: patchPrompt({ location: beat.location, summary: beat.summary, change: keep.out.change || beat.change, characters: beat.characters }, lines, idx.map((index) => ({ index, reason: targets.get(index)!.join(" ") })), contextTerms.filter(Boolean), withRhyme ? RIMA_RULES : ""), temperature: temp + 0.1, maxTokens: 500 });
          localPatches++; for (const k of new Set(kinds)) patchKinds[k] = (patchKinds[k] ?? 0) + 1; if (!r.ok || r.data.lines.length !== idx.length) { for (const k of new Set(kinds)) used[budget(k)[0]]++; continue; }   // un parche fallido gasta presupuesto y se reintenta (no se abandona la reparación con el defecto sin tocar)
          idx.forEach((index, k) => { lines[index] = { ...lines[index], text: r.data.lines[k].trim() }; }); for (const k of new Set(kinds)) used[budget(k)[0]]++;
          issues = check(lines, keep.out.change, keep.out);
        }
        for (const x of issues) warnings.push(`Escena ${accepted.length + 1}: ${x.text}`);
        if (mode) { const rv = sceneRhyme(lines, { mode, contextTerms }).check.rhyme_valid; if (mode === "first-rhyme" || rhymeValid === undefined) rhymeValid = rv; }
        if (lines.some((l) => norm(l.speaker ?? "") === "kap")) kapSpoke = true;
        accepted.push({ ...keep, lines, issues }); const text = lines.map((l) => l.text).join(" ");
        done.push({ n: accepted.length, title: keep.out.title, location: beat.location, text: `${clip(text, 240)} · KAP: ${keep.out.kapDoes || "—"} (${keep.out.kapState || "—"}) · cambió: ${clip(keep.out.change, 120)}` }); prev.push({ text, change: keep.out.change, lines: lines.map((l) => l.text), speakers: lines.map((l) => l.speaker ?? ""), state: keep.out.kapState, does: keep.out.kapDoes });
      }

      // 3) MEMORIA: actos y gancho los fija el código sobre las escenas FINALES; lo del modelo solo pasa si es una directiva válida
      const actSeen = new Set<string>(), introduced = new Set<string>(), knownNames = new Set(context.relevantCharacters.map((n) => n.toLowerCase()).concat("kap"));
      const scenes: EpisodeDraft["scenes"] = accepted.map(({ beat, out, lines }, idx) => {
        const memory: string[] = [], act = ACT_OF[beat.stage]; if (!actSeen.has(act)) { actSeen.add(act); memory.push(`acto: ${act} | ${clip(beat.summary, 140)}`); }
        if (idx === accepted.length - 1) memory.push(`gancho: ${clip(arc.hook, 240)}`);
        for (const raw of out.memory.map((m) => m.replace(/^\[|\]$/g, "").trim()).filter(Boolean)) {
          const key = raw.split(":")[0].trim().toLowerCase(); if (key === "acto" || key === "gancho") continue;
          if (!isMemoryKey(key) || parseMemoryDirectives([raw]).errors.length) { droppedDirectives++; warnings.push(`Directiva de memoria del modelo descartada: «${clip(raw, 90)}»`); continue; }
          memory.push(raw);
        }
        for (const l of lines) { const sp = (l.speaker ?? "").trim(); if (sp && !knownNames.has(sp.toLowerCase()) && !introduced.has(sp.toLowerCase())) { introduced.add(sp.toLowerCase()); if (arc.newCharacters.some((c) => c.name.toLowerCase() === sp.toLowerCase())) memory.push(`conoce: KAP, ${sp}`); } }
        const shot = beat.shot === "general" ? "plano: general" : `plano: ${beat.shot === "primer plano" ? "primer plano" : "medio"} ${beat.characters[0]}`;
        const directions = [shot, ...out.directions.filter((d) => !!parseDirection(d).beat && !/^\s*plano\s*:/i.test(d))];
        return { title: out.title, location: beat.location, lines: lines.map((l) => ({ speaker: l.speaker ?? "", text: l.text })), memory, fn: beat.fn, stage: beat.stage, shot: beat.shot, time: beat.time, interior: beat.interior, directions, change: out.change };
      });
      const draft: EpisodeDraft = { title: arc.title, logline: arc.logline, assumptions: arc.assumptions, scenes };
      const parsedDraft = EpisodeDraft.safeParse(draft); if (!parsedDraft.success) throw new Error(`El borrador resultante no es válido: ${parsedDraft.error.issues[0]?.message}`);
      self.lastDraft = parsedDraft.data;
      const ir = ScreenplayIR.safeParse(draftToIR(parsedDraft.data)); if (!ir.success) throw new Error(`La IR resultante no es válida: ${ir.error.issues[0]?.message}`);
      const secs = draftSeconds(parsedDraft.data);
      if (secs < 240) warnings.push(`Episodio corto (≈ ${(secs / 60).toFixed(1)} min): no se ha rellenado; la duración sale de la historia. Revisa si el arco necesita más desarrollo.`);
      // revisión narrativa: avisa, no bloquea
      const review = reviewNarrative({ scenes: scenes.map((s) => ({ location: s.location, title: s.title, lines: s.lines.map((l) => ({ speaker: l.speaker, text: l.text })), fn: s.fn, stage: s.stage, shot: s.shot, time: s.time, interior: s.interior })), hook: arc.hook, knownCharacters: context.relevantCharacters, allowedCharacters: [...permitted].map((n) => defaultCast.concat(arc.newCharacters.map((c) => c.name), arc.extraCharacters.map((c) => c.name)).find((x) => norm(x) === n) ?? n), previousEpisodes: hints?.previousEpisodes, acts: [...actSeen] });
      const idxOf = (sc: (typeof scenes)[number]) => scenes.indexOf(sc);
      const realism = kapRealismCheck({ scenes: scenes.map((s) => ({ location: s.location, title: s.title, lines: s.lines.map((l) => ({ speaker: l.speaker, text: l.text })), fn: s.fn, stage: s.stage, kapDoes: accepted[idxOf(s)]?.out.kapDoes, kapState: accepted[idxOf(s)]?.out.kapState, change: accepted[idxOf(s)]?.out.change })), contextTerms: [request.notes, scenes[0]?.location ?? "", scenes.slice(0, 2).flatMap((s) => s.lines.map((l) => l.text)).join(" ")] });
      self.lastRealism = realism; for (const c of realism.checks.filter((x) => !x.ok)) warnings.push(`KAP_REALISM_CHECK · ${c.id}${c.note ? `: ${c.note}` : ""}`);
      self.lastReview = review; self.lastGate = { regenerated, dropped, localPatches, codeRepairs, arcRevisions, issues: gateIssues, rhyme_valid: rhymeValid }; for (const f of review) warnings.push(`Narrativa (${f.severity}) · ${f.rule.replace("narrativa-", "")}: ${f.text}`);
      const stats: AuthorStats = { attempts: calls, retries: Math.max(0, calls - (1 + arc.beats.length)), jsonErrors: logs.filter((l) => l.kind === "json").length, schemaErrors: logs.filter((l) => l.kind === "schema").length, lengthRetries: 0, memoryDirectiveErrors: droppedDirectives, usage: sumUsage(usages), estimatedSec: secs, scenesRegenerated: regenerated, scenesDropped: dropped, gateIssues, localPatches, codeRepairs, arcRevisions, rhymeValid, patchKinds, endingRevisions, varietyRevisions, realism: { passed: realism.passed, total: realism.total, failed: realism.failed } };
      return { script: irToScript(ir.data), warnings, ir: ir.data, stats };
    },
  };
  return self;
}
