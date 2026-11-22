/**
 * SHORT MODE (módulo puro, sin IA): planificación y revisión de un SHORT animado de KAP (vertical, 45-75 s, ideal 50-65) pensado desde el principio para
 * RETENCIÓN > CLARIDAD > ACCIÓN VISUAL > RITMO > HUMOR/REMATE > DIÁLOGO > EXPLICACIÓN. No es un episodio comprimido: es una cadena de 8-15 BEATS cortos y
 * activos (objetivo, acción visible, reacción, cambio, duración, plano, sonido, música y, solo si aporta, diálogo).
 * Aquí viven: el tipo del beat, SHORT_RETENTION_CHECK (12 comprobaciones sin llamar al modelo), las reparaciones en código y la conversión beats → borrador de guion.
 */
import { actionDuration, hasAction } from "./action.ts";
import { normalizeLine } from "./lines.ts";

export const PHASES = ["hook", "contexto", "escalada", "giro", "remate"] as const;
export type Phase = (typeof PHASES)[number];
export const SHOTS = ["general", "medio", "primer plano", "objeto", "seguimiento"] as const;
export const SHORT_SOUNDS = ["none", "door", "bump", "knock", "ring", "steps", "ambience"] as const;
export const SHORT_MUSIC = ["none", "start", "change", "stop", "impact", "silence"] as const;
export type ShortBeat = {
  phase: Phase; step: (typeof STEPS)[number]; goal: string; action: string; reaction: string; change: string; seconds: number; shot: (typeof SHOTS)[number];
  characters: string[]; location: string; time: string; sound?: (typeof SHORT_SOUNDS)[number]; music?: (typeof SHORT_MUSIC)[number]; dialogue?: { speaker: string; text: string };
};
/** Contrato narrativo del Short: cada paso se ve en acciones (no «está triste»). */
export const STEPS = ["situacion", "intento", "fallo", "reaccion", "segundo-intento", "descubrimiento", "cambio", "remate"] as const;
export const SHORT_MIN = 45, SHORT_MAX = 75, SHORT_IDEAL: [number, number] = [50, 65];

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["para", "pero", "como", "esta", "este", "esto", "that", "unos", "unas", "sobre", "hacia", "desde", "entre", "cuando", "donde", "porque", "tambien", "mientras", "ahora", "todo", "toda", "solo"]);
const stems = (s: string) => new Set(plain(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 5)));
const jac = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
/** ¿Hay acción VISIBLE? El vocabulario de animación (hasAction) es estrecho; aquí se añade un repertorio amplio de verbos de acción (por raíz) y se descartan las frases de pura espera/descripción. */
const VISIBLE = /\b(?:constru\w*|apil\w*|coloc\w*|copi\w*|equilibr\w*|encaj\w*|ajust\w*|arregl\w*|recog\w*|repit\w*|vuelve a|cambi\w*|prob\w*|corrig\w*|rehac\w*|aband\w*|derrumb\w*|deshac\w*|dibuj\w*|escrib\w*|borr\w*|termin\w*|consigu\w*|levant\w*|sec[ao]\w*|llev\w*|tir[ao]\w*|met[eé]\w*|cierr\w*|abr[eio]\w*|sac[ao]\w*|cog[eio]\w*|peg[ao]\w*|dej[ao]\w*|corr[eio]\w*|sient\w*|pon[eg]\w*|empuj\w*|lanz\w*|escond\w*|cae\w*|caen|romp\w*|enciend\w*|apag\w*|sal[eg]\w*|entr[ao]\w*|lleg\w*|grit\w*|senal\w*|se[ñn]al\w*|apriet\w*|guard\w*|hu[yí]\w*|agarr\w*|arrastr\w*|golpe\w*|chasc\w*|salt\w*|trep\w*|baj[ao]\w*|sub[eií]\w*|toc[ao]\w*|prueb\w*|intent\w*|limpi\w*|tap[ao]\w*|desliz\w*|tropiez\w*|persigu\w*|entreg\w*|devuelv\w*|cuelg\w*|bail\w*|cant[ao]\w*|gira\w*|chisp\w*|chisporrote\w*|descubr\w*|derram\w*|mancha\w*|empap\w*|saca\w*|usa\w*|compra\w*|vende\w*|prepara\w*|cocina\w*|tropez\w*|explot\w*|suena\w*|suenan|vibra\w*|parpade\w*|se (?:levanta|sienta|agacha|esconde|acerca|aleja)\w*)\b/;
const STATIC = /\b(?:se queda (?:quiet|mirando|inm[oó]vil)|mira al vac[ií]o|respira\w*|asiente\w*|piensa\w*|recuerda\w*|reflexiona\w*|medita\w*|el tiempo pasa|no hace nada)\b/;
const visible = (t: string) => plain(t).split(/[.;]/).some((c) => !STATIC.test(c) && (hasAction(c) || VISIBLE.test(c)));   // por frase: «respira hondo» no anula «recoge las latas»
/** Verbos puramente emocionales o pasivos: por sí solos no son una acción que cambie la situación (mirar, sonreír, abrazar, suspirar, estar triste…). */
const EMOTIVE = /\b(?:sonr\w*|abraz\w*|mira\w*|observa\w*|suspira\w*|llora\w*|piensa\w*|recuerda\w*|consuela\w*|acaricia\w*|asiente\w*|admira\w*|se siente|triste\w*|frustrad\w*|tranquil\w*|devuelve la sonrisa|se queda)\b/;
/** ¿Hay una acción CONCRETA (no solo emocional) en el texto? Se mira cláusula a cláusula: «KAP sonríe y abraza» no cuenta; «KAP apila los bloques» sí. */
const doing = (t: string) => plain(t).split(/[.;,]|\by\b|\bluego\b|\by despues\b/).some((c) => VISIBLE.test(c) && !EMOTIVE.test(c));
const body = (b: ShortBeat) => `${b.action} ${b.reaction}`;
/** Frases de moraleja / cierre de lección (nunca como final de un Short). */
export const MORAL = /\b(?:aprendi[oó]|aprend[ií]\w*|desde (?:ese|aquel|aquella) (?:d[ií]a|momento)|lo importante es|todo pasa por algo|la lecci[oó]n|moraleja|nunca (?:te )?rind\w+|al final (?:lo )?(?:entend|comprend)\w+|hoy (?:entend|comprend|aprend)\w+|de (?:esa|aquella) experiencia)\b/i;

