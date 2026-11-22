/**
 * SHORT EDUCATIVO VISUAL (núcleo puro). Un Short de 30-60 s se cuenta con 8-14 ESCENAS ilustradas de tipos variados; KAP es el presentador e identidad del canal y entra
 * solo cuando aporta (hook, opinión, reacción, humor, explicación, transición o cierre), no en todas las escenas. La narración explica mientras la imagen DEMUESTRA.
 * Aquí viven: los tipos de escena, la escena y el pack, la regla de aparición de KAP (errores de estructura) y el VISUAL RHYTHM CHECK (avisos de calidad, no reglas rígidas).
 */
export const SCENE_TYPES = ["KAP_PRESENTADOR", "CINEMATIC_SCENE", "VISUAL_METAPHOR", "BRAIN_VISUALIZATION", "BEFORE_AFTER", "POV", "OBJECT_METAPHOR", "TRANSFORMATION", "REACTION", "INFOGRAPHIC", "ENVIRONMENT", "DETAIL_SHOT"] as const;
export type SceneType = (typeof SCENE_TYPES)[number];
export const SHOT_TYPES = ["wide", "medium", "close-up", "detail", "side", "over-shoulder", "low-angle", "top-down", "pov"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];
/** Por qué entra KAP en una escena (si no hay una de estas razones, KAP no entra). */
export const KAP_REASONS = ["opinion", "reaccion", "humor", "explicacion", "transicion", "hook", "cierre"] as const;
export type KapReason = (typeof KAP_REASONS)[number];
export const HOOK_TYPES = ["curiosity-gap", "contradiccion", "pregunta-incomoda", "situacion-reconocible", "revelacion", "historia", "afirmacion-inesperada"] as const;
export type HookType = (typeof HOOK_TYPES)[number];
export const SUBTITLE_SPACE = ["top", "bottom", "left", "right", "none"] as const;

export type VisualScene = {
  n: number; sceneType: SceneType;
  /** Lo que se DICE (voz): nunca una instrucción visual. */ narration: string;
  /** Lo que se DIBUJA (en español, para el guionista y el montaje): nunca se pronuncia. */ visual: string;
  /** La misma ilustración, en inglés y en una sola frase para el generador de imágenes. */ visualEn: string;
  characters: string[]; location: string; shot: ShotType; emotion: string; purpose: string;
  /** Segundos que la imagen está en pantalla (≈ lo que dura su narración). */ duration: number;
  /** Texto en pantalla (corto). */ subtitle: string;
  kapPresent: boolean; kapReason?: KapReason; kapWhy?: string;
  /** Qué cambia o se mueve en la imagen: la acción visual (para el montaje y para el ritmo). */ visualAction: string;
  camera?: string; composition?: string; lighting?: string; objects?: string[]; contrast?: string;
  /** Escena en la que dos personajes conversan (se penaliza como estructura dominante). */ dialogue?: boolean;
  subtitleSpace?: (typeof SUBTITLE_SPACE)[number];
};
export type ShortPack = {
  idea: { title: string; category: string; premise: string; whyItWorks: string; claims?: string[] };
  hooks: { type: HookType; text: string }[]; chosenHook: number;
  scenes: VisualScene[];
};

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
const stems = (t: string) => new Set(plain(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5)));
const jac = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
/** Segundos de voz de una narración (≈ 2,6 palabras/s). */
export const narrationSeconds = (t: string) => Math.round((words(t) / 2.6 + 0.4) * 10) / 10;
export const totalSeconds = (s: VisualScene[]) => Math.round(s.reduce((n, x) => n + x.duration, 0) * 10) / 10;
/** Arranques prohibidos del hook (relleno de presentador). */
export const BANNED_OPENINGS = /^\s*(?:hola\b|hoy vamos a hablar|en este v[ií]deo|te voy a explicar|bienvenid|vamos a ver|antes de empezar)/i;

