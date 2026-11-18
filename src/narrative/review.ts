/**
 * REVISIÓN NARRATIVA sin IA (módulo puro). Detecta síntomas típicos de un guion generado «para cumplir duración»: escenas o diálogos
 * repetidos, estancamiento, personajes sin función, ausencia de conflicto o de consecuencia, ganchos genéricos, cierres moralizantes,
 * ayudas externas que resuelven el problema y falta de variedad visual. NO bloquea nada: devuelve hallazgos (crítica / aviso / info)
 * para que el usuario revise. Son HEURÍSTICAS léxicas y estructurales: avisan de sospechas, no juzgan la calidad literaria.
 */
import { norm } from "../memory/text.ts";
import { closingProblem } from "./closing.ts";

export type Severity = "error" | "warning" | "info";
export type NarrativeFinding = { severity: Severity; rule: string; text: string; scene?: number };
export const SCENE_FUNCTIONS = ["avanzar-historia", "desarrollar-personaje", "conflicto", "revelar-informacion", "preparar-consecuencia", "arco-de-kap", "preparar-gancho"] as const;
export type SceneFunction = (typeof SCENE_FUNCTIONS)[number];

export type NarrativeScene = {
  location: string; title?: string; lines: { speaker?: string; text: string }[];
  /** Solo con generador por arco: función declarada, etapa del arco, plano, momento del día, interior/exterior. */
  fn?: string; stage?: string; shot?: string; time?: string; interior?: boolean;
};
export type NarrativeInput = {
  scenes: NarrativeScene[]; hook?: string;
  /** Personajes que ya existen en la memoria/reparto (el resto, si habla, se considera «introducido» en este episodio). */
  knownCharacters?: string[]; protagonist?: string;
  /** Reparto que pedía la petición (+ último plano si continúa exactamente). Si se da, avisa de personajes de la memoria que aparecen sin haberlo pedido. */
  allowedCharacters?: string[];
  /** Escenarios de los episodios inmediatamente anteriores (para avisar si la serie repite el mismo sitio sin motivo). */
  previousEpisodes?: { locations: string[] }[];
  /** Tipos de acto declarados con directivas (inicio, conflicto…). */
  acts?: string[];
};

const STOP = new Set("para como pero porque cuando donde aunque entre sobre desde hasta esto esta este estos estas ellos ellas ella algo alguien nada todo todos toda todas tiene tienen tengo tener puede puedo puedes quiero quieres hacer hace haces voy vas van sido ser son era eran esta estoy estas estan hay muy mas menos solo sola una unos unas del los las que con sin por ese esa eso ahi aqui asi ya no si le lo la el se me te mi tu su nos".split(" "));
export const words = (s: string) => norm(s).replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter(Boolean);
export const content = (s: string) => words(s).filter((w) => w.length > 3 && !STOP.has(w));
export const jac = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const sceneText = (s: NarrativeScene) => s.lines.map((l) => l.text).join(" ");
const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Frases de manual de autoayuda: cuando abundan, el diálogo suena a eslogan y no a persona. */
export const MOTIVATIONAL = /no te rindas|no me rendir[eé]|no me dejar[eé] vencer|no me (?:voy a|pienso) rendir|nunca te rindas|no (?:voy a|pienso) rendirme|cree(?:r)? en ti|conf[ií]a en ti|tu puedes|tú puedes|puedes (?:lograrlo|hacerlo)|solo (?:es|fue) el principio|esto es solo el principio|eres m[aá]s que|sigue adelante|seguir adelante|no te detengas|no me voy a detener|todo se aprende|el camino (?:apenas|recien)|nada (?:volver[aá]|ser[aá]) igual|mi sue[ñn]o (?:no|sigue)|lo importante es (?:que )?(?:lo )?intent/i;
/** Ganchos vacíos que valen para cualquier episodio. */
export const GENERIC_HOOK = /(?:esto|eso) es solo el (?:principio|comienzo)|el camino (?:apenas )?(?:comienza|empieza)|nada volver[aá] a ser igual|el futuro (?:le )?(?:espera|aguarda)|(?:una )?nueva (?:aventura|etapa) (?:comienza|empieza)|seguir[aá] (?:adelante|luchando)|no se rendir[aá]|continuar[aá] (?:su|el) (?:camino|sue[ñn]o)|su sue[ñn]o (?:sigue|contin[uú]a) vivo|la historia contin[uú]a/i;
const MORAL = /aprendi[oó]|aprend[ií]|lecci[oó]n|ahora (?:s[eé]|entiendo|comprendo)|m[aá]s fuerte|ya no es el mismo|ya no (?:era|es) el mismo ni[ñn]o|hab[ií]a cambiado|valor (?:de|del)|nunca (?:volver[aá]|m[aá]s)/i;
const OPPOSITION = /\b(no|nunca|pero|dame|devu[eé]lve|suelta|mentira|mentiroso|d[eé]jame|vete|c[aá]llate|ladr[oó]n|robaste|robado|quita|prohib|castig|culpa|por qu[eé]|c[oó]mo te atreves)\b|[!¡]/i;
/** Abstracciones de adulto/eslogan que un niño no diría así: «mi voz va más allá», «mis sueños brillan como el sol»… */
export const ADULT_VOICE = /\bmi (?:m[uú]sica|sue[ñn]o|voz|historia|destino)\b|\bmis sue[ñn]os\b|\bel mundo\b|\bla vida\b|\bel futuro\b|\bpara siempre\b|\bbrillan?\b|\bnadie (?:podr[aá]|puede) detener/i;
const WALK = /\b(camina|caminando|camin[oó]|avanza|se aleja|regresa|vuelve a casa|recorre)\b/i;