export const shortSeconds = (beats: ShortBeat[]) => Math.round(beats.reduce((n, b) => n + b.seconds, 0) * 10) / 10;
const similar = (a: ShortBeat, b: ShortBeat) => plain(a.location) === plain(b.location) && [...new Set(a.characters.map(plain))].sort().join("|") === [...new Set(b.characters.map(plain))].sort().join("|") && jac(stems(body(a)), stems(body(b))) >= 0.5;
const idle = (b: ShortBeat) => !visible(body(b)) && !b.dialogue;

export type RetentionId = "hook-claro" | "problema-rapido" | "accion-antes-de-explicar" | "cambia-varias-veces" | "escalada" | "giro" | "remate" | "sin-repetidos" | "nada-eliminable" | "sin-tramos-solo-dialogo" | "no-predecible" | "duracion-justa";
export type RetentionCheck = { id: RetentionId; ok: boolean; note?: string; /** reparación local posible (en código) */ fix?: "merge" | "drop" | "patch" | "rewrite"; beats?: number[] };
export type RetentionResult = { checks: RetentionCheck[]; failed: RetentionId[]; passed: number; total: number; seconds: number };

/** SHORT_RETENTION_CHECK: las 12 preguntas de retención, sin llamar al modelo. Las que se pueden arreglar en código indican cómo (`fix`). */
export function shortRetentionCheck(beats: ShortBeat[], o: { renderSeconds?: number } = {}): RetentionResult {
  const checks: RetentionCheck[] = [], add = (c: RetentionCheck) => checks.push(c), secs = o.renderSeconds ?? shortSeconds(beats), n = beats.length;   // con `renderSeconds` se mide lo que durará el render real (por el contenido), no los segundos que declara el modelo
  const starts: number[] = []; { let t = 0; for (const b of beats) { starts.push(t); t += b.seconds; } }
  // 1) hook claro: algo ocurre YA (acción visible, no diálogo ni descripción) y es corto
  const h = beats[0], hookOk = !!h && visible(body(h)) && h.seconds <= 4.5 && (h.dialogue ? h.dialogue.text.split(/\s+/).length <= 8 : true);
  add({ id: "hook-claro", ok: hookOk, ...(hookOk ? {} : { note: "el primer beat no tiene una acción visible inmediata (o es largo / empieza hablando)", fix: "patch" as const, beats: [0] }) });
  // 2) el problema aparece rápido: antes de los 8 s ya hay un beat de contexto/escalada
  const early = beats.findIndex((b, i) => starts[i] > 0 && b.phase !== "hook"); add({ id: "problema-rapido", ok: early >= 0 && starts[early] <= 8, ...(early >= 0 && starts[early] <= 8 ? {} : { note: "pasan más de 8 s sin que aparezca el problema" }) });
  // 3) acción antes que explicación: en los 2 primeros beats casi no hay diálogo y sí acción
  const firstWords = beats.slice(0, 2).reduce((k, b) => k + (b.dialogue?.text.split(/\s+/).length ?? 0), 0), firstAct = beats.slice(0, 2).some((b) => visible(body(b)));
  add({ id: "accion-antes-de-explicar", ok: firstAct && firstWords <= 14, ...(firstAct && firstWords <= 14 ? {} : { note: "el inicio explica o habla más de lo que se ve" }) });
  // 4) la situación cambia varias veces (cambios distintos entre sí)
  let changes = 0; beats.forEach((b, i) => { if (i === 0 || jac(stems(b.change), stems(beats[i - 1].change)) < 0.5) changes++; });
  add({ id: "cambia-varias-veces", ok: changes >= 5, ...(changes >= 5 ? {} : { note: `la situación solo cambia ${changes} veces` }) });
  // 5) escalada y 6) giro
  const at = (st: ShortBeat["step"], from = 0) => beats.findIndex((b, k) => k >= from && b.step === st), i1 = at("intento"), f = i1 >= 0 ? at("fallo", i1 + 1) : -1, i2 = f >= 0 ? at("segundo-intento", f + 1) : -1, dsc = i2 >= 0 ? at("descubrimiento", i2 + 1) : -1;
  const first = i1 >= 0 ? beats[i1] : undefined, second = i2 >= 0 ? beats[i2] : undefined, differs = !!first && !!second && jac(stems(`${first.goal} ${first.action}`), stems(`${second.goal} ${second.action}`)) < 0.6;
  const acts = !!first && !!second && doing(first.action) && doing(second.action), emo = beats.filter((b) => !doing(b.action)).length, hugs = beats.filter((b) => /abraz/.test(plain(body(b)))).length;
  const missing = [i1 < 0 && "un INTENTO visible", f < 0 && "un FALLO tras el intento", i2 < 0 && "un SEGUNDO INTENTO tras el fallo", dsc < 0 && "un DESCUBRIMIENTO tras el segundo intento"].filter(Boolean), why = missing.length ? `falta ${missing.join(", ")}` : !differs ? "el segundo intento repite el primero (debe cambiar de estrategia)" : !acts ? "los intentos no son acciones concretas de KAP" : emo > n * 0.34 ? `${emo} de ${n} beats son solo emoción (mirar, sonreír, abrazar, estar triste): KAP debe hacer algo que cambie la situación` : hugs >= 2 ? "los abrazos sustituyen al conflicto y al descubrimiento" : "";
  add({ id: "escalada", ok: !why, ...(why ? { note: `cadena intento → fallo → reacción → segundo intento → descubrimiento: ${why}`, fix: "rewrite" as const } : {}) });
  const gi = beats.findIndex((b) => b.phase === "giro"); const declared = shortSeconds(beats) || 1;
  add({ id: "giro", ok: gi >= 0 && starts[gi] <= declared * 0.9, ...(gi >= 0 && starts[gi] <= declared * 0.9 ? {} : { note: "falta un giro o descubrimiento (o llega demasiado tarde)", fix: "patch" as const, beats: [Math.max(0, n - 2)] }) });
  // 7) remate con consecuencia, sin moraleja
  const last = beats.at(-1), moral = !!last && MORAL.test(`${last.action} ${last.reaction} ${last.dialogue?.text ?? ""} ${last.change}`), speechy = !!last?.dialogue && last.dialogue.text.split(/\s+/).length > 12, remOk = !!last && last.phase === "remate" && visible(body(last)) && !moral && !speechy;
  add({ id: "remate", ok: remOk, ...(remOk ? {} : { note: moral || speechy ? "el final suena a moraleja o a discurso (una frase corta basta)" : "el final no es una acción/consecuencia clara", fix: "patch" as const, beats: [n - 1] }) });
  // 8) beats repetidos (mismo momento) → fusionar
  const rep: number[] = []; beats.forEach((b, i) => { if (i && similar(beats[i - 1], b)) rep.push(i); });
  add({ id: "sin-repetidos", ok: !rep.length, ...(rep.length ? { note: `${rep.length} beat(s) cuentan el mismo momento que el anterior`, fix: "merge" as const, beats: rep } : {}) });
  // 9) beats que podrían eliminarse: sin acción ni diálogo, o sin cambio respecto al anterior (nunca el hook, el giro ni el remate)
  const drop = beats.map((b, i) => ({ b, i })).filter(({ b, i }) => i > 0 && i < n - 1 && b.phase !== "giro" && (idle(b) || jac(stems(b.change), stems(beats[i - 1].change)) >= 0.8)).map((x) => x.i);
  add({ id: "nada-eliminable", ok: !drop.length, ...(drop.length ? { note: `${drop.length} beat(s) se podrían quitar sin perder historia`, fix: "drop" as const, beats: drop } : {}) });
  // 10) tramos que dependen solo de diálogo (3 o más seguidos sin acción)
  let run = 0, runEnd = -1; for (let i = 0; i < n; i++) { run = !visible(body(beats[i])) && beats[i].dialogue ? run + 1 : 0; if (run >= 3 && runEnd < 0) runEnd = i; }
  const speech = beats.findIndex((b) => (b.dialogue?.text.split(/\s+/).length ?? 0) > 22 || (!!b.dialogue && MORAL.test(b.dialogue.text))); if (runEnd < 0 && speech >= 0) runEnd = speech + 1;   // un monólogo largo también es «solo diálogo»
  add({ id: "sin-tramos-solo-dialogo", ok: runEnd < 0, ...(runEnd < 0 ? {} : { note: `desde el beat ${runEnd - 1} el tramo depende solo del diálogo (3 beats seguidos o un monólogo largo): la idea debe verse, no explicarse` }) });
  // 11) predecible: 4 o más beats de escalada seguidos con el mismo objetivo
  let mono = 0, monoAt = -1; for (let i = 1; i < n; i++) { mono = beats[i].phase === "escalada" && beats[i - 1].phase === "escalada" && jac(stems(beats[i].goal), stems(beats[i - 1].goal)) >= 0.4 ? mono + 1 : 0; if (mono >= 3 && monoAt < 0) monoAt = i; }
  add({ id: "no-predecible", ok: monoAt < 0, ...(monoAt < 0 ? {} : { note: `desde el beat ${monoAt - 2} el espectador ya sabe qué va a pasar (la escalada repite el mismo objetivo)` }) });
  // 12) duración justa: 45-75 s y ¿podría ser más corto sin perder historia? (si pasa de 65 s y hay beats prescindibles o repetidos)
  const shorter = secs > SHORT_IDEAL[1] && (drop.length > 0 || rep.length > 0), durOk = secs >= SHORT_MIN && secs <= SHORT_MAX && !shorter && n >= 6 && n <= 16;
  add({ id: "duracion-justa", ok: durOk, ...(durOk ? {} : { fix: (secs < SHORT_MIN ? "rewrite" : undefined) as "rewrite" | undefined, note: secs < SHORT_MIN ? `dura ${secs} s (< ${SHORT_MIN} s)` : secs > SHORT_MAX ? `dura ${secs} s (> ${SHORT_MAX} s)` : shorter ? `dura ${secs} s y podría ser más corto sin perder historia` : `${n} beats (objetivo 8-15)` }) });
  const failed = checks.filter((c) => !c.ok).map((c) => c.id);
  return { checks, failed, passed: checks.length - failed.length, total: checks.length, seconds: secs };
}