/** Sugiere el tipo de escena a partir de su contenido (para cuando el guionista no lo indica). */
export function suggestSceneType(s: Pick<VisualScene, "visual" | "characters" | "shot" | "kapPresent">): SceneType {
  const v = plain(s.visual);
  if (s.kapPresent && /\b(?:a camara|mira a camara|presenta)\b/.test(v)) return "KAP_PRESENTADOR";
  if (/\b(?:cerebro|neurona|mente por dentro|sala de control)\b/.test(v)) return "BRAIN_VISUALIZATION";
  if (/\b(?:antes\b.*\bdespues|a la izquierda.*a la derecha|comparacion|dividid[oa])\b/.test(v)) return "BEFORE_AFTER";
  if (s.shot === "pov" || /\b(?:pov|desde los ojos|vista en primera persona)\b/.test(v)) return "POV";
  if (/\b(?:se convierte|se transforma|se pliega|se encoge hasta|crece hasta)\b/.test(v)) return "TRANSFORMATION";
  if (/\b(?:grafico|esquema|infografia|barras|diagrama)\b/.test(v)) return "INFOGRAPHIC";
  if (/\b(?:metafora|simboliz|representa)\b/.test(v)) return "VISUAL_METAPHOR";
  if (s.shot === "detail" || s.shot === "close-up" && s.characters.length === 0) return "DETAIL_SHOT";
  if (s.characters.length === 0) return "ENVIRONMENT";
  return "CINEMATIC_SCENE";
}

// ---------------------------------------------------------------- estructura (errores) y regla de aparición de KAP
export type Issue = { id: string; message: string; scenes?: number[] };
/** ERRORES de estructura: 8-14 escenas, campos completos, tipos válidos y la regla de KAP. Un storyboard con errores no se exporta; los avisos de ritmo no lo bloquean. */
export function structureErrors(scenes: VisualScene[]): Issue[] {
  const e: Issue[] = [];
  if (scenes.length < 8 || scenes.length > 14) e.push({ id: "numero-escenas", message: `hay ${scenes.length} escenas (debe haber entre 8 y 14)` });
  scenes.forEach((s, i) => {
    const bad = (m: string) => e.push({ id: "campo", message: `escena ${s.n}: ${m}`, scenes: [s.n] });
    if (s.n !== i + 1) bad(`el orden no es correlativo (n=${s.n}, posición ${i + 1})`);
    if (!SCENE_TYPES.includes(s.sceneType)) bad(`tipo de escena inválido «${s.sceneType}»`);
    if (!s.visual.trim() || words(s.visual) < 8) bad("falta la descripción visual (≥ 8 palabras)");
    if (words(s.visualEn) < 10) bad("falta la descripción de imagen en inglés (≥ 10 palabras)");
    if (!s.narration.trim()) bad("falta la narración (cada escena aporta una idea al guion)");
    if (!s.location.trim() || !s.emotion.trim() || !s.purpose.trim()) bad("faltan lugar, emoción o propósito");
    if (!SHOT_TYPES.includes(s.shot)) bad(`plano inválido «${s.shot}»`);
    if (!(s.duration > 0)) bad("la duración debe ser mayor que 0");
    if (!s.subtitle.trim()) bad("falta el subtítulo");
    if (!s.visualAction.trim()) bad("falta la acción visual (qué cambia o se mueve en la imagen)");
  });
  e.push(...kapIssues(scenes)); return e;
}

/** REGLA DE APARICIÓN DE KAP: si kapPresent, la escena lo justifica (opinión, reacción, humor, explicación, transición, hook o cierre) y es coherente con sus personajes; KAP no llena escenas. */
export function kapIssues(scenes: VisualScene[]): Issue[] {
  const e: Issue[] = [];
  for (const s of scenes) {
    const inCast = s.characters.some((c) => c.trim().toUpperCase() === "KAP");
    if (s.kapPresent) {
      if (!s.kapReason || !KAP_REASONS.includes(s.kapReason)) e.push({ id: "kap-sin-razon", message: `escena ${s.n}: KAP aparece sin justificar (${KAP_REASONS.join(", ")})`, scenes: [s.n] });
      else if (words(s.kapWhy ?? "") < 3) e.push({ id: "kap-sin-razon", message: `escena ${s.n}: KAP aparece por «${s.kapReason}» pero no explica qué aporta (kapWhy)`, scenes: [s.n] });
      if (!inCast) e.push({ id: "kap-incoherente", message: `escena ${s.n}: kapPresent=true pero KAP no está en sus personajes`, scenes: [s.n] });
    } else if (inCast) e.push({ id: "kap-incoherente", message: `escena ${s.n}: KAP está en sus personajes pero kapPresent=false`, scenes: [s.n] });
    if (s.sceneType === "KAP_PRESENTADOR" && !s.kapPresent) e.push({ id: "kap-incoherente", message: `escena ${s.n}: KAP_PRESENTADOR sin KAP`, scenes: [s.n] });
    if (s.kapReason === "hook" && s.n > 2) e.push({ id: "kap-razon-fuera-de-sitio", message: `escena ${s.n}: «hook» solo vale al principio`, scenes: [s.n] });
    if (s.kapReason === "cierre" && s.n < scenes.length - 1) e.push({ id: "kap-razon-fuera-de-sitio", message: `escena ${s.n}: «cierre» solo vale al final`, scenes: [s.n] });
  }
  return e;
}

