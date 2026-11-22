/**
 * SHORT VIRAL DE KAP (núcleo puro). KAP es el PROTAGONISTA y el presentador: el hilo conductor del vídeo (habla a cámara, vive el problema, reacciona, se equivoca, entiende, prueba
 * otra cosa y remata). Un Short de 20-60 s son 8-14 ESCENAS ilustradas de tipos variados; la imagen DEMUESTRA lo que se dice (ACCIÓN > IMAGEN > DIÁLOGO > EXPLICACIÓN).
 * Estructura en bloques: HOOK → PROBLEMA → EJEMPLO → CONSECUENCIA → REALIZACIÓN → NUEVA ESTRATEGIA → RESULTADO → CIERRE.
 * Aquí viven: tipos de escena, escena y pack, regla de aparición de KAP, errores de estructura, «¿qué le pasa a KAP y qué hace diferente?» (listo/no listo) y el
 * VISUAL RHYTHM CHECK (avisos de calidad, no reglas rígidas).
 */
export const SCENE_TYPES = ["KAP_PRESENTADOR", "KAP_EXAMPLE", "CINEMATIC_SCENE", "POV", "REACTION", "VISUAL_METAPHOR", "BRAIN_VISUALIZATION", "BEFORE_AFTER", "OBJECT_METAPHOR", "TRANSFORMATION", "DETAIL_SHOT", "ENVIRONMENT", "INFOGRAPHIC"] as const;
export type SceneType = (typeof SCENE_TYPES)[number];
export const BLOCKS = ["HOOK", "PROBLEMA", "EJEMPLO", "CONSECUENCIA", "REALIZACION", "NUEVA_ESTRATEGIA", "RESULTADO", "CIERRE"] as const;
export type Block = (typeof BLOCKS)[number];
export const SHOT_TYPES = ["wide", "medium", "close-up", "detail", "side", "over-shoulder", "low-angle", "top-down", "pov"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];
/** Por qué entra KAP en una escena (si no hay una de estas razones, KAP no entra). */
export const KAP_REASONS = ["opinion", "reaccion", "humor", "explicacion", "transicion", "hook", "cierre", "ejemplo", "decision"] as const;
export type KapReason = (typeof KAP_REASONS)[number];
/** Movimiento que la escena admite en el montaje (no depende de animación compleja: imagen + cámara + edición). */
export const MOTION_KINDS = ["zoom-in", "zoom-out", "pan", "parallax", "slide", "rotate", "appear", "scale-change", "loop", "particles", "light", "object-move"] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];
export const HOOK_TYPES = ["pregunta-incomoda", "contradiccion", "situacion-reconocible", "afirmacion-inesperada", "error-comun", "mini-historia", "curiosidad", "consecuencia"] as const;
export type HookType = (typeof HOOK_TYPES)[number];
export const SUBTITLE_SPACE = ["top", "bottom", "left", "right", "none"] as const;

