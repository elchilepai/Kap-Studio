/**
 * SHORT MODE (módulo puro, sin IA): planificación y revisión de un SHORT animado de KAP (vertical, 45-75 s, ideal 50-65) pensado desde el principio para
 * RETENCIÓN > CLARIDAD > ACCIÓN VISUAL > RITMO > HUMOR/REMATE > DIÁLOGO > EXPLICACIÓN. No es un episodio comprimido: es una cadena de 8-15 BEATS cortos y
 * activos (objetivo, acción visible, reacción, cambio, duración, plano, sonido, música y, solo si aporta, diálogo).
 * Aquí viven: el tipo del beat, SHORT_RETENTION_CHECK (12 comprobaciones sin llamar al modelo), las reparaciones en código y la conversión beats → borrador de guion.
 */
import { actionDuration, hasAction } from "./action.ts";
import { FALL, objectDefFor } from "./objects.ts";
import { normalizeLine } from "./lines.ts";

export const PHASES = ["hook", "contexto", "escalada", "giro", "remate"] as const;
export type Phase = (typeof PHASES)[number];
export const SHOTS = ["general", "medio", "primer plano", "objeto", "seguimiento"] as const;
export const SHORT_SOUNDS = ["none", "door", "bump", "knock", "ring", "steps", "ambience"] as const;
/** CÓMO se visualiza cada beat (separado de QUÉ ocurre): nivel de animación, cámara y tipo de movimiento. */
export const VISUALS = ["illustration", "limited-animation", "action"] as const;
export const CAMERAS = ["static", "slow-push", "slow-pull", "pan", "follow", "close-up", "wide", "reveal"] as const;
export const MOTIONS = ["none", "subtle", "character", "object", "environment"] as const;
export const SHORT_MUSIC = ["none", "start", "change", "stop", "impact", "silence"] as const;
export type ShortBeat = {
  phase: Phase; step: (typeof STEPS)[number]; goal: string; action: string; reaction: string; change: string; seconds: number; shot: (typeof SHOTS)[number];
  characters: string[]; location: string; time: string; visual?: (typeof VISUALS)[number]; camera?: (typeof CAMERAS)[number]; motion?: (typeof MOTIONS)[number]; sound?: (typeof SHORT_SOUNDS)[number]; music?: (typeof SHORT_MUSIC)[number]; dialogue?: { speaker: string; text: string };
};
/** Contrato narrativo del Short: cada paso se ve en acciones (no «está triste»). */
export const STEPS = ["situacion", "intento", "fallo", "reaccion", "segundo-intento", "descubrimiento", "cambio", "remate"] as const;
export const SHORT_MIN = 50, SHORT_MAX = 75, SHORT_IDEAL: [number, number] = [50, 65];

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