export function reviewNarrative(inp: NarrativeInput): NarrativeFinding[] {
  const out: NarrativeFinding[] = []; const S = inp.scenes, n = S.length;
  const add = (severity: Severity, rule: string, text: string, scene?: number) => { if (!out.some((f) => f.rule === rule && f.text === text)) out.push({ severity, rule, text, ...(scene !== undefined ? { scene } : {}) }); };
  if (!n) return out;
  const kap = norm(inp.protagonist ?? "KAP"), known = new Set((inp.knownCharacters ?? []).map(norm).concat(kap));
  const sets = S.map((s) => new Set(content(sceneText(s))));

  // 1) ESCENAS REPETIDAS (casi idénticas a una anterior)
  const dupScenes = new Set<number>();
  for (let j = 1; j < n; j++) for (let i = 0; i < j; i++) if (sets[j].size >= 6 && jac(sets[i], sets[j]) >= 0.75 && !dupScenes.has(i)) { dupScenes.add(j); add("warning", "narrativa-escena-repetida", `La escena ${j + 1} repite casi literalmente la escena ${i + 1}.`, j); break; }
  if (dupScenes.size >= 3) add("error", "narrativa-bucle", `${dupScenes.size} escenas son copias de otras anteriores (escenas ${[...dupScenes].map((x) => x + 1).join(", ")}): parece un bucle de relleno, no una historia.`);

  // 2) DIÁLOGOS DUPLICADOS o casi duplicados (≥ 4 palabras)
  const lines = S.flatMap((s, si) => s.lines.filter((l) => words(l.text).length >= 4).map((l) => ({ si, text: l.text, w: new Set(words(l.text)) }))).filter((l) => !dupScenes.has(l.si));
  const used = new Set<number>();
  for (let a = 0; a < lines.length; a++) { if (used.has(a)) continue; const grp = [a];
    for (let b = a + 1; b < lines.length; b++) if (!used.has(b) && jac(lines[a].w, lines[b].w) >= 0.85) grp.push(b);
    if (grp.length >= 2) { grp.forEach((g) => used.add(g)); const sc = [...new Set(grp.map((g) => lines[g].si + 1))];
      add(grp.length >= 4 ? "error" : "warning", "narrativa-dialogo-duplicado", `La frase «${clip(lines[a].text)}» aparece ${grp.length} veces (escenas ${sc.join(", ")}).`, lines[a].si); } }

  // 3) ESTANCAMIENTO: muchas escenas seguidas en el mismo lugar sin información nueva
  const seen = new Set<string>(); const novelty = sets.map((st) => { const fresh = [...st].filter((w) => !seen.has(w)).length; st.forEach((w) => seen.add(w)); return st.size ? fresh / st.size : 0; });
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && norm(S[j + 1].location) === norm(S[i].location)) j++;
    const run = j - i + 1; if (run >= 6) { const avg = novelty.slice(i, j + 1).reduce((a, b) => a + b, 0) / run;
      if (run >= 8 || avg < 0.55) add("warning", "narrativa-localizacion-estancada", `${run} escenas seguidas (${i + 1}-${j + 1}) en «${S[i].location}»${avg < 0.55 ? " con poca información nueva" : ""}: ¿hace falta cambiar de lugar, de momento o de plano?`, i); }
    i = j + 1; }

  // 4) ESCENAS SIN APORTE: no añaden información ni desarrollo, o son un simple paseo
  S.forEach((s, i) => { if (dupScenes.has(i) || i === 0) return; const txt = sceneText(s), w = words(txt).length;
    if (sets[i].size >= 8 && novelty[i] < 0.2) add("warning", "narrativa-escena-sin-aporte", `La escena ${i + 1} no aporta información nueva respecto a las anteriores.`, i);
    else if (WALK.test(txt) && !s.lines.some((l) => l.speaker) && w < 30 && i < n - 1) add("info", "narrativa-escena-sin-aporte", `La escena ${i + 1} es solo un desplazamiento sin diálogo ni cambio: ¿se puede fusionar con la siguiente?`, i); });
  const avgWords = S.reduce((a, s) => a + words(sceneText(s)).length, 0) / n;
  if (n >= 12 && avgWords < 25) add("warning", "narrativa-escenas-fragmentadas", `${n} escenas de ≈ ${Math.round(avgWords)} palabras de media: el episodio es una lista de instantes, no escenas con desarrollo.`);

  // 5) PERSONAJES INTRODUCIDOS SIN FUNCIÓN
  const bySpeaker = new Map<string, { scenes: Set<number>; lines: number; name: string }>();
  S.forEach((s, i) => s.lines.forEach((l) => { const sp = l.speaker?.trim(); if (!sp) return; const k = norm(sp), e = bySpeaker.get(k) ?? { scenes: new Set<number>(), lines: 0, name: sp }; e.scenes.add(i); e.lines++; bySpeaker.set(k, e); }));
  for (const [k, e] of bySpeaker) { if (k === kap || e.lines > 1 || e.scenes.size > 1) continue;
    if (!known.has(k)) add("warning", "narrativa-personaje-sin-funcion", `«${e.name}» se introduce con una sola línea y no vuelve: ¿qué aporta a la historia?`, [...e.scenes][0]);
    else add("info", "narrativa-personaje-sin-funcion", `«${e.name}» (de la memoria) solo hace un cameo de una línea: ¿era necesario traerlo?`, [...e.scenes][0]); }

  // 5b) MEMORIA NO PEDIDA: personajes de episodios anteriores que aparecen sin que la petición los pidiera
  if (inp.allowedCharacters) { const ok = new Set(inp.allowedCharacters.map(norm).concat(kap));
    for (const [k, e] of bySpeaker) if (!ok.has(k) && known.has(k)) add("warning", "narrativa-memoria-no-pedida", `«${e.name}» (de la memoria) aparece en ${e.scenes.size} escena${e.scenes.size > 1 ? "s" : ""} sin que la petición lo pidiera: la memoria sirve para mantener la continuidad, no para reutilizarlo todo.`, [...e.scenes][0]); }

  // 6) SIN CONFLICTO CLARO (heurística: escenas con ≥ 2 voces y lenguaje de oposición; con arco, funciones declaradas)
  const tagged = S.some((s) => s.fn);
  // sin arco: ventanas de 3 escenas seguidas con ≥ 2 voces y ≥ 2 líneas de oposición (el enfrentamiento puede repartirse entre escenas)
  const heuristicConflict = S.some((_, i) => { const w = S.slice(i, i + 3), voices = new Set(w.flatMap((s) => s.lines.map((l) => norm(l.speaker ?? "")).filter(Boolean))); return voices.size >= 2 && w.flatMap((s) => s.lines).filter((l) => OPPOSITION.test(l.text)).length >= 2; });
  const hasConflict = tagged ? S.some((s) => s.fn === "conflicto") : heuristicConflict;
  if (!hasConflict) add("warning", "narrativa-sin-conflicto", `No se aprecia un conflicto claro (${tagged ? "ninguna escena declarada como conflicto" : "no hay un enfrentamiento entre personajes con oposición explícita"}). Heurística: revisa a mano.`);
  const kapScenes = S.filter((s) => s.lines.some((l) => norm(l.speaker ?? "") === kap)).length;
  if (kapScenes < Math.ceil(n / 3)) add("info", "narrativa-protagonista-ausente", `KAP habla en solo ${kapScenes} de ${n} escenas.`);

  // 7) SIN CONSECUENCIA: el último tercio no cambia nada respecto al resto
  if (n >= 6) { const tail = novelty.slice(Math.floor((n * 2) / 3)), avg = tail.reduce((a, b) => a + b, 0) / tail.length, hasCons = tagged ? S.some((s) => s.fn === "preparar-consecuencia" || s.stage === "consecuencia") : (inp.acts ?? []).includes("resolucion");
    if (avg < 0.3 || (tagged && !hasCons)) add("warning", "narrativa-sin-consecuencia", `El final no muestra una consecuencia nueva de lo ocurrido${avg < 0.3 ? " (el último tercio repite lo anterior)" : " (ninguna escena declarada como consecuencia)"}.`); }

  // 8) GANCHO
  const hook = inp.hook?.trim(), lastText = sceneText(S[n - 1]);
  if (!hook) add("warning", "narrativa-gancho-generico", "El episodio no declara gancho para el siguiente.");
  else if (GENERIC_HOOK.test(hook) || words(hook).length < 5) add("warning", "narrativa-gancho-generico", `Gancho genérico o demasiado corto: «${clip(hook, 100)}». Debería dejar una consecuencia, pregunta, descubrimiento o decisión concretos.`);
  else { const body = new Set(S.flatMap((s) => content(sceneText(s)))); if (!content(hook).some((w) => body.has(w))) add("info", "narrativa-gancho-generico", `El gancho no se apoya en nada de lo que ocurre en el episodio: «${clip(hook, 100)}».`); }
  if (GENERIC_HOOK.test(lastText)) add("warning", "narrativa-gancho-generico", "La última escena cierra con una frase genérica («esto es solo el principio»…).", n - 1);

  // 9) DIÁLOGO: frases de autoayuda y cierre moralizante
  const motiv = S.flatMap((s, i) => s.lines.filter((l) => MOTIVATIONAL.test(l.text)).map(() => i));
  if (motiv.length >= 3) add("warning", "narrativa-dialogo-motivacional", `${motiv.length} frases de tipo «no te rindas / cree en ti / solo es el principio» (escenas ${[...new Set(motiv.map((x) => x + 1))].join(", ")}): suenan a eslogan, no a personajes.`);
  const finale = S.slice(-2).map(sceneText).join(" ");
  if (MORAL.test(finale) || S.slice(-2).some((s) => s.lines.some((l) => MOTIVATIONAL.test(l.text)))) add("info", "narrativa-cierre-moralizante", "El cierre tiene tono de lección o superación. No todos los episodios deben terminar con KAP más fuerte: ¿encaja con lo que pasa?", n - 1);

  // 10) AYUDA EXTERNA: un personaje que entra tarde y resuelve (heurística con arco)
  if (tagged) { const decision = S.findIndex((s) => s.stage === "decision"); if (decision >= 0) {
    const early = new Set(S.slice(0, decision + 1).flatMap((s) => s.lines.map((l) => norm(l.speaker ?? "")).filter(Boolean)));
    S.forEach((s, i) => { if (i <= decision) return; if (s.stage !== "consecuencia" && s.stage !== "resolucion") return;
      for (const l of s.lines) { const k = norm(l.speaker ?? ""); if (k && k !== kap && !early.has(k)) { add("warning", "narrativa-ayuda-externa", `«${l.speaker}» entra después de la decisión de KAP y aparece en la resolución: ¿resuelve el problema por él?`, i); early.add(k); } } }); } }

  // 11) VARIEDAD VISUAL (solo con arco: lugar, momento, interior/exterior, plano)
  if (tagged && n >= 6) { const frac = (xs: (string | boolean | undefined)[]) => { const m = new Map<string, number>(); xs.forEach((x) => x !== undefined && m.set(String(x), (m.get(String(x)) ?? 0) + 1)); return Math.max(0, ...m.values()) / n; };
    if (frac(S.map((s) => norm(s.location))) > 0.7) add("info", "narrativa-poca-variedad-visual", "Más del 70 % de las escenas ocurren en el mismo lugar.");
    if (S.every((s) => s.time) && frac(S.map((s) => norm(s.time!))) === 1) add("info", "narrativa-poca-variedad-visual", "Todo el episodio ocurre en el mismo momento del día.");
    if (S.every((s) => s.shot) && frac(S.map((s) => norm(s.shot!))) > 0.7) add("info", "narrativa-poca-variedad-visual", "Más del 70 % de las escenas usan el mismo tipo de plano."); }

  // 12) PERSONAJE REACTIVO: habla solo con interjecciones/preguntas cortas y no hace nada propio
  for (const [k, e] of bySpeaker) { if (k === kap || e.lines < 3) continue;
    const mine = S.flatMap((s) => s.lines.filter((l) => norm(l.speaker ?? "") === k)); if (mine.every((l) => words(l.text).length <= 5)) add("warning", "narrativa-personaje-reactivo", `«${e.name}» habla ${e.lines} veces con frases de ≤ 5 palabras y no decide ni hace nada propio: ¿es solo un espejo de KAP?`, [...e.scenes][0]); }

  // 13) VOZ DE ADULTO: KAP suena a eslogan o a adulto que conoce su futuro
  const kapLines = S.flatMap((s, i) => s.lines.filter((l) => norm(l.speaker ?? "") === kap).map((l) => ({ i, t: l.text }))), adult = kapLines.filter((l) => ADULT_VOICE.test(l.t) || MOTIVATIONAL.test(l.t));
  if (adult.length >= 3) add("warning", "narrativa-voz-adulta", `${adult.length} líneas de KAP suenan a eslogan o a adulto («mi voz», «mis sueños», «el futuro»…; escenas ${[...new Set(adult.map((x) => x.i + 1))].join(", ")}): ¿habla como un niño de su etapa?`);

  // 14) SERIE: el mismo escenario dominante en varios episodios seguidos
  if (inp.previousEpisodes?.length) { const dom = (ls: string[]) => { const m = new Map<string, number>(); ls.forEach((l) => m.set(norm(l), (m.get(norm(l)) ?? 0) + 1)); const [k, v] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0]; return { k, share: ls.length ? v / ls.length : 0 }; };
    const cur = dom(S.map((s) => s.location)), prev = inp.previousEpisodes.map((e) => dom(e.locations));
    if (cur.share >= 0.7 && prev.some((p) => p.k === cur.k && p.share >= 0.5)) add("warning", "narrativa-serie-repite-escenario", `Este episodio y alguno de los anteriores ocurren sobre todo en «${cur.k}»: ¿hay motivo narrativo para no cambiar de espacio?`); }
  const cl = closingProblem(S[n - 1].lines.map((l) => ({ speaker: l.speaker, text: l.text })), inp.protagonist); if (cl) add("warning", "narrativa-cierre-reflexivo", `${cl.reason}: el cierre debería ser un gag, una reacción, una sorpresa o una consecuencia, no una reflexión.`, n - 1);
  return out;
}

export const countBySeverity = (fs: NarrativeFinding[]) => ({ error: fs.filter((f) => f.severity === "error").length, warning: fs.filter((f) => f.severity === "warning").length, info: fs.filter((f) => f.severity === "info").length });
