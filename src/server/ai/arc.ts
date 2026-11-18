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
import { checkScene, gateFeedback, isBlocking, type GateIssue } from "@/narrative/gate";
import { EpisodeDraft, draftSeconds, draftToIR, irToScript } from "./episode";
import { generateJson, sumUsage, type AttemptLog } from "./json";
import { ARC_SYSTEM, SCENE_SYSTEM, arcPrompt, scenePrompt } from "./prompts";

export const BEAT_STAGES = ["inicio", "problema", "escalada", "decision", "consecuencia", "resolucion", "gancho"] as const;
export const OUTCOMES = ["victoria-parcial", "derrota", "sin-solucion", "amargo", "ambiguo"] as const;
const Beat = z.object({
  stage: z.enum(BEAT_STAGES), fn: z.enum(SCENE_FUNCTIONS), summary: z.string().min(12).max(280), location: z.string().min(1).max(80),
  characters: z.array(z.string().min(1).max(40)).min(1).max(3), change: z.string().min(12).max(220), why: z.string().min(8).max(200), time: z.string().min(2).max(30), interior: z.boolean(), shot: z.enum(["general", "medio", "primer plano"]), visual: z.string().max(200),
});
/** El arco entero; las comprobaciones de orden/cobertura producen mensajes que el modelo ve al reintentar. */
export const EpisodeArc = z.object({
  title: z.string().min(1).max(100), logline: z.string().min(1).max(260), assumptions: z.array(z.string().max(300)).max(8),
  problem: z.string().min(12).max(300), kapWant: z.string().min(5).max(240), kapChoice: z.string().min(12).max(300), consequence: z.string().min(12).max(300),
  outcome: z.enum(OUTCOMES), hook: z.string().min(20).max(300),
  extraCharacters: z.array(z.object({ name: z.string().min(1).max(40), why: z.string().max(200) })).max(2), castActions: z.array(z.object({ name: z.string().min(1).max(40), does: z.string().max(200) })).max(4),
  usedFromMemory: z.array(z.string().max(120)).max(6), newCharacters: z.array(z.object({ name: z.string().min(1).max(40), function: z.string().max(200) })).max(2), newPlaces: z.array(z.string().max(80)).max(2),
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
  lines: z.array(z.object({ speaker: z.string().max(40), text: z.string().min(1).max(500) })).min(3).max(10), change: z.string().min(1).max(260),
  directions: z.array(z.string().max(120)).max(5), memory: z.array(z.string().max(300)).max(5),
});
const ACT_OF: Record<(typeof BEAT_STAGES)[number], string> = { inicio: "inicio", problema: "conflicto", escalada: "desarrollo", decision: "emocional", consecuencia: "desarrollo", resolucion: "resolucion", gancho: "gancho" };
const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
const jac = (a: string, b: string) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type ArcAuthorOptions = { temperature?: number; arcRetries?: number; sceneTokens?: number; /** Tope de intentos por escena en la puerta de calidad (por defecto 3 si hay un fallo bloqueante, 2 si solo hay avisos). */ maxSceneAttempts?: number };
export type ArcAuthor = ScriptAuthor & { lastDraft?: EpisodeDraft; lastArc?: EpisodeArc; lastReview?: NarrativeFinding[]; lastGate?: { regenerated: number; dropped: number; issues: Record<string, number> } };
const RIMA = /\b(rima|rimas|rimar|rap|rapea|improvis\w*|verso|versos)\b/i;
const RIMA_RULES = `\n\nRIMA (primera vez que KAP improvisa): nace de lo que ve y vive en ESTE momento, nombrando cosas concretas de la escena (la ropa, el zapato roto, quien se burla, el sitio). 2-4 versos que rimen de verdad, un poco torpes o a trompicones, como los de un niño bajo presión. Prohibido el discurso genérico sobre «mi música», «mi sueño», «mi voz» o «no me rendiré».`;
const SIBLING_RULES = `\n\nEl hermano pequeño no es un espejo emocional de KAP: tiene acciones, preguntas y decisiones propias de su edad (pide algo concreto, esconde o trae un objeto, desobedece, va a buscar a alguien), con palabras simples.`;