export type VisualScene = {
  n: number; block: Block; sceneType: SceneType; duration: number;
  /** ¿Aparece KAP? Por qué (kapReason), qué hace (action) y qué aporta (kapAdds): si no hay respuesta, KAP no entra. */
  kapPresent: boolean; kapReason?: KapReason; kapWhy?: string; kapAdds?: string;
  /** Qué hace KAP (o el sujeto principal) en la escena. */ action: string;
  /** Qué cambia visualmente (la acción visual: para el ritmo y el montaje). */ visualAction: string;
  /** Descripción visual (se dibuja, NO se dice). */ visual: string;
  /** La misma ilustración en inglés, una frase: la acción exacta para el generador de imágenes. */ visualEn: string;
  bodyLanguageEn?: string; environmentEn?: string; depthEn?: string;
  camera: string; composition: string; lighting: string;
  /** Lo que dice KAP (KAP_DIALOGUE). Preferente al narrador. */ dialogue?: string;
  /** Narración externa, solo cuando es realmente necesaria. */ narration?: string;
  /** Escena sin voz a propósito (el silencio o el sonido también cuentan). */ silent?: boolean;
  subtitle: string; soundEffect: string; transition: string; purpose: string;
  motionKinds: MotionKind[]; motionPrompt: string;
  characters: string[]; location: string; shot: ShotType; emotion: string;
  objects?: string[]; contrast?: string;
  /** Escena de dos personajes conversando entre sí (se penaliza como estructura dominante). */ conversation?: boolean;
  /** Una pausa de más de 6 s o de menos de 1,5 s necesita una función narrativa. */ pauseWhy?: string;
  subtitleSpace?: (typeof SUBTITLE_SPACE)[number];
};
export type Claim = { text: string; type: "fact" | "opinion"; needsVerification: boolean };
export type MusicCue = { atScene: number; change: "start" | "build" | "tension" | "drop" | "resolve" | "fade" | "silence"; note: string };
export type ShortPack = {
  idea: { topic: string; category: string; approaches: string[]; conflict: string; visualExample: string; solution: string; closing: string; whyItWorks: string; claims: Claim[] };
  hooks: { type: HookType; text: string }[]; chosenHook: number;
  scenes: VisualScene[];
  music: { mood: string; cues: MusicCue[] };
};

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const wordCount = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
const stems = (t: string) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5)));
const jac = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
/** Lo que se dice en la escena (KAP + narrador). */
export const spoken = (s: VisualScene) => [s.dialogue, s.narration].filter((x) => x && x.trim()).join(" ").trim();
/** Segundos de voz (≈ 2,6 palabras/s). */
export const speechSeconds = (t: string) => (t.trim() ? Math.round((wordCount(t) / 2.6 + 0.4) * 10) / 10 : 0);
export const totalSeconds = (s: VisualScene[]) => Math.round(s.reduce((n, x) => n + x.duration, 0) * 10) / 10;
export const BANNED_OPENINGS = /^\s*(?:hola\b|hoy vamos a hablar|en este v[ií]deo|te voy a explicar|bienvenid|vamos a ver|antes de empezar)/i;
const isKap = (c: string) => c.trim().toUpperCase() === "KAP";

/** Sugiere el tipo de escena a partir de su contenido (cuando el guionista no lo indica). */
export function suggestSceneType(s: Pick<VisualScene, "visual" | "characters" | "shot" | "kapPresent"> & { dialogue?: string }): SceneType {
  const v = plain(s.visual);
  if (s.kapPresent && /\b(?:a camara|mira a camara|presenta)\b/.test(v)) return "KAP_PRESENTADOR";
  if (/\b(?:cerebro|neurona|mente por dentro|sala de control|imagina|pensamientos)\b/.test(v)) return "BRAIN_VISUALIZATION";
  if (/\b(?:antes\b.*\bdespues|a la izquierda.*a la derecha|comparacion|dividid[oa])\b/.test(v)) return "BEFORE_AFTER";
  if (s.shot === "pov" || /\b(?:pov|desde los ojos|vista en primera persona)\b/.test(v)) return "POV";
  if (/\b(?:se convierte|se transforma|se pliega|sale del circulo|se deshace)\b/.test(v)) return "TRANSFORMATION";
  if (/\b(?:grafico|esquema|infografia|barras|diagrama|dato)\b/.test(v)) return "INFOGRAPHIC";
  if (/\b(?:metafora|simboliz|representa|atrapad[oa])\b/.test(v)) return "VISUAL_METAPHOR";
  if (/\b(?:expresion cambia|levanta las cejas|se sorprende|reacciona)\b/.test(v)) return "REACTION";
  if (s.shot === "detail" || (s.shot === "close-up" && s.characters.length === 0)) return "DETAIL_SHOT";
  if (s.characters.length === 0) return "ENVIRONMENT";
  return s.kapPresent ? "KAP_EXAMPLE" : "CINEMATIC_SCENE";
}