/** Reparación LOCAL en código (sin modelo): fusiona los beats que repiten el momento anterior y quita los prescindibles. Nunca toca el hook, el giro ni el remate; se detiene si quedarían menos de 6 beats. */
export function repairShort(beats: ShortBeat[]): { beats: ShortBeat[]; merged: number; dropped: number } {
  let out = beats.map((b) => ({ ...b })), merged = 0, dropped = 0;
  const res = shortRetentionCheck(out), rep = new Set(res.checks.find((c) => c.id === "sin-repetidos")?.beats ?? []);
  if (rep.size) { const kept: ShortBeat[] = []; out.forEach((b, i) => { if (rep.has(i) && kept.length) { const a = kept[kept.length - 1]; a.seconds = Math.round((a.seconds + b.seconds * 0.5) * 10) / 10; a.change = b.change || a.change; if (!a.dialogue && b.dialogue) a.dialogue = b.dialogue; merged++; } else kept.push(b); }); out = kept; }
  const dr = new Set(shortRetentionCheck(out).checks.find((c) => c.id === "nada-eliminable")?.beats ?? []);
  if (dr.size && out.length - dr.size >= 6) { out = out.filter((_, i) => !dr.has(i)); dropped = dr.size; }
  return { beats: out, merged, dropped };
}