// ---------------------------------------------------------------- CAUSALIDAD REAL (inspecciona el TEXTO de los beats, no las etiquetas)
const sentencesOf = (t: string) => t.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
const stem4 = (t: string) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 4)));
const OTHER_SUBJ = /^(?:el|la|los|las)\s+(?:hermano|ni[ñn]\w*|amig\w*|chic\w*|otr\w*|vecin\w*|compa\w*|grupo)|^(?:dani|ramiro|profesora)\b/;
/** Lo que NO cambia la situación por sí solo: moverse sin objetivo, sentarse, escribir sin consecuencia, mirar, sonreír, suspirar, «con paso firme»… */
const MOVE_ONLY = /\b(?:camin\w*|sal[eg]\w*|entr\w*|llega\w*|regres\w*|vuelve a (?:casa|la calle|su)\w*|se acerca\w*|se aleja\w*|avanza\w*|se dirige\w*|cruza\w*|se sient\w*|se levant\w*|se detien\w*|se par[ao]\w*|se queda\w*|pasea\w*|espera\w*|se gira\w*|se vuelve\w*|abre la puerta|sonr\w*|suspir\w*|mira\w*|piensa\w*|escrib\w*|garabate\w*|se pone serio|con paso firme|observa\w*)\b/g;
const CONSEQ = /\b(?:se cae\w*|se caen|cae\w*|se derrumba\w*|se desmorona\w*|se rompe\w*|se tuerce|se inclina\w*|se tambale\w*|sale mal|falla\w*|rueda\w*|se vuelca\w*|se mancha\w*|se apaga\w*|se pierde\w*|se escapa\w*|se desinfla\w*|se atasca\w*|se rasga\w*|se desv[ií]a\w*|se arruga\w*|no (?:se mantiene|funciona|aguanta|llega|encaja|sale|consigue|logra|para|cabe|enciende|arranca)|se (?:queda|deshace)\s+(?:a medias|roto)|termina (?:rota|roto|torcid\w*))\b/;
const RESULT_OK = /\b(?:se queda en pie|se mantiene|aguanta\w*|se sostiene|funciona\w*|encaja\w*|sale bien|consigue\w*|logra\w*|queda quiet\w*|queda firme|se equilibra|llega\w* (?:arriba|al final|a lo alto))\b/;
const REACT = /\b(?:patea\w*|patada|resopla\w*|aprieta\w*|arruga\w*|tira\w*|rompe\w*|se agacha\w*|baja la cabeza|retrocede\w*|da un paso atras|se encoge\w*|cruza los brazos|golpea\w*|deja caer|esconde\w*|suelta\w*|aparta\w*|se tapa\w*|se muerde\w*|frunce\w*|bufa\w*|gruñe\w*|se rasca\w*|aprieta la mandibula|lo vuelve a)\b/;
const ABSTRACT = /\b(?:se da cuenta de que|se da cuenta|comprende\w*|entiende que|descubre que|cada (?:uno|persona) tiene|su propio ritmo|su ritmo|no debe compararse|no hay que compararse|confiar en s[ií]|aprende\w*|se siente (?:mejor|libre|en paz)|encuentra (?:un )?(?:peque[ñn]o )?sentido)\b/;
type Sent = { text: string; kap: boolean; beat: number; beatText: string };
/** Frases de cada beat con su sujeto (KAP u otro): una frase sin sujeto continúa el sujeto de la anterior; el de arranque es KAP. */
function sentencesOfBeats(beats: ShortBeat[]): Sent[] {
  const out: Sent[] = [];
  beats.forEach((b, i) => { let cur = true;   // sujeto en curso: KAP salvo que la frase nombre a otro personaje
    for (const t of [...sentencesOf(b.action), ...sentencesOf(b.reaction)]) { const p = plain(t); let kap: boolean;
      if (OTHER_SUBJ.test(p)) { cur = false; kap = false; } else if (/^kap\b/.test(p)) { cur = true; kap = true; } else if (/^(?:el|la|los|las|un|una)\s+[a-z]+(?:\s+de\s+[a-z]+)?\s+(?:se\b|no\b|cae\b|caen\b|rueda\b|ruedan\b|aguanta\b|funciona\b|queda\b|quedan\b|sigue\b|siguen\b|tiembla\b|chisporrotea\b|brilla\b|rebota\b)/.test(p)) kap = false;   // «La torre se derrumba»: lo hace una cosa, no KAP
      else kap = cur;
      out.push({ text: t, kap, beat: i, beatText: `${b.action} ${b.reaction}` }); } });
  return out;
}
const acts = (t: string) => { const p = plain(t); return VISIBLE.test(p.replace(MOVE_ONLY, " ")) && !EMOTIVE.test(p.replace(MOVE_ONLY, " ")) || (/\b(?:coloca\w*|apil\w*|ajust\w*|pon[eg]\w*)\b/.test(p)); };
/** Una frase se refiere al objeto si lo nombra ella o el beat en que está (los pronombres y los verbos sueltos no repiten el nombre). */
const refs = (x: { text: string; beatText: string }, obj: Set<string>) => refsText(x.text, obj) || refsText(x.beatText, obj);
/** Un INTENTO construye/hace/prueba algo con el objeto (no recoger lo caído, medir o apartarse). */
const BUILD = /\b(?:apil\w*|coloc\w*|constru\w*|pon[eg]\w*|encaj\w*|ajust\w*|equilibr\w*|prob\w*|intent\w*|arregl\w*|sube\b|sub[eií]\w*|baja\w*|pega\w*|ata\b|corrig\w*|cambi\w*|usa\w*|prepar\w*|dibuj\w*|lanz\w*|empuj\w*|pedale\w*|arranc\w*|mont\w*|quita\w*|a[ñn]ad\w*|aca[bn]\w*|rehac\w*|apoya\w*|llena\w*|corta\w*|une\b|junta\w*)\b/;
const tries = (t: string) => acts(t) && BUILD.test(plain(t));
const refsText = (t: string, obj: Set<string>) => { const st = stem4(t); for (const x of obj) if (st.has(x)) return true; return false; };