// ---------------------------------------------------------------- estructura (errores) y regla de aparición de KAP
export type Issue = { id: string; message: string; scenes?: number[] };
/** ERRORES de estructura: 8-14 escenas y todos los campos de la escena. Un storyboard con errores no se exporta; los avisos de ritmo no lo bloquean. */
export function structureErrors(scenes: VisualScene[]): Issue[] {
  const e: Issue[] = [];
  if (scenes.length < 8 || scenes.length > 14) e.push({ id: "numero-escenas", message: `hay ${scenes.length} escenas (debe haber entre 8 y 14)` });
  scenes.forEach((s, i) => {
    const bad = (m: string) => e.push({ id: "campo", message: `escena ${s.n}: ${m}`, scenes: [s.n] });
    if (s.n !== i + 1) bad(`el orden no es correlativo (n=${s.n}, posición ${i + 1})`);
    if (!SCENE_TYPES.includes(s.sceneType)) bad(`tipo de escena inválido «${s.sceneType}»`);
    if (!BLOCKS.includes(s.block)) bad(`bloque inválido «${s.block}»`);
    if (!s.action.trim()) bad("falta qué hace KAP (action)");
    if (wordCount(s.visual) < 8) bad("falta la descripción visual (≥ 8 palabras)");
    if (wordCount(s.visualEn) < 10) bad("falta la descripción de imagen en inglés (≥ 10 palabras)");
    if (!spoken(s) && !s.silent) bad("no tiene voz ni está marcada como silenciosa a propósito (silent)");
    if (!s.location.trim() || !s.emotion.trim() || !s.purpose.trim()) bad("faltan lugar, emoción o propósito");
    if (!SHOT_TYPES.includes(s.shot)) bad(`plano inválido «${s.shot}»`);
    if (!(s.duration > 0)) bad("la duración debe ser mayor que 0");
    if (!s.subtitle.trim()) bad("falta el subtítulo");
    if (!s.visualAction.trim()) bad("falta qué cambia visualmente (visualAction)");
    if (!s.camera.trim() || !s.composition.trim() || !s.lighting.trim()) bad("faltan cámara, composición o iluminación");
    if (!s.transition.trim()) bad("falta la transición");
    if (!s.motionKinds?.length || s.motionKinds.some((k) => !MOTION_KINDS.includes(k)) || !s.motionPrompt.trim()) bad("falta el movimiento sugerido (motionKinds + motionPrompt)");
  });
  e.push(...kapIssues(scenes)); return e;
}

/** REGLA DE APARICIÓN DE KAP: KAP es el hilo conductor, pero NO entra «porque toca». Cada aparición declara qué hace, por qué entra (razón) y qué aporta; y es coherente con sus personajes y su voz. */
export function kapIssues(scenes: VisualScene[]): Issue[] {
  const e: Issue[] = [];
  for (const s of scenes) {
    const inCast = s.characters.some(isKap);
    if (s.kapPresent) {
      if (!s.kapReason || !KAP_REASONS.includes(s.kapReason)) e.push({ id: "kap-sin-razon", message: `escena ${s.n}: KAP aparece sin justificar (${KAP_REASONS.join(", ")})`, scenes: [s.n] });
      else if (wordCount(s.kapWhy ?? "") < 3) e.push({ id: "kap-sin-razon", message: `escena ${s.n}: KAP aparece por «${s.kapReason}» pero no explica por qué (kapWhy)`, scenes: [s.n] });
      if (wordCount(s.kapAdds ?? "") < 3) e.push({ id: "kap-sin-aportar", message: `escena ${s.n}: KAP aparece pero no declara qué aporta (kapAdds): si no aporta, se elimina su aparición`, scenes: [s.n] });
      if (!inCast) e.push({ id: "kap-incoherente", message: `escena ${s.n}: kapPresent=true pero KAP no está en sus personajes`, scenes: [s.n] });
    } else if (inCast) e.push({ id: "kap-incoherente", message: `escena ${s.n}: KAP está en sus personajes pero kapPresent=false`, scenes: [s.n] });
    if ((s.sceneType === "KAP_PRESENTADOR" || s.sceneType === "KAP_EXAMPLE") && !s.kapPresent) e.push({ id: "kap-incoherente", message: `escena ${s.n}: ${s.sceneType} sin KAP`, scenes: [s.n] });
    if (s.sceneType === "KAP_PRESENTADOR" && !(s.dialogue ?? "").trim()) e.push({ id: "kap-incoherente", message: `escena ${s.n}: KAP_PRESENTADOR sin frase de KAP (KAP habla a cámara)`, scenes: [s.n] });
    if (s.kapReason === "hook" && s.n > 2) e.push({ id: "kap-razon-fuera-de-sitio", message: `escena ${s.n}: «hook» solo vale al principio`, scenes: [s.n] });
    if (s.kapReason === "cierre" && s.n < scenes.length - 1) e.push({ id: "kap-razon-fuera-de-sitio", message: `escena ${s.n}: «cierre» solo vale al final`, scenes: [s.n] });
  }
  return e;
}