// ---------------------------------------------------------------- beats → borrador de guion
const words = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
/** Duración que dará el pipeline a una línea (misma fórmula que server/studio/timeline.ts: la acción sale de su cadena continua; la voz, de las palabras). */
const lineSeconds = (l: { speaker: string; text: string }) => (l.speaker ? Math.max(0.7, words(l.text) / 2.6) + 0.25 : actionDuration(l.text));
export const MAX_SCENE_WORDS = 46;   // el guion parte las escenas de más de 52 palabras y solo la primera parte conserva las direcciones: se evita escribiéndolas más cortas

export type ShortScene = { location: string; time: string; beats: ShortBeat[] };
const beatWords = (b: ShortBeat) => words(b.action) + words(b.reaction) + (b.dialogue ? words(b.dialogue.text) : 0);
/** Los beats seguidos en el mismo lugar y momento forman una escena, sin pasar de ≈ 46 palabras (cada beat es contenido propio: nunca se repite ninguno para crear una escena). */
export function groupScenes(beats: ShortBeat[]): ShortScene[] {
  const out: ShortScene[] = [], size: number[] = [];
  for (const b of beats) { const s = out.at(-1), w = beatWords(b); if (s && plain(s.location) === plain(b.location) && plain(s.time) === plain(b.time) && size[size.length - 1] + w <= MAX_SCENE_WORDS) { s.beats.push(b); size[size.length - 1] += w; } else { out.push({ location: b.location, time: b.time, beats: [b] }); size.push(w); } }
  return out;
}
const SOUND_WORD: Record<string, string> = { door: "puerta", bump: "golpe", knock: "llamar", ring: "llamada", steps: "pasos", ambience: "ambiente" };
/** «marca-musica» (no «musica»): el guion interpretaría «musica:» como una pista de música real. Son solo marcas para el director: HOY NO HAY MÚSICA, no se oye nada por ellas. */
const MUSIC_WORD: Record<string, string> = { start: "inicio", change: "cambio", stop: "fin" };