// ---------------------------------------------------------------- VISUAL RHYTHM CHECK (avisos)
export type RhythmWarning = { id: string; message: string; scenes?: number[] };
const ACTION = /\b(?:crece\w*|se (?:convierte|transforma|rompe|llena|vacia|pliega|encoge|apaga|enciende|abre|cierra|hace|desmorona|acerca|aleja)\w*|cambia\w*|aparece\w*|desaparece\w*|vuela\w*|cae\w*|sube\w*|baja\w*|borra\w*|escribe\w*|pulsa\w*|envia\w*|gira\w*|avanza\w*|salta\w*|lanza\w*|abre\w*|cierra\w*|tacha\w*|levanta\w*|encoge\w*|parpadea\w*|suena\w*|vibra\w*|brilla\w*|llena\w*|vacia\w*|corre\w*|tira\w*|mueve\w*|apila\w*|coloca\w*|pasa\w*|desliza\w*)\b/;
const STATIC = /\b(?:sentad[oa]|de pie|mirando|posa\w*|quiet[oa]|inmovil\w*|parad[oa]|observa\w*|esta\b)\b/;
const CONTRAST = /\b(?:frente a|versus|mientras que|en cambio|a la izquierda|a la derecha|antes\b|despues\b|por un lado|por otro|diminut[oa]|gigante|enorme|minuscul[oa]|vac[ií][oa]\b.*\bllen[oa]|luz\b.*\bsombra|oscur\w+.*\bluz)\b/;
const CHANGE = /\b(?:se (?:convierte|transforma|rompe|llena|vacia|pliega|encoge|apaga|enciende|desmorona|hace)\w*|crece\w*|cambia\w*|aparece\w*|desaparece\w*|se transforma\w*)\b/;
const isStatic = (s: VisualScene) => !s.visualAction.trim() || (STATIC.test(plain(s.visualAction)) && !ACTION.test(plain(s.visualAction)));
const hasAction = (s: VisualScene) => ACTION.test(plain(s.visualAction)) || ACTION.test(plain(s.visual));
const hasContrast = (s: VisualScene) => s.sceneType === "BEFORE_AFTER" || !!s.contrast?.trim() || CONTRAST.test(plain(`${s.visual} ${s.visualAction}`));
const hasChange = (s: VisualScene) => s.sceneType === "TRANSFORMATION" || s.sceneType === "BEFORE_AFTER" || CHANGE.test(plain(`${s.visualAction}`));
const runs = (xs: boolean[], min: number): number[][] => { const out: number[][] = []; let cur: number[] = []; xs.forEach((x, i) => { if (x) cur.push(i); else { if (cur.length >= min) out.push(cur); cur = []; } }); if (cur.length >= min) out.push(cur); return out; };
const ns = (s: VisualScene[], idx: number[]) => idx.map((i) => s[i].n);
const sameRuns = (key: (s: VisualScene) => string, s: VisualScene[], min: number) => { const out: number[][] = []; let cur = [0]; for (let i = 1; i <= s.length; i++) { if (i < s.length && key(s[i]) === key(s[i - 1])) cur.push(i); else { if (cur.length >= min) out.push(cur); cur = [i]; } } return out; };
const share = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0]; };