/** Cadena causal REAL del Short: objetivo concreto → acción de KAP con el objeto → consecuencia observable → reacción corporal → estrategia DISTINTA → resultado distinto → acción posterior que lo usa. Devuelve los motivos por los que NO se cumple (vacío = cumple). */
export function causalReasons(beats: ShortBeat[], objeto = ""): string[] {
  const why: string[] = [], S = sentencesOfBeats(beats), obj = stem4(objeto);
  if (!obj.size) return ["falta el objeto concreto del conflicto (campo «objeto»)"];
  // comparación visible: alguien consigue algo con el objeto en el arranque
  if (!S.some((x) => x.beat <= 1 && !x.kap && acts(x.text) && refsText(x.text, obj))) why.push("el gancho no muestra a alguien consiguiendo algo con el objeto (la comparación debe verse desde el principio)");
  if (!S.some((x) => x.beat === 0 && acts(x.text))) why.push("el primer beat no tiene una acción concreta (no basta mirar o estar)");
  // 1+2) fallo: la primera consecuencia observable sobre el objeto que sigue a una acción concreta de KAP con ese objeto (no mover, sentarse, escribir sin consecuencia, mirar…); el intento es la última acción de KAP anterior a ella
  const isAct = (x: Sent) => x.kap && tries(x.text) && refs(x, obj);
  const iF = S.findIndex((x, k) => CONSEQ.test(plain(x.text)) && refs(x, obj) && S.slice(Math.max(0, k - 8), k).some(isAct));
  if (!S.some(isAct)) { why.push("ninguna acción concreta de KAP con el objeto que pueda cambiar la situación (mirar, caminar, sentarse, escribir o sonreír no son un intento)"); return why; }
  if (iF < 0) { why.push("tras el intento no hay una consecuencia observable sobre el objeto (se cae, se rompe, no funciona…); «nadie lo ve» no cuenta si KAP no intentó nada con ellos"); return why; }
  const iA = S.slice(0, iF).map((x, k) => (isAct(x) ? k : -1)).filter((k) => k >= 0 && k >= iF - 8).pop() ?? -1;
  // 3) reacción corporal de KAP al fallo
  if (!S.some((x, k) => k > iF - 1 && k <= iF + 6 && x.kap && (REACT.test(plain(x.text)) || acts(x.text)))) why.push("KAP no reacciona con el cuerpo al fallo");
  // 4) segundo intento: acción de KAP con el objeto DISTINTA de la primera (otra estrategia/objeto/contexto, no repetir igual)
  const first = S[iA], iS = S.findIndex((x, k) => k > iF && x.kap && tries(x.text) && refs(x, obj) && k > iA);
  if (iS < 0) { why.push("no hay un segundo intento de KAP con el objeto después del fallo"); return why; }
  const a = stem4(S.filter((x) => x.beat === first.beat && x.kap && tries(x.text)).map((x) => x.text).join(" ")), sec = S.filter((x) => x.beat === S[iS].beat && x.kap && tries(x.text)).map((x) => x.text).join(" "), b = stem4(sec), inter = [...a].filter((x) => b.has(x)).length, jc = inter / Math.max(1, new Set([...a, ...b]).size), newStems = [...b].filter((x) => !a.has(x)).length;
  if (jc >= 0.5 || newStems < 3) why.push("el segundo intento repite el primero: debe cambiar la acción, el objeto o la estrategia");
  // 5) resultado distinto y concreto (no una frase abstracta)
  const iD = S.findIndex((x, k) => k >= iS && RESULT_OK.test(plain(x.text)) && refs(x, obj));
  if (iD < 0) { why.push("el segundo intento no produce un resultado concreto distinto (el objeto aguanta, funciona, encaja…)"); return why; }
  // 6) el descubrimiento cambia una acción POSTERIOR de KAP con el objeto
  if (!S.some((x, k) => k > iD && x.beat > S[iD].beat && x.kap && tries(x.text) && refs(x, obj))) why.push("el resultado no cambia ninguna acción posterior de KAP (sin un cambio visible después, no hay descubrimiento narrativo)");
  // 7) frases abstractas explicando lo aprendido
  if (S.some((x) => ABSTRACT.test(plain(x.text))) || beats.some((b) => b.dialogue && ABSTRACT.test(plain(b.dialogue.text)))) why.push("hay una frase abstracta («se da cuenta de que…», «cada uno tiene su ritmo», «confía en sí mismo»): la idea debe verse en acciones");
  // 8) KAP provoca los cambios (el hermano u otros no lo resuelven por él)
  const kapActs = S.filter((x) => x.kap && acts(x.text)).length, otherActs = S.filter((x) => !x.kap && acts(x.text)).length;
  if (kapActs < (kapActs + otherActs) * 0.6) why.push("la situación cambia sobre todo por lo que hacen otros, no KAP");
  return why;
}