export type ShortDraftScene = { title: string; location: string; lines: { speaker: string; text: string }[]; memory: string[]; stage: string; shot: string; time: string; interior: boolean; directions: string[]; change: string; /** misma localización que la escena anterior: corte seco (no fundido ni disolución) */ transition?: "cut" };
const INDOOR = /habitaci|cuarto|dormitorio|cocina|salon|sala\b|pasillo|interior|bano|comedor|casa de/i, OUTDOOR = /calle|patio|exterior|plaza|parque|acera|fachada|entrada|portal|jardin|azotea/i;
const ACT: Record<Phase, string> = { hook: "inicio", contexto: "conflicto", escalada: "desarrollo", giro: "emocional", remate: "resolucion" };

/** Duración (s) que tendrá el render de estas escenas por su CONTENIDO (como el pipeline: cada escena = acciones encadenadas + voz + 1 s de margen, entre 3 y 40 s). */
export const estimateRenderSeconds = (scenes: { lines: { speaker: string; text: string }[] }[]) => Math.round(scenes.reduce((n, sc) => { const end = sc.lines.reduce((t, l) => t + lineSeconds(l) + (l.speaker ? 0.25 : 0), 0); return n + Math.min(40, Math.max(3, end + 1)); }, 0) * 10) / 10;