export function llmArcAuthor(llm: LlmClient, opts: ArcAuthorOptions = {}): ArcAuthor {
  const self: ArcAuthor = {
    id: `llm-arc:${llm.model}`, label: `Redactor por arco (arco → escenas) con ${llm.model}`, free: true, available: () => llm.available(),
    async write({ request, context, signal, hints }) {
      if (!(await llm.available())) throw new Error("El modelo de IA no está disponible");
      const logs: AttemptLog[] = [], usages: (LlmUsage | undefined)[] = []; let calls = 0, droppedDirectives = 0; const warnings: string[] = [], gateIssues: Record<string, number> = {}; let regenerated = 0, dropped = 0;
      const sceneOpts = (extra: number) => ({ system: SCENE_SYSTEM, temperature: (opts.temperature ?? 0.8) + extra, maxTokens: opts.sceneTokens ?? 800, signal });

      // reparto por defecto: KAP + quien pide la petición + quien salía en el último plano (si continúa «exactamente»)
      const lastCast = request.exact ? (/personajes:\s*(.+)$/.exec(context.sections.find((s) => s.id === "lastshot")?.text ?? "")?.[1] ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [];
      const defaultCast = [...new Set(["KAP", ...request.cast, ...lastCast])];

      // 1) EL ARCO
      const a = await generateJson(llm, EpisodeArc, { system: ARC_SYSTEM, prompt: arcPrompt(context, defaultCast, hints), temperature: opts.temperature ?? 0.8, maxTokens: 3200, signal }, { retries: opts.arcRetries ?? 2 });
      logs.push(...a.log); usages.push(a.usage); calls += a.attempts;
      if (!a.ok) throw new Error(`El modelo no devolvió un arco válido tras ${a.attempts} intento(s): ${a.errors.join("; ")} · inicio de la respuesta: ${clip(a.raw ?? "", 500)}`);
      const arc = { ...a.data, beats: a.data.beats.map((b, i) => ({ b, i })).sort((x, y) => BEAT_STAGES.indexOf(x.b.stage) - BEAT_STAGES.indexOf(y.b.stage) || x.i - y.i).map((x) => x.b) };   // orden de etapas reparado en código
      if (arc.beats.some((b, i) => b !== a.data.beats[i])) warnings.push("El modelo desordenó las etapas del arco; se han reordenado.");
      if (GENERIC_HOOK.test(arc.hook)) warnings.push("El gancho del arco es genérico; revísalo.");
      const lastLoc = /\ben ([^;]+);/.exec(context.sections.find((s) => s.id === "lastshot")?.text ?? "")?.[1]?.trim();
      if (request.exact && lastLoc && arc.beats[0].location.toLowerCase() !== lastLoc.toLowerCase()) { warnings.push(`El arco empezaba en «${arc.beats[0].location}»; se corrige a «${lastLoc}» (último plano del episodio anterior).`); arc.beats[0].location = lastLoc; }

      // la memoria NO entra por defecto: solo el reparto pedido, los nuevos declarados y los extras JUSTIFICADOS por el arco
      const permitted = new Set([...defaultCast, ...arc.newCharacters.map((c) => c.name), ...arc.extraCharacters.map((c) => c.name)].map(norm));
      const memoryOutside = context.relevantCharacters.filter((n) => !permitted.has(norm(n)));
      for (const b of arc.beats) { const kept = b.characters.filter((c) => !memoryOutside.some((m) => norm(m) === norm(c))); if (kept.length !== b.characters.length) warnings.push(`El arco incluía a ${b.characters.filter((c) => !kept.includes(c)).join(", ")} en un beat sin justificarlo: se ha quitado (la memoria no obliga a reutilizarlo).`); b.characters = kept.length ? kept : ["KAP"]; }
      self.lastArc = arc;
      const arcView = { ...arc, beats: arc.beats.map((b, k) => `${k + 1}. [${b.stage}] ${b.summary}`) };
      const siblingOf = (names: string[]) => names.find((n) => /herman/i.test(n));

      // 2) LAS ESCENAS, una por beat, con puerta de calidad: ¿qué ha cambiado al terminar esta escena?
      type Acc = { beat: (typeof arc.beats)[number]; out: z.infer<typeof SceneOut>; issues: GateIssue[] };
      const accepted: Acc[] = [], done: { n: number; title: string; location: string; text: string }[] = [], prev: { text: string; change: string; lines: string[] }[] = [];
      for (let i = 0; i < arc.beats.length; i++) {
        const beat = arc.beats[i], brief = { stage: beat.stage, fn: beat.fn, summary: beat.summary, change: beat.change, why: beat.why, location: beat.location, characters: beat.characters, time: beat.time, interior: beat.interior, shot: beat.shot, visual: beat.visual };
        const sibling = siblingOf(beat.characters), base = `${RIMA.test(`${beat.summary} ${arc.kapChoice} ${request.notes}`) ? RIMA_RULES : ""}${sibling ? SIBLING_RULES : ""}`;
        let best: Acc | undefined, extra = base, attempt = 0, max = opts.maxSceneAttempts ?? 3;
        for (;;) {
          const res = await generateJson(llm, SceneOut, { ...sceneOpts(attempt * 0.05), prompt: scenePrompt(context, arcView, done, i, arc.beats.length, brief, extra) }, { retries: 1 });
          logs.push(...res.log); usages.push(res.usage); calls += res.attempts;
          if (!res.ok) { if (best) break; throw new Error(`El modelo no devolvió la escena ${i + 1} válida tras ${res.attempts} intento(s): ${res.errors.join("; ")}`); }
          const issues = checkScene({ scene: { lines: res.data.lines, change: res.data.change }, previous: prev, speakers: beat.characters, memoryOutside, siblingName: sibling });
          for (const x of issues) gateIssues[x.kind] = (gateIssues[x.kind] ?? 0) + 1;
          const cand: Acc = { beat, out: res.data, issues }; if (!best || issues.filter((x) => x.blocking).length < best.issues.filter((x) => x.blocking).length || (issues.filter((x) => x.blocking).length === best.issues.filter((x) => x.blocking).length && issues.length < best.issues.length)) best = cand;
          attempt++; if (!issues.length) break;
          const limit = isBlocking(best.issues) ? max : Math.min(2, max); if (attempt >= limit) break;
          regenerated++; extra = base + gateFeedback(issues);
        }
        const keep = best!, essential = i === 0 || i === arc.beats.length - 1 || arc.beats.filter((x) => x.stage === beat.stage).length === 1;
        if (isBlocking(keep.issues) && !essential) { dropped++; warnings.push(`Escena del beat ${i + 1} («${clip(beat.summary, 60)}») eliminada: ${keep.issues.filter((x) => x.blocking).map((x) => x.text).join(" ")}`); continue; }
        for (const x of keep.issues) warnings.push(`Escena ${accepted.length + 1}: ${x.text}`);
        accepted.push(keep); const text = keep.out.lines.map((l) => l.text).join(" ");
        done.push({ n: accepted.length, title: keep.out.title, location: beat.location, text: clip(text, 260) }); prev.push({ text, change: keep.out.change, lines: keep.out.lines.map((l) => l.text) });
      }

      // 3) MEMORIA: actos y gancho los fija el código sobre las escenas FINALES; lo del modelo solo pasa si es una directiva válida
      const actSeen = new Set<string>(), introduced = new Set<string>(), knownNames = new Set(context.relevantCharacters.map((n) => n.toLowerCase()).concat("kap"));
      const scenes: EpisodeDraft["scenes"] = accepted.map(({ beat, out }, idx) => {
        const memory: string[] = [], act = ACT_OF[beat.stage]; if (!actSeen.has(act)) { actSeen.add(act); memory.push(`acto: ${act} | ${clip(beat.summary, 140)}`); }
        if (idx === accepted.length - 1) memory.push(`gancho: ${clip(arc.hook, 240)}`);
        for (const raw of out.memory.map((m) => m.replace(/^\[|\]$/g, "").trim()).filter(Boolean)) {
          const key = raw.split(":")[0].trim().toLowerCase(); if (key === "acto" || key === "gancho") continue;
          if (!isMemoryKey(key) || parseMemoryDirectives([raw]).errors.length) { droppedDirectives++; warnings.push(`Directiva de memoria del modelo descartada: «${clip(raw, 90)}»`); continue; }
          memory.push(raw);
        }
        for (const l of out.lines) { const sp = l.speaker.trim(); if (sp && !knownNames.has(sp.toLowerCase()) && !introduced.has(sp.toLowerCase())) { introduced.add(sp.toLowerCase()); if (arc.newCharacters.some((c) => c.name.toLowerCase() === sp.toLowerCase())) memory.push(`conoce: KAP, ${sp}`); } }
        const shot = beat.shot === "general" ? "plano: general" : `plano: ${beat.shot === "primer plano" ? "primer plano" : "medio"} ${beat.characters[0]}`;
        const directions = [shot, ...out.directions.filter((d) => !!parseDirection(d).beat && !/^\s*plano\s*:/i.test(d))];
        return { title: out.title, location: beat.location, lines: out.lines, memory, fn: beat.fn, stage: beat.stage, shot: beat.shot, time: beat.time, interior: beat.interior, directions, change: out.change };
      });
      const draft: EpisodeDraft = { title: arc.title, logline: arc.logline, assumptions: arc.assumptions, scenes };
      const parsedDraft = EpisodeDraft.safeParse(draft); if (!parsedDraft.success) throw new Error(`El borrador resultante no es válido: ${parsedDraft.error.issues[0]?.message}`);
      self.lastDraft = parsedDraft.data;
      const ir = ScreenplayIR.safeParse(draftToIR(parsedDraft.data)); if (!ir.success) throw new Error(`La IR resultante no es válida: ${ir.error.issues[0]?.message}`);
      const secs = draftSeconds(parsedDraft.data);
      if (secs < 240) warnings.push(`Episodio corto (≈ ${(secs / 60).toFixed(1)} min): no se ha rellenado; la duración sale de la historia. Revisa si el arco necesita más desarrollo.`);
      // revisión narrativa: avisa, no bloquea
      const review = reviewNarrative({ scenes: scenes.map((s) => ({ location: s.location, title: s.title, lines: s.lines.map((l) => ({ speaker: l.speaker, text: l.text })), fn: s.fn, stage: s.stage, shot: s.shot, time: s.time, interior: s.interior })), hook: arc.hook, knownCharacters: context.relevantCharacters, allowedCharacters: [...permitted].map((n) => defaultCast.concat(arc.newCharacters.map((c) => c.name), arc.extraCharacters.map((c) => c.name)).find((x) => norm(x) === n) ?? n), previousEpisodes: hints?.previousEpisodes, acts: [...actSeen] });
      self.lastReview = review; self.lastGate = { regenerated, dropped, issues: gateIssues }; for (const f of review) warnings.push(`Narrativa (${f.severity}) · ${f.rule.replace("narrativa-", "")}: ${f.text}`);
      const stats: AuthorStats = { attempts: calls, retries: Math.max(0, calls - (1 + arc.beats.length)), jsonErrors: logs.filter((l) => l.kind === "json").length, schemaErrors: logs.filter((l) => l.kind === "schema").length, lengthRetries: 0, memoryDirectiveErrors: droppedDirectives, usage: sumUsage(usages), estimatedSec: secs, scenesRegenerated: regenerated, scenesDropped: dropped, gateIssues };
      return { script: irToScript(ir.data), warnings, ir: ir.data, stats };
    },
  };
  return self;
}