// ---------------------------------------------------------------- PRESENTADOR (KAP a cámara al principio y al final)
export type ShortPresenter = { intro: string; outro?: { gesto: string; texto: string } };
const COACH = /\b(?:debes|debemos|tienes que|tenemos que|recuerda que|recuerda|la clave|el secreto|lo importante|todos deber[ií]amos|aprende\w*|nunca te rindas|conf[ií]a en ti|cree en ti|cada uno|su propio ritmo|el camino|el [eé]xito|la vida es|en la vida)\b/;
const wc = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
/** Gancho hablado: breve (≈ 3-6 s), plantea una duda concreta con una pregunta o una observación cotidiana y no suena a coach, filósofo ni discurso. */
export function introReasons(intro: string): string[] {
  const why: string[] = [], t = intro.trim(), p = plain(t), n = wc(t);
  if (!t) return ["falta el gancho hablado de KAP a cámara"];
  if (n < 5 || n > 16) why.push(`el gancho hablado tiene ${n} palabras (debe durar ≈ 3-6 s: entre 5 y 16)`);
  if (!/[?¿]/.test(t) && !/\b(?:alguna vez|te pasa|sientes que|parece que|por que)\b/.test(p)) why.push("el gancho no plantea una duda concreta (una pregunta o «parece que…»)");
  if (COACH.test(p) || ABSTRACT.test(p) || MORAL.test(t)) why.push("el gancho suena a coach, filósofo o moraleja: KAP solo plantea la duda");
  return why;
}
/** Remate: gesto + (opcional) frase de ≤ 8 palabras, sin lección ni discurso. */
export function outroReasons(o: { gesto: string; texto: string } | undefined): string[] {
  if (!o) return ["falta el remate de KAP a cámara (un gesto o una frase muy corta)"];
  const why: string[] = [], p = plain(o.texto);
  if (!o.gesto.trim()) why.push("el remate no indica ningún gesto");
  if (wc(o.texto) > 8) why.push(`la frase final tiene ${wc(o.texto)} palabras (máximo 8)`);
  if (o.texto && (COACH.test(p) || ABSTRACT.test(p) || MORAL.test(o.texto))) why.push("la frase final explica la moraleja");
  return why;
}