/** Avisos de ritmo visual (guía, no reglas rígidas: un storyboard bueno puede tener alguno). Devuelve [] si el ritmo es sano. */
export function visualRhythmCheck(scenes: VisualScene[]): RhythmWarning[] {
  const w: RhythmWarning[] = [], n = scenes.length; if (!n) return [{ id: "vacio", message: "no hay escenas" }];
  const st = scenes.map(isStatic);
  if (st.filter(Boolean).length / n > 0.35 || runs(st, 3).length) w.push({ id: "escenas-estaticas", message: "demasiadas escenas estáticas (sin nada que cambie o se mueva en la imagen)", scenes: scenes.filter((_, i) => st[i]).map((s) => s.n) });
  const dl = scenes.map((s) => !!s.dialogue);
  if (dl.filter(Boolean).length / n > 0.25 || runs(dl, 2).length) w.push({ id: "demasiados-dialogos", message: "demasiadas escenas de personajes hablando entre sí: que la imagen demuestre en vez de conversar", scenes: scenes.filter((s) => s.dialogue).map((s) => s.n) });
  const kp = scenes.map((s) => s.sceneType === "KAP_PRESENTADOR");
  if (runs(kp, 2).length) w.push({ id: "kap-consecutivos", message: "KAP_PRESENTADOR en escenas consecutivas: separa sus apariciones con escenas visuales", scenes: runs(kp, 2).flatMap((r) => ns(scenes, r)) });
  if (scenes.filter((s) => s.kapPresent).length / n > 0.4) w.push({ id: "kap-demasiado", message: "KAP aparece en más del 40 % de las escenas: es el presentador, no el protagonista de cada imagen" });
  const sameShot = sameRuns((s) => s.shot, scenes, 3), [topShot, topShotN] = share(scenes.map((s) => s.shot));
  if (sameShot.length || topShotN / n > 0.5) w.push({ id: "planos-iguales", message: `demasiados planos iguales (${topShot} × ${topShotN}): alterna general, medio, primer plano, detalle y POV`, scenes: sameShot.flatMap((r) => ns(scenes, r)) });
  const loc = scenes.filter((s) => s.sceneType !== "KAP_PRESENTADOR"), sameLoc = sameRuns((s) => plain(s.location), scenes.filter((s) => s.sceneType !== "KAP_PRESENTADOR"), 3), [topLoc, topLocN] = share(loc.map((s) => plain(s.location)));
  if (sameLoc.length || (loc.length >= 4 && topLocN / loc.length > 0.5)) w.push({ id: "escenarios-repetidos", message: `el escenario «${topLoc}» se repite demasiado: cambia de entorno, de escala o de punto de vista`, scenes: loc.filter((s) => plain(s.location) === topLoc).map((s) => s.n) });
  const noAct = windows(scenes, 4).filter((win) => win.every((s) => !hasAction(s)));
  if (noAct.length) w.push({ id: "sin-accion-visual", message: "tramo de 4 escenas sin ninguna acción visual (nadie hace nada y nada cambia)", scenes: noAct[0].map((s) => s.n) });
  const noContrast = windows(scenes, 5).filter((win) => win.every((s) => !hasContrast(s)));
  if (noContrast.length) w.push({ id: "sin-contraste", message: "tramo de 5 escenas sin contraste (antes/después, cambio de escala, luz/sombra, vacío/lleno…)", scenes: noContrast[0].map((s) => s.n) });
  const noChange = windows(scenes, 6).filter((win) => win.every((s) => !hasChange(s)));
  if (noChange.length) w.push({ id: "sin-transformacion", message: "demasiado tiempo sin una transformación o cambio visual", scenes: noChange[0].map((s) => s.n) });
  const lit = scenes.filter((s) => s.sceneType !== "KAP_PRESENTADOR" && jac(stems(s.narration), stems(s.visual)) >= 0.45 && !CHANGE.test(plain(s.visualAction)) && !["VISUAL_METAPHOR", "OBJECT_METAPHOR", "BRAIN_VISUALIZATION", "TRANSFORMATION"].includes(s.sceneType));
  if (lit.length) w.push({ id: "ilustra-literal", message: "escenas que solo ilustran literalmente la frase sin aportar nada (una metáfora, un contraste o un cambio lo harían más rico)", scenes: lit.map((s) => s.n) });
  const [topType, topTypeN] = share(scenes.map((s) => s.sceneType)), kinds = new Set(scenes.map((s) => s.sceneType)).size;
  if (kinds < Math.min(5, Math.ceil(n / 2)) || topTypeN / n > 0.35) w.push({ id: "poca-variedad", message: `poca variedad de tipos de escena (${kinds} tipos; «${topType}» × ${topTypeN})` });
  const total = totalSeconds(scenes); if (total < 30 || total > 60) w.push({ id: "duracion", message: `dura ${total} s (objetivo 30-60 s)` });
  const tight = scenes.filter((s) => s.duration < narrationSeconds(s.narration) * 0.85); if (tight.length) w.push({ id: "duracion-ajustada", message: "la duración de la escena es menor que el tiempo de su narración", scenes: tight.map((s) => s.n) });
  return w;
}
function windows(s: VisualScene[], size: number): VisualScene[][] { const out: VisualScene[][] = []; for (let i = 0; i + size <= s.length; i++) out.push(s.slice(i, i + size)); return out; }