// ---------------------------------------------------------------- «¿Qué le pasa a KAP y qué hace diferente después de entenderlo?»
/** Si no hay respuesta clara, el Short NO está listo: bloques en orden, KAP viviendo el ejemplo, una estrategia DISTINTA y un resultado visible (antes/después). */
export function readinessIssues(scenes: VisualScene[]): Issue[] {
  const e: Issue[] = [], at = (b: Block) => scenes.filter((s) => s.block === b), order = scenes.map((s) => BLOCKS.indexOf(s.block));
  for (const b of BLOCKS) if (!at(b).length) e.push({ id: "listo-bloque", message: `falta el bloque ${b}` });
  if (order.some((x, i) => i && x < order[i - 1])) e.push({ id: "listo-orden", message: "los bloques no siguen el orden HOOK → PROBLEMA → EJEMPLO → CONSECUENCIA → REALIZACIÓN → NUEVA ESTRATEGIA → RESULTADO → CIERRE" });
  for (const b of ["EJEMPLO", "NUEVA_ESTRATEGIA", "RESULTADO"] as Block[]) if (at(b).length && !at(b).some((s) => s.kapPresent)) e.push({ id: "listo-kap", message: `en ${b} no aparece KAP viviendo la situación: ¿qué le pasa a KAP y qué hace diferente?`, scenes: at(b).map((s) => s.n) });
  const ex = at("EJEMPLO").concat(at("CONSECUENCIA")).map((s) => s.action).join(" "), st = at("NUEVA_ESTRATEGIA").map((s) => s.action).join(" ");
  if (ex && st && jac(stems(ex), stems(st)) >= 0.6) e.push({ id: "listo-estrategia", message: "la nueva estrategia de KAP repite lo que hacía antes: debe hacer algo DIFERENTE" });
  if (at("RESULTADO").length && !scenes.some((s) => s.sceneType === "BEFORE_AFTER" || (s.contrast ?? "").trim())) e.push({ id: "listo-contraste", message: "no se ve el contraste antes/después (BEFORE_AFTER o contraste explícito)" });
  return e;
}

// ---------------------------------------------------------------- VISUAL RHYTHM CHECK (avisos)
export type RhythmWarning = { id: string; message: string; scenes?: number[] };
const ACTION = /\b(?:crece\w*|se (?:convierte|transforma|rompe|llena|vacia|pliega|encoge|apaga|enciende|abre|cierra|hace|desmorona|acerca|aleja|desinfla|libera)\w*|cambia\w*|aparece\w*|desaparece\w*|vuela\w*|cae\w*|sube\w*|baja\w*|borra\w*|escribe\w*|pulsa\w*|envia\w*|gira\w*|avanza\w*|salta\w*|lanza\w*|abre\w*|cierra\w*|tacha\w*|levanta\w*|encoge\w*|parpadea\w*|suena\w*|vibra\w*|brilla\w*|llena\w*|vacia\w*|corre\w*|tira\w*|mueve\w*|apila\w*|coloca\w*|pasa\w*|desliza\w*|deja\w*|sale\w*|camina\w*|entrena\w*|estudia\w*|toca\w*|comprueba\w*|teclea\w*|multiplic\w*|rodea\w*|flota\w*|estalla\w*)\b/;
const STATIC = /\b(?:sentad[oa]|de pie|posa\w*|quiet[oa]|inmovil\w*|parad[oa]|esta\b)\b/;
const CONTRAST = /\b(?:frente a|versus|mientras que|en cambio|a la izquierda|a la derecha|antes\b|despues\b|por un lado|por otro|diminut[oa]|gigante|enorme|minuscul[oa]|vac[ií][oa]\b.*\bllen[oa]|luz\b.*\bsombra|oscur\w+.*\bluz|encerrad[oa].*\bsal[ei]|atrapad[oa].*\bsal[ei])\b/;
const CHANGE = /\b(?:se (?:convierte|transforma|rompe|llena|vacia|pliega|encoge|apaga|enciende|desmorona|hace|libera|desinfla)\w*|crece\w*|cambia\w*|aparece\w*|desaparece\w*|sale del\w*|multiplic\w*)\b/;
const CLICHE_END = /\b(?:tu puedes con todo|cree en ti|nada es imposible|todo es posible|la mejor version de ti|el exito|sal de tu zona de confort|lo importante es|nunca te rindas|persigue tus suenos|el secreto)\b/;
const ABSTRACT = /\b(?:la sociedad actual|en la vida|el sentido de|la esencia|el camino hacia|trabajar en tu autoestima|debes trabajar|tienes que ser|el crecimiento personal es)\b/;
const isStatic = (s: VisualScene) => !s.visualAction.trim() || (STATIC.test(plain(s.visualAction)) && !ACTION.test(plain(s.visualAction)));
const hasAction = (s: VisualScene) => ACTION.test(plain(s.visualAction)) || ACTION.test(plain(s.action));
const hasContrast = (s: VisualScene) => s.sceneType === "BEFORE_AFTER" || !!s.contrast?.trim() || CONTRAST.test(plain(`${s.visual} ${s.visualAction}`));
const hasChange = (s: VisualScene) => s.sceneType === "TRANSFORMATION" || s.sceneType === "BEFORE_AFTER" || CHANGE.test(plain(`${s.visualAction}`));
const runs = (xs: boolean[], min: number): number[][] => { const out: number[][] = []; let cur: number[] = []; xs.forEach((x, i) => { if (x) cur.push(i); else { if (cur.length >= min) out.push(cur); cur = []; } }); if (cur.length >= min) out.push(cur); return out; };
const ns = (s: VisualScene[], idx: number[]) => idx.map((i) => s[i].n);
const sameRuns = (key: (s: VisualScene) => string, s: VisualScene[], min: number) => { const out: number[][] = []; let cur = [0]; for (let i = 1; i <= s.length; i++) { if (i < s.length && key(s[i]) === key(s[i - 1])) cur.push(i); else { if (cur.length >= min) out.push(cur); cur = [i]; } } return out; };
const share = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0]; };
function windows(s: VisualScene[], size: number): VisualScene[][] { const out: VisualScene[][] = []; for (let i = 0; i + size <= s.length; i++) out.push(s.slice(i, i + size)); return out; }