/** Beats → escenas del borrador (formato del generador de episodios): narración = DIRECCIÓN (sin hablante), diálogo = solo lo que se dice; plano, sonido y marcas con su tiempo (calculado con la duración real de las líneas). Todas las directivas se conservan. */
export function beatsToScenes(beats: ShortBeat[], known: string[]): ShortDraftScene[] {
  const lead = 0.3, seen = new Set<string>(); let prevLoc = "";
  return groupScenes(beats).map((sc) => {
    const lines: { speaker: string; text: string }[] = [], dirs: string[] = [], memory: string[] = []; let t = 0;
    sc.beats.forEach((b) => {
      const start = t, mine: { speaker: string; text: string }[] = [];
      for (const x of [b.action, b.reaction]) { const n = x.trim() ? normalizeLine({ text: x }, known) : undefined; if (n) mine.push({ speaker: "", text: n.text }); }
      if (b.dialogue) { const n = normalizeLine({ speaker: b.dialogue.speaker, text: b.dialogue.text }, known); if (n) mine.push({ speaker: n.speaker ?? "", text: n.text }); }
      for (const l of mine) { lines.push(l); t += lineSeconds(l) + (l.speaker ? 0.25 : 0); }
      const at = `en ${(start + lead).toFixed(1)}s`, who = b.characters[0] ?? "KAP";
      dirs.push(b.shot === "general" ? `plano: general ${at}` : b.shot === "medio" ? `plano: medio ${who} ${at}` : b.shot === "seguimiento" ? `camara: seguir ${who} ${at}` : `plano: primer plano ${who} ${at}`);   // «objeto» = primer plano en quien lo maneja
      if (b.sound && b.sound !== "none") dirs.push(`sonido: ${SOUND_WORD[b.sound]} ${at}`);
      if (b.music === "impact") dirs.push(`impacto: ${at}`); else if (b.music === "silence") dirs.push(`silencio: ${at} durante 1.5s`); else if (b.music && b.music !== "none") dirs.push(`marca-musica: ${MUSIC_WORD[b.music]} ${at}`);
      const act = ACT[b.phase]; if (!seen.has(act)) { seen.add(act); memory.push(`acto: ${act} | ${b.goal.slice(0, 140)}`); }
    });
    const first = sc.beats[0], last = sc.beats.at(-1)!, loc = plain(sc.location), cut = !!prevLoc && prevLoc === loc; prevLoc = loc;
    return { title: first.goal.slice(0, 60) || sc.location, location: sc.location, lines, memory: last === beats.at(-1) ? [...memory, `gancho: ${last.change.slice(0, 240)}`] : memory, stage: ACT[first.phase], shot: first.shot === "general" ? "general" : first.shot === "primer plano" || first.shot === "objeto" ? "primer plano" : "medio", time: sc.time, interior: INDOOR.test(loc) && !OUTDOOR.test(loc), directions: dirs, change: last.change, ...(cut ? { transition: "cut" as const } : {}) };
  });
}