/** SHORT_RETENTION_CHECK: las 12 preguntas de retención, sin llamar al modelo. Las que se pueden arreglar en código indican cómo (`fix`). */
export function shortRetentionCheck(beats: ShortBeat[], o: { renderSeconds?: number; objeto?: string; presenter?: ShortPresenter } = {}): RetentionResult {
  const checks: RetentionCheck[] = [], add = (c: RetentionCheck) => checks.push(c), secs = o.renderSeconds ?? shortSeconds(beats), n = beats.length;   // con `renderSeconds` se mide lo que durará el render real (por el contenido), no los segundos que declara el modelo
  const starts: number[] = []; { let t = 0; for (const b of beats) { starts.push(t); t += b.seconds; } }
  // 1) hook claro: algo ocurre YA (acción visible, no diálogo ni descripción) y es corto
  const h = beats[0], pr = o.presenter, introWhy = pr ? introReasons(pr.intro) : [], hookOk = pr ? !introWhy.length : !!h && visible(body(h)) && h.seconds <= 4.5 && (h.dialogue ? h.dialogue.text.split(/\s+/).length <= 8 : true);
  add({ id: "hook-claro", ok: hookOk, ...(hookOk ? {} : { note: pr ? introWhy.join("; ") : "el primer beat no tiene una acción visible inmediata (o es largo / empieza hablando)", fix: "patch" as const, beats: pr ? [] : [0] }) });
  // 2) el problema aparece rápido: antes de los 8 s ya hay un beat de contexto/escalada
  const early = beats.findIndex((b, i) => starts[i] > 0 && b.phase !== "hook"); add({ id: "problema-rapido", ok: early >= 0 && starts[early] <= 8, ...(early >= 0 && starts[early] <= 8 ? {} : { note: "pasan más de 8 s sin que aparezca el problema" }) });
  // 3) acción antes que explicación: en los 2 primeros beats casi no hay diálogo y sí acción
  const firstWords = beats.slice(0, 2).reduce((k, b) => k + (b.dialogue?.text.split(/\s+/).length ?? 0), 0), firstAct = beats.slice(0, 2).some((b) => visible(body(b)));
  add({ id: "accion-antes-de-explicar", ok: firstAct && firstWords <= 14, ...(firstAct && firstWords <= 14 ? {} : { note: "el inicio explica o habla más de lo que se ve" }) });
  // 4) la situación cambia varias veces (cambios distintos entre sí)
  let changes = 0; beats.forEach((b, i) => { if (i === 0 || jac(stems(b.change), stems(beats[i - 1].change)) < 0.5) changes++; });
  add({ id: "cambia-varias-veces", ok: changes >= 5, ...(changes >= 5 ? {} : { note: `la situación solo cambia ${changes} veces` }) });
  // 5) escalada y 6) giro
  const emo = beats.filter((b) => !doing(b.action)).length, hugs = beats.filter((b) => /abraz/.test(plain(body(b)))).length, reasons = causalReasons(beats, o.objeto ?? "");
  if (!reasons.length && emo > n * 0.34) reasons.push(`${emo} de ${n} beats son solo emoción (mirar, sonreír, abrazar, estar triste)`); if (!reasons.length && hugs >= 2) reasons.push("los abrazos sustituyen al conflicto");
  const why = reasons.join("; ");
  add({ id: "escalada", ok: !why, ...(why ? { note: `cadena causal real (intento de KAP con un objeto → consecuencia → reacción → estrategia distinta → resultado → cambio posterior): ${why}`, fix: "rewrite" as const } : {}) });
  const gi = beats.findIndex((b) => b.phase === "giro"); const declared = shortSeconds(beats) || 1;
  add({ id: "giro", ok: gi >= 0 && starts[gi] <= declared * 0.9, ...(gi >= 0 && starts[gi] <= declared * 0.9 ? {} : { note: "falta un giro o descubrimiento (o llega demasiado tarde)", fix: "patch" as const, beats: [Math.max(0, n - 2)] }) });
  // 7) remate con consecuencia, sin moraleja
  const last = beats.at(-1), moral = !!last && MORAL.test(`${last.action} ${last.reaction} ${last.dialogue?.text ?? ""} ${last.change}`), speechy = !!last?.dialogue && last.dialogue.text.split(/\s+/).length > 12, outroWhy = o.presenter ? outroReasons(o.presenter.outro) : [], remOk = !!last && last.phase === "remate" && visible(body(last)) && !moral && !speechy && !outroWhy.length;
  add({ id: "remate", ok: remOk, ...(remOk ? {} : { note: outroWhy.length ? outroWhy.join("; ") : moral || speechy ? "el final suena a moraleja o a discurso (una frase corta basta)" : "el final no es una acción/consecuencia clara", fix: "patch" as const, beats: o.presenter ? [] : [n - 1] }) });
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

export type ShortScene = { location: string; time: string; beats: ShortBeat[] };
const beatWords = (b: ShortBeat) => words(b.action) + words(b.reaction) + (b.dialogue ? words(b.dialogue.text) : 0);
/** Clase de montaje de cada paso: el CORTE llega cuando cambia la clase (nueva situación → intento y su consecuencia → reacción → otro intento y su resultado → remate). */
const CLASS: Record<ShortBeat["step"], string> = { situacion: "A", intento: "B", fallo: "B", reaccion: "C", "segundo-intento": "D", descubrimiento: "D", cambio: "E", remate: "E" };
const beatSeconds = (b: ShortBeat) => [b.action, b.reaction].reduce((n, t) => n + (t.trim() ? actionDuration(t) : 0), 0) + (b.dialogue ? lineSeconds({ speaker: b.dialogue.speaker, text: b.dialogue.text }) : 0);
/** Los beats seguidos forman una escena (varias acciones relacionadas) hasta que hay una RAZÓN de corte: cambio de lugar u hora, cambio de clase de montaje (nuevo intento, corte a la reacción, remate) o escena demasiado larga (> 16 s). Nunca se repite un beat. */
export function groupScenes(beats: ShortBeat[]): ShortScene[] {
  const out: ShortScene[] = [], dur: number[] = [];
  for (const b of beats) { const s = out.at(-1), prev = s?.beats.at(-1), d = beatSeconds(b);
    if (s && prev && plain(s.location) === plain(b.location) && plain(s.time) === plain(b.time) && CLASS[prev.step] === CLASS[b.step] && dur[dur.length - 1] + d <= 16) { s.beats.push(b); dur[dur.length - 1] += d; } else { out.push({ location: b.location, time: b.time, beats: [b] }); dur.push(d); } }
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

/** Sonido que sale de lo que se ve en una frase (pasos, puerta, golpe/caída, objeto colocado, llamada): sonidos sintetizados que ya existen; no se inventa música. */
function soundsOfSentence(t: string, dur: number): { kind: "steps" | "door" | "bump" | "knock" | "ring"; dur?: number }[] {
  const p = plain(t), out: { kind: "steps" | "door" | "bump" | "knock" | "ring"; dur?: number }[] = [];
  if (/\b(?:corre\w*|camin\w*|sale\b|sal[eg]\w*|entra\w*|regres\w*|se acerca\w*|se aleja\w*|avanza\w*|cruza\w*|va hacia|se dirige\w*|llega\w*)\b/.test(p)) out.push({ kind: "steps", dur: Math.max(0.8, Math.min(3, dur)) });
  if (/\bpuerta\b/.test(p) && /\b(?:abre|cierra|golpea|portazo|sale|entra)\w*/.test(p)) out.push({ kind: "door" });
  if (/\b(?:cae\w*|se caen|derrumba\w*|rompe\w*|golpea\w*|patada|patea\w*|choca\w*|rebota\w*|estruendo|tira\w*|lanza\w*|se desmorona\w*|rueda\w*|vuelca\w*)\b/.test(p)) out.push({ kind: "bump" });
  else if (/\b(?:coloca\w*|apila\w*|pone\b|pon[eg]\w*|deja\w*|apoya\w*|encaja\w*|toca\w*|empuja\w*|ajusta\w*|recoge\w*|saca\w*|guarda\w*|aprieta\w*|clava\w*|pega\w*)\b/.test(p)) out.push({ kind: "knock" });
  if (/\b(?:suena\w*|timbre|llamada|telefono|movil)\b/.test(p)) out.push({ kind: "ring" });
  return out;
}
/** Instantes (s, relativos al inicio de la línea) en que empieza cada frase de una línea de acción, repartidos según la duración real de la línea. */
function sentenceStarts(text: string, lineDur: number): { text: string; t: number; dur: number }[] {
  const ss = sentencesOf(text), d = ss.map((x) => actionDuration(x)), sum = d.reduce((a, b) => a + b, 0) || 1, k = lineDur / sum; let t = 0;
  return ss.map((x, i) => { const r = { text: x, t, dur: d[i] * k }; t += d[i] * k; return r; });
}


/** Nivel visual del beat: lo que dice el beat; si no, acción para caídas/golpes/carreras, ilustración si no hay acción física y animación limitada en el resto. */
export const visualOf = (b: ShortBeat): (typeof VISUALS)[number] => b.visual ?? (/\b(?:cae\w*|se caen|derrumba\w*|golpea\w*|corre\w*|lanza\w*|tropiez\w*|patea\w*|choca\w*|vuelca\w*|rueda\w*)\b/.test(plain(`${b.action} ${b.reaction}`)) ? "action" : !doing(b.action) ? "illustration" : "limited-animation");
/** Cámara del beat (con función narrativa): la que declara el beat o, si no, la que sale del plano. */
export const cameraOf = (b: ShortBeat): (typeof CAMERAS)[number] => b.camera ?? (b.shot === "general" ? "wide" : b.shot === "primer plano" || b.shot === "objeto" ? "close-up" : b.shot === "seguimiento" ? "follow" : "static");
const VISUAL_WORD = { illustration: "ilustracion", "limited-animation": "limitada", action: "accion" } as const;
/** Directivas de cámara de un beat (arrancan en `t`, duran `dur`): cada movimiento responde a la historia; la cámara estática se declara para que nada se mueva solo. */
function cameraDirs(cam: (typeof CAMERAS)[number], who: string, t: number, dur: number): string[] {
  const at = (x: number) => `en ${x.toFixed(1)}s`, d = Math.max(0.8, dur).toFixed(1);
  switch (cam) {
    case "slow-push": return [`camara: seguir ${who} zoom 1.3 ${at(t)} durante ${d}s`];
    case "slow-pull": return [`plano: primer plano ${who} ${at(t)}`, `camara: centro ${at(t + 0.1)} durante ${d}s`];
    case "pan": return [`camara: paneo derecha ${at(t)} durante ${d}s`];
    case "follow": return [`camara: seguir ${who} ${at(t)} durante ${d}s`];
    case "close-up": return [`plano: primer plano ${who} ${at(t)}`];
    case "wide": return [`plano: general ${at(t)}`];
    case "reveal": return [`camara: paneo derecha ${at(t)} durante ${(dur * 0.6).toFixed(1)}s`, `plano: general ${at(t + dur * 0.6)}`];
    default: return [`camara: centro ${at(t)}`];   // estática: encuadre fijo
  }
}

export type PresenterOpts = { objeto?: string; intro?: string; outro?: { gesto: string; texto: string } };
const presenterScene = (kind: "intro" | "outro", lines: { speaker: string; text: string }[], time: string, last?: string): ShortDraftScene => {
  const dur = Math.min(40, Math.max(3, lines.reduce((n, l) => n + lineSeconds(l) + (l.speaker ? 0.25 : 0), 0) + 1));
  return { title: kind === "intro" ? "KAP plantea la duda" : "KAP remata", location: "A cámara", lines, memory: kind === "intro" ? ["acto: inicio | KAP plantea la duda a cámara"] : [`gancho: ${(last ?? "KAP cierra a cámara").slice(0, 240)}`], stage: kind === "intro" ? "inicio" : "resolucion", shot: "medio", time, interior: true, change: kind === "intro" ? "la duda queda planteada" : "KAP remata",
    directions: ["a-camara: KAP en 0.3s", "camara: seguir KAP zoom 1.7 en 0.3s durante 0.5s", "visual: ilustracion en 0.3s", `marca-musica: ${kind === "intro" ? "inicio" : "fin"} en 0.3s`, `sonido: ambiente en 0.3s durante ${dur.toFixed(1)}s`, "montaje: continuo"], ...(kind === "outro" ? { transition: "cut" as const } : {}) };
};

/** Beats → escenas del borrador (formato del generador de episodios): narración = DIRECCIÓN (sin hablante), diálogo = solo lo que se dice. Las directivas (plano, reacción en primer plano, sonidos, impacto, silencio, marcas, estado del objeto) caen en el instante de la frase/reacción que las motiva, con la duración real de las líneas; todas se conservan. Con `intro`/`outro`, el Short abre y cierra con KAP presentador a cámara. Entre escenas, siempre CORTE. */
export function beatsToScenes(beats: ShortBeat[], known: string[], pres: PresenterOpts = {}): ShortDraftScene[] {
  const lead = 0.3, seen = new Set<string>(); let index = pres.intro ? 1 : 0; const odef = pres.objeto ? objectDefFor(pres.objeto) : undefined; let ostate: "intact" | "fallen" = "intact";
  const story = groupScenes(beats).map((sc) => {
    const lines: { speaker: string; text: string }[] = [], dirs: string[] = [], memory: string[] = []; let t = 0; const snd: { kind: string; at: number; dur?: number }[] = [];
    if (odef) dirs.push(`objeto: ${odef.name}${ostate === "fallen" ? " caido" : ""}`);   // el objeto central ya está en escena, en su estado actual
    sc.beats.forEach((b) => {
      const start = t, mine: { speaker: string; text: string; at: number; dur: number }[] = [];
      for (const x of [b.action, b.reaction]) { const n = x.trim() ? normalizeLine({ text: x }, known) : undefined; if (n) { const d = lineSeconds({ speaker: "", text: n.text }); mine.push({ speaker: "", text: n.text, at: t, dur: d }); lines.push({ speaker: "", text: n.text }); t += d; } }
      if (b.dialogue) { const n = normalizeLine({ speaker: b.dialogue.speaker, text: b.dialogue.text }, known); if (n) { const d = lineSeconds({ speaker: n.speaker ?? "", text: n.text }); mine.push({ speaker: n.speaker ?? "", text: n.text, at: t, dur: d }); lines.push({ speaker: n.speaker ?? "", text: n.text }); t += d + 0.25; } }
      if (odef) for (const x of sentencesOfBeats([b])) { const p = plain(x.text), refsObj = odef.re.test(plain(b.action + " " + b.reaction)); if (refsObj && odef.fallen && FALL.test(p)) ostate = "fallen"; else if (refsObj && x.kap && /\b(?:apila\w*|coloca\w*|levanta\w*|reconstru\w*|endereza\w*|monta\w*|construye\w*|vuelve a (?:poner|colocar|apilar|montar))\b/.test(p)) ostate = "intact"; }   // solo KAP reconstruye su objeto
      const at = (x: number) => `en ${(x + lead).toFixed(1)}s`, who = b.characters[0] ?? "KAP", act = mine.find((m) => !m.speaker), react = mine.filter((m) => !m.speaker)[1];
      const bd = Math.max(0.8, t - start); dirs.push(...cameraDirs(cameraOf(b), who, start + lead, bd), `visual: ${VISUAL_WORD[visualOf(b)]} ${at(start)} durante ${bd.toFixed(1)}s`);   // QUÉ ocurre ≠ CÓMO se ve: cámara y nivel de animación del beat
      if (b.motion === "environment") dirs.push(`vfx: polvo ${at(start)} durante ${bd.toFixed(1)}s`);
      // la reacción de KAP al fallo/resultado se ve de cerca (corte a la reacción), en el instante en que empieza
      if (react && ["fallo", "reaccion", "descubrimiento"].includes(b.step) && b.shot !== "primer plano" && b.shot !== "objeto") dirs.push(`plano: primer plano ${who} ${at(react.at)}`);
      // sonidos que salen de cada frase de acción, en su momento
      let consequenceAt: number | undefined; const acting: number[] = [];
      if (act) for (const ss of sentenceStarts(act.text, act.dur)) { if (acts(ss.text)) acting.push(act.at + ss.t); for (const so of soundsOfSentence(ss.text, ss.dur)) { if (!snd.some((x) => x.kind === so.kind && Math.abs(x.at - (act.at + ss.t)) < 0.9)) snd.push({ kind: so.kind, at: act.at + ss.t, dur: so.dur }); } if (consequenceAt === undefined && CONSEQ.test(plain(ss.text))) consequenceAt = act.at + ss.t; }
      for (const ta of acting) if (!snd.some((x) => Math.abs(x.at - ta) < 1.4)) snd.push({ kind: "knock", at: ta });   // cada gesto con un objeto suena (un objeto que se coloca, se toca, se mueve): sin gestos mudos
      if (b.sound && b.sound !== "none" && !snd.some((x) => x.kind === (b.sound === "door" ? "door" : b.sound) && x.at >= start && x.at < t)) snd.push({ kind: b.sound, at: consequenceAt ?? start });
      if (b.music === "impact") dirs.push(`impacto: ${at(consequenceAt ?? start)}`); else if (b.music === "silence") dirs.push(`silencio: ${at(react?.at ?? start)} durante 1.5s`); else if (b.music && b.music !== "none") dirs.push(`marca-musica: ${MUSIC_WORD[b.music]} ${at(start)}`);
      const ac = ACT[b.phase]; if (!seen.has(ac) && !(pres.intro && ac === "inicio")) { seen.add(ac); memory.push(`acto: ${ac} | ${b.goal.slice(0, 140)}`); }
    });
    for (const x of snd) dirs.push(`sonido: ${SOUND_WORD[x.kind]} en ${(x.at + lead).toFixed(1)}s${x.dur ? ` durante ${x.dur.toFixed(1)}s` : ""}`);
    dirs.push(`sonido: ambiente en 0.3s durante ${Math.min(40, Math.max(3, t + 1)).toFixed(1)}s`, "montaje: continuo");   // el cuarto no está mudo entre acciones; varias acciones relacionadas en una escena
    const first = sc.beats[0], last = sc.beats.at(-1)!, loc = plain(sc.location), cut = index++ > 0;
    return { title: first.goal.slice(0, 60) || sc.location, location: sc.location, lines, memory: last === beats.at(-1) && !pres.outro ? [...memory, `gancho: ${last.change.slice(0, 240)}`] : memory, stage: ACT[first.phase], shot: first.shot === "general" ? "general" : first.shot === "primer plano" || first.shot === "objeto" ? "primer plano" : "medio", time: sc.time, interior: INDOOR.test(loc) && !OUTDOOR.test(loc), directions: dirs, change: last.change, ...(cut ? { transition: "cut" as const } : {}) } as ShortDraftScene;
  });
  const time = beats[0]?.time ?? "tarde", out = [...story];
  if (pres.intro) out.unshift(presenterScene("intro", [{ speaker: "", text: "KAP mira a cámara." }, { speaker: "KAP", text: pres.intro.trim() }], time));
  if (pres.outro) out.push(presenterScene("outro", [{ speaker: "", text: `KAP vuelve a mirar a cámara y ${pres.outro.gesto.trim().replace(/^KAP\s+/i, "").replace(/[.]+$/, "")}.` }, ...(pres.outro.texto.trim() ? [{ speaker: "KAP", text: pres.outro.texto.trim() }] : [])], time, beats.at(-1)?.change));
  return out;
}

/** Tramos de ≥ `min` s sin ningún elemento sonoro audible (acciones sonorizadas, impactos, diálogo; el ambiente de fondo no cuenta). Para revisar silencios sospechosos. */
export function audioGaps(scenes: ShortDraftScene[], min = 5): { from: number; to: number }[] {
  const ev: [number, number][] = []; let base = 0;
  for (const sc of scenes) { const D = Math.min(40, Math.max(3, sc.lines.reduce((t, l) => t + lineSeconds(l) + (l.speaker ? 0.25 : 0), 0) + 1));
    let t = 0; for (const l of sc.lines) { const d = lineSeconds(l); if (l.speaker) ev.push([base + t, base + t + d]); t += d + (l.speaker ? 0.25 : 0); }
    for (const d of sc.directions) { const m = /^(sonido|impacto): (.*?)en ([\d.]+)s(?: durante ([\d.]+)s)?/.exec(d); if (m && !/ambiente/.test(m[2] ?? "") && !/ambiente/.test(d)) ev.push([base + Number(m[3]), base + Number(m[3]) + (m[4] ? Number(m[4]) : 0.6)]); const q = /^impacto: en ([\d.]+)s/.exec(d); if (q) ev.push([base + Number(q[1]), base + Number(q[1]) + 0.6]); }
    base += D; }
  ev.sort((a, b) => a[0] - b[0]); const gaps: { from: number; to: number }[] = []; let end = 0; for (const [a, b] of ev) { if (a - end >= min) gaps.push({ from: +end.toFixed(1), to: +a.toFixed(1) }); end = Math.max(end, b); } if (base - end >= min) gaps.push({ from: +end.toFixed(1), to: +base.toFixed(1) });
  return gaps;
}