/** Avisos de ritmo visual y de retención (guía, no reglas rígidas: un storyboard bueno puede tener alguno). Devuelve [] si el ritmo es sano. */
export function visualRhythmCheck(scenes: VisualScene[]): RhythmWarning[] {
  const w: RhythmWarning[] = [], n = scenes.length; if (!n) return [{ id: "vacio", message: "no hay escenas" }];
  if (scenes[0].duration > 4) w.push({ id: "hook-lento", message: "el primer segundo debe llamar la atención: la primera escena dura demasiado (el hook va de 0 a 3 s)", scenes: [1] });
  const st = scenes.map(isStatic);
  if (st.filter(Boolean).length / n > 0.35 || runs(st, 3).length) w.push({ id: "escenas-estaticas", message: "demasiadas escenas estáticas (sin nada que cambie o se mueva en la imagen)", scenes: scenes.filter((_, i) => st[i]).map((s) => s.n) });
  const quiet = scenes.filter((s) => s.kapPresent && isStatic(s)); if (quiet.length >= 2) w.push({ id: "kap-quieto", message: "KAP está quieto en varias escenas: KAP hace cosas (escribe, borra, reacciona, se equivoca, decide)", scenes: quiet.map((s) => s.n) });
  const conv = scenes.map((s) => !!s.conversation);
  if (conv.filter(Boolean).length / n > 0.25 || runs(conv, 2).length) w.push({ id: "demasiados-dialogos", message: "demasiadas escenas de personajes hablando entre sí: que la imagen demuestre en vez de conversar", scenes: scenes.filter((s) => s.conversation).map((s) => s.n) });
  const kp = scenes.map((s) => s.sceneType === "KAP_PRESENTADOR");
  if (runs(kp, 2).length || kp.filter(Boolean).length / n > 0.4) w.push({ id: "kap-presentando-demasiado", message: "KAP habla a cámara demasiado seguido o en demasiadas escenas: alterna con KAP viviendo el ejemplo, POV, detalles y metáforas", scenes: scenes.filter((_, i) => kp[i]).map((s) => s.n) });
  const absent = scenes.map((s) => !s.kapPresent), longAbsent = runs(absent, 4);
  if (longAbsent.length || scenes.filter((s) => s.kapPresent).length / n < 0.4) w.push({ id: "kap-ausente", message: "KAP desaparece demasiado tiempo: es el protagonista y el hilo conductor, no un narrador invisible", scenes: longAbsent.flatMap((r) => ns(scenes, r)) });
  const sameShot = sameRuns((s) => s.shot, scenes, 3), [topShot, topShotN] = share(scenes.map((s) => s.shot));
  if (sameShot.length || topShotN / n > 0.5) w.push({ id: "planos-iguales", message: `demasiados planos iguales (${topShot} × ${topShotN}): alterna general, medio, primer plano, detalle y POV`, scenes: sameShot.flatMap((r) => ns(scenes, r)) });
  const closeN = scenes.filter((s) => s.shot === "close-up").length; if (closeN / n > 0.4) w.push({ id: "primeros-planos", message: `demasiados primeros planos (${closeN} de ${n}): el mundo debe sentirse grande (generales, cambios de escala)`, scenes: scenes.filter((s) => s.shot === "close-up").map((s) => s.n) });
  const loc = scenes.filter((s) => s.sceneType !== "KAP_PRESENTADOR"), sameLoc = sameRuns((s) => plain(s.location), loc, 3), [topLoc, topLocN] = share(loc.map((s) => plain(s.location)));
  if (sameLoc.length || (loc.length >= 4 && topLocN / loc.length > 0.5)) w.push({ id: "escenarios-repetidos", message: `el escenario «${topLoc}» se repite demasiado: cambia de entorno, de escala o de punto de vista`, scenes: loc.filter((s) => plain(s.location) === topLoc).map((s) => s.n) });
  const noAct = windows(scenes, 4).filter((win) => win.every((s) => !hasAction(s))); if (noAct.length) w.push({ id: "sin-accion-visual", message: "tramo de 4 escenas sin ninguna acción visual (nadie hace nada y nada cambia)", scenes: noAct[0].map((s) => s.n) });
  const noContrast = windows(scenes, 5).filter((win) => win.every((s) => !hasContrast(s))); if (noContrast.length) w.push({ id: "sin-contraste", message: "tramo de 5 escenas sin contraste (antes/después, cambio de escala, luz/sombra, vacío/lleno…)", scenes: noContrast[0].map((s) => s.n) });
  const noChange = windows(scenes, 6).filter((win) => win.every((s) => !hasChange(s))); if (noChange.length) w.push({ id: "sin-transformacion", message: "demasiado tiempo sin una transformación o cambio visual", scenes: noChange[0].map((s) => s.n) });
  const lit = scenes.filter((s) => !["KAP_PRESENTADOR", "VISUAL_METAPHOR", "OBJECT_METAPHOR", "BRAIN_VISUALIZATION", "TRANSFORMATION"].includes(s.sceneType) && spoken(s) && jac(stems(spoken(s)), stems(s.visual)) >= 0.45 && !CHANGE.test(plain(s.visualAction)));
  if (lit.length) w.push({ id: "ilustra-literal", message: "escenas que solo ilustran literalmente la frase sin aportar nada (una metáfora, un contraste o un cambio lo harían más rico)", scenes: lit.map((s) => s.n) });
  const abstr = scenes.filter((s) => ABSTRACT.test(plain(spoken(s)))); if (abstr.length) w.push({ id: "explicacion-abstracta", message: "explicación abstracta: no digas lo que puedes mostrar; busca la imagen que lo demuestre", scenes: abstr.map((s) => s.n) });
  const last = spoken(scenes[n - 1]); if (last && CLICHE_END.test(plain(last))) w.push({ id: "final-generico", message: "el final suena a cliché de motivación: busca una observación, una pregunta, un remate seco o una acción concreta", scenes: [n] });
  const [topType, topTypeN] = share(scenes.map((s) => s.sceneType)), kinds = new Set(scenes.map((s) => s.sceneType)).size;
  if (kinds < Math.min(5, Math.ceil(n / 2)) || topTypeN / n > 0.35) w.push({ id: "poca-variedad", message: `poca variedad de tipos de escena (${kinds} tipos; «${topType}» × ${topTypeN})` });
  const odd = scenes.filter((s) => (s.duration < 1.5 || s.duration > 6) && !(s.pauseWhy ?? "").trim()); if (odd.length) w.push({ id: "duracion-escena", message: "escenas fuera de 1,5-6 s sin una pausa con función narrativa (pauseWhy)", scenes: odd.map((s) => s.n) });
  const total = totalSeconds(scenes); if (total < 20 || total > 60) w.push({ id: "duracion", message: `dura ${total} s (objetivo 20-60 s)` });
  const tight = scenes.filter((s) => s.duration < speechSeconds(spoken(s)) * 0.85); if (tight.length) w.push({ id: "duracion-ajustada", message: "la duración de la escena es menor que lo que dura su voz", scenes: tight.map((s) => s.n) });
  const sfx = scenes.filter((s) => s.soundEffect.trim()).length; if (n >= 8 && sfx / n > 0.85) w.push({ id: "sfx-saturado", message: "efectos de sonido en casi todas las escenas: el silencio también es un recurso" });
  return w;
}
