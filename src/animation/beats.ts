import type { EffectKind, Expression, Gesture, MusicCue, PropKind, Side, SoundCue, SoundKind } from "./types.ts";

/**
 * VOCABULARIO DE ACCIONES («beats»): el contrato entre la capa de INTERPRETACIÓN del guion y la capa de ANIMACIÓN.
 * Quien interpreta el guion (hoy reglas; mañana un LLM) produce beats; el director los convierte en animación.
 * Cada beat se puede escribir como texto editable («clave: valor») y volver a leer sin pérdida: el editor y un
 * LLM hablan el mismo idioma. Los actores se nombran por su nombre; el director los resuelve contra la biblia.
 */
export type PoseName = "idle" | "arms_crossed" | "hands_hips" | "pointing" | "thinking" | "facepalm" | "cheer" | "shrug";
export type ShotSize = "wide" | "medium" | "close";
export type Beat =
  | { type: "enter"; actor: string; from: Side | "fade"; at?: number; dur?: number }
  | { type: "exit"; actor: string; to: Side | "fade"; at?: number; dur?: number }
  | { type: "walk"; actor: string; to: number | "left" | "right" | "center"; at?: number; dur?: number; run?: boolean }
  | { type: "face"; actor: string; dir: Side; at?: number }
  | { type: "expression"; actor: string; value: Expression; at?: number }
  | { type: "gesture"; actor: string; value: Gesture; at?: number; dur?: number }
  | { type: "pose"; actor: string; value: PoseName; at?: number; dur?: number }
  | { type: "camera"; mode: "zoom" | "pan" | "follow" | "shake" | "reset"; zoom?: number; dir?: Side; actor?: string; amp?: number; at?: number; dur?: number }
  | { type: "shot"; size: ShotSize; actor?: string; at?: number; cut?: boolean }
  | { type: "vfx"; effect: EffectKind; at?: number; dur?: number; intensity?: number }
  | { type: "prop"; kind: PropKind; action: "show" | "hide"; at?: number };

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const EXPR_WORDS: Record<string, Expression> = { triste: "sad", feliz: "happy", contento: "happy", alegre: "happy", enfadado: "angry", furioso: "angry", sorprendido: "surprised", asombrado: "surprised", preocupado: "worried", asustado: "worried", pensativo: "thinking", neutral: "neutral", serio: "neutral" };
export const GESTURE_WORDS: Record<string, Gesture> = { saluda: "wave", saludar: "wave", senala: "point", encoge: "shrug", asiente: "nod", niega: "shake", piensa: "think", levanta: "raise", celebra: "raise" };
export const POSE_WORDS: Record<string, PoseName> = { "brazos cruzados": "arms_crossed", cruzados: "arms_crossed", "manos en la cintura": "hands_hips", cintura: "hands_hips", senalando: "pointing", pensando: "thinking", "mano en la cara": "facepalm", facepalm: "facepalm", celebrando: "cheer", animado: "cheer", "encogido de hombros": "shrug", reposo: "idle", neutral: "idle" };
export const PROP_WORDS: Record<string, PropKind> = { linterna: "lantern", caja: "box", puerta: "door", cartel: "sign", estrella: "star", luna: "moon", arbol: "tree", farola: "lamp" };
export const VFX_WORDS: Record<string, EffectKind> = { lluvia: "rain", nieve: "snow", niebla: "fog", flash: "flash", oscurecer: "darken", polvo: "dust" };
const SHOT_WORDS: Record<string, ShotSize> = { general: "wide", abierto: "wide", amplio: "wide", medio: "medium", cerrado: "close", "primer plano": "close", detalle: "close" };

const num = (s: string, re: RegExp) => { const m = re.exec(s); return m ? parseFloat(m[1].replace(",", ".")) : undefined; };
const sideOf = (s: string): Side | "fade" | undefined => (/izquierd/.test(s) ? "left" : /derech/.test(s) ? "right" : /fundid|fade/.test(s) ? "fade" : undefined);
const find = <T,>(map: Record<string, T>, s: string): T | undefined => Object.entries(map).sort((a, b) => b[0].length - a[0].length).find(([w]) => s.includes(norm(w)))?.[1];

/** Directivas SOLO del director (SHORT MODE): sonido, música e impacto/silencio. No son beats de la IR (la IR no cambia): viajan en el texto de la dirección y las lee el director. */
export const DIRECTOR_ONLY = new Set(["sonido", "marca-musica", "impacto", "silencio", "objeto", "a-camara", "montaje"]);
const SOUND_WORDS: Record<string, SoundKind> = { puerta: "door", portazo: "door", golpe: "bump", llamar: "knock", llamada: "ring", timbre: "ring", pasos: "steps", ambiente: "ambience" };
const MUSIC_WORDS: Record<string, MusicCue["kind"]> = { inicio: "music_start", cambio: "music_change", fin: "music_stop" };
/** «sonido: puerta en 2.1s» · «marca-musica: inicio|cambio|fin en 3s» (solo una marca para el director: no hay música real) · «impacto: en 5s» · «silencio: en 6s durante 1.5s» → marca de sonido o de música (o aviso si no se entiende). */
export function parseDirectorCue(raw: string): { sound?: SoundCue; music?: MusicCue; warning?: string } | undefined {
  const i = raw.indexOf(":"); if (i < 0) return undefined; const key = norm(raw.slice(0, i)); if (!DIRECTOR_ONLY.has(key)) return undefined;
  const nv = norm(raw.slice(i + 1)), at = num(nv, /\ben\s+(\d+(?:[.,]\d+)?)\s*s/) ?? 0.2, dur = num(nv, /durante\s+(\d+(?:[.,]\d+)?)\s*s/);
  if (key === "sonido") { const w = Object.entries(SOUND_WORDS).find(([k]) => nv.includes(k))?.[1]; return w ? { sound: { t: at, kind: w, ...(dur !== undefined ? { dur } : {}) } } : { warning: `sonido: no conozco «${raw}»` }; }
  if (key === "marca-musica") { const k = Object.entries(MUSIC_WORDS).find(([w]) => nv.includes(w))?.[1]; return k ? { music: { t: at, kind: k, ...(dur !== undefined ? { dur } : {}) } } : { warning: `marca-musica: usa inicio, cambio o fin en «${raw}»` }; }
  if (key === "impacto") return { music: { t: at, kind: "impact" }, sound: { t: at, kind: "bump" } };
  return { music: { t: at, kind: "silence", dur: dur ?? 1.5 } };
}

/** Texto «clave: valor» → beat. Devuelve un aviso (nunca inventa) si no lo entiende. */
export function parseDirection(raw: string): { beat?: Beat; warning?: string } {
  const i = raw.indexOf(":"); if (i < 0) return { warning: `Dirección sin «clave: valor»: «${raw}»` };
  const key = norm(raw.slice(0, i)), val = raw.slice(i + 1).trim(), nv = norm(val);
  if (DIRECTOR_ONLY.has(key)) return {};   // sonido/música: los lee el director desde el texto; no son beats ni avisos
  const at = num(nv, /\ben\s+(\d+(?:[.,]\d+)?)\s*s/), dur = num(nv, /durante\s+(\d+(?:[.,]\d+)?)\s*s/);
  const clean = nv.replace(/\ben\s+\d+(?:[.,]\d+)?\s*s/, "").replace(/durante\s+\d+(?:[.,]\d+)?\s*s/, "").trim();
  const first = val.split(/\s+/)[0] ?? ""; const rest = norm(val.slice(first.length)).replace(/\ben\s+\d+(?:[.,]\d+)?\s*s/, "").replace(/durante\s+\d+(?:[.,]\d+)?\s*s/, "").trim();
  const t = { ...(at !== undefined ? { at } : {}), ...(dur !== undefined ? { dur } : {}) };
  const bad = (why: string): { warning: string } => ({ warning: `${why} en «${raw}»` });
  switch (key) {
    case "camara": {
      const z = num(clean, /zoom\s+(\d+(?:[.,]\d+)?)/) ?? (/acercar|primer plano/.test(clean) ? 1.3 : /alejar|plano general/.test(clean) ? 0.9 : undefined);
      if (/temblor|tiembla/.test(clean)) return { beat: { type: "camera", mode: "shake", amp: num(clean, /(\d+(?:[.,]\d+)?)/) ?? 0.25, ...t } };
      if (/paneo|panoram/.test(clean)) return { beat: { type: "camera", mode: "pan", dir: /izquierd/.test(clean) ? "left" : "right", ...t } };
      if (/segui|siguie/.test(clean)) { const a = val.replace(/^\S+\s*/, "").split(/\s+/)[0]; return a ? { beat: { type: "camera", mode: "follow", actor: a, ...(z ? { zoom: z } : {}), ...t } } : bad("cámara: falta el personaje"); }
      if (/centro/.test(clean)) return { beat: { type: "camera", mode: "reset", ...t } };
      if (z) return { beat: { type: "camera", mode: "zoom", zoom: z, ...t } };
      return { warning: `cámara: no entiendo «${raw}»` };
    }
    case "plano": {
      const size = find(SHOT_WORDS, clean); if (!size) return { warning: `plano: no entiendo «${raw}»` };
      const left = clean.replace(/primer plano|general|abierto|amplio|medio|cerrado|detalle|corte/g, "").trim().split(/\s+/)[0];
      const actor = left ? (val.split(/\s+/).find((w) => norm(w) === left) ?? left) : undefined;
      return { beat: { type: "shot", size, ...(actor && size !== "wide" ? { actor } : {}), ...(/corte/.test(clean) ? { cut: true } : {}), ...(at !== undefined ? { at } : {}) } };
    }
    case "entra": case "sale": { const sd = sideOf(rest); if (!first || !sd) return bad(`${key}: necesito «NOMBRE izquierda|derecha|fundido»`); return { beat: key === "entra" ? { type: "enter", actor: first, from: sd, ...t } : { type: "exit", actor: first, to: sd, ...t } }; }
    case "camina": { const dest = /izquierd/.test(rest) ? "left" : /derech/.test(rest) ? "right" : /centro/.test(rest) ? "center" : num(rest, /\ba\s+(\d+(?:[.,]\d+)?)/); if (!first || dest === undefined) return bad("camina: destino no entendido"); return { beat: { type: "walk", actor: first, to: dest as never, ...(/corre/.test(rest) ? { run: true } : {}), ...t } }; }
    case "expresion": { const v = find(EXPR_WORDS, rest); return first && v ? { beat: { type: "expression", actor: first, value: v, ...(at !== undefined ? { at } : {}) } } : { warning: `expresión: no entiendo «${raw}»` }; }
    case "gesto": { const v = find(GESTURE_WORDS, rest) ?? (rest.includes("senala") || rest.includes("señala") ? "point" : undefined); return first && v ? { beat: { type: "gesture", actor: first, value: v, ...t } } : { warning: `gesto: no entiendo «${raw}»` }; }
    case "pose": { const v = find(POSE_WORDS, rest); return first && v ? { beat: { type: "pose", actor: first, value: v, ...t } } : { warning: `pose: no entiendo «${raw}»` }; }
    case "mira": { const sd = sideOf(rest); return first && (sd === "left" || sd === "right") ? { beat: { type: "face", actor: first, dir: sd, ...(at !== undefined ? { at } : {}) } } : bad("mira: necesito «NOMBRE izquierda|derecha»"); }
    case "vfx": { const e = find(VFX_WORDS, clean); return e ? { beat: { type: "vfx", effect: e, intensity: num(clean, /(\d+(?:[.,]\d+)?)/), ...t } } : { warning: `vfx: no conozco «${raw}»` }; }
    case "aparece": case "desaparece": { const k = find(PROP_WORDS, clean); return k ? { beat: { type: "prop", kind: k, action: key === "aparece" ? "show" : "hide", ...(at !== undefined ? { at } : {}) } } : { warning: `${key}: objeto desconocido en «${raw}»` }; }
    default: return { warning: `Dirección desconocida: «${raw}»` };
  }
}

const inv = <T extends string>(map: Record<string, T>, v: T) => Object.entries(map).find(([, x]) => x === v)?.[0] ?? v;
const side = (s: Side | "fade") => (s === "left" ? "izquierda" : s === "right" ? "derecha" : "fundido");
const tm = (b: { at?: number; dur?: number }) => `${b.at !== undefined ? ` en ${b.at}s` : ""}${b.dur !== undefined ? ` durante ${b.dur}s` : ""}`;

/** Beat → texto «clave: valor» (el inverso de parseDirection para todo el vocabulario). */
export function beatToDirection(b: Beat): string {
  switch (b.type) {
    case "enter": return `entra: ${b.actor} ${side(b.from)}${tm(b)}`;
    case "exit": return `sale: ${b.actor} ${side(b.to)}${tm(b)}`;
    case "walk": return `camina: ${b.actor} a ${b.to === "left" ? "izquierda" : b.to === "right" ? "derecha" : b.to === "center" ? "centro" : b.to}${b.run ? " corre" : ""}${tm(b)}`;
    case "face": return `mira: ${b.actor} ${b.dir === "left" ? "izquierda" : "derecha"}${tm(b)}`;
    case "expression": return `expresion: ${b.actor} ${inv(EXPR_WORDS, b.value)}${tm(b)}`;
    case "gesture": return `gesto: ${b.actor} ${inv(GESTURE_WORDS, b.value)}${tm(b)}`;
    case "pose": return `pose: ${b.actor} ${inv(POSE_WORDS, b.value)}${tm(b)}`;
    case "camera": return `camara: ${b.mode === "zoom" ? `zoom ${b.zoom}` : b.mode === "pan" ? `paneo ${b.dir === "left" ? "izquierda" : "derecha"}` : b.mode === "follow" ? `seguir ${b.actor}` : b.mode === "shake" ? `temblor ${b.amp ?? 0.25}` : "centro"}${tm(b)}`;
    case "shot": return `plano: ${b.size === "wide" ? "general" : b.size === "medium" ? "medio" : "primer plano"}${b.actor ? ` ${b.actor}` : ""}${b.cut ? " corte" : ""}${b.at !== undefined ? ` en ${b.at}s` : ""}`;
    case "vfx": return `vfx: ${inv(VFX_WORDS, b.effect)}${b.intensity ? ` ${b.intensity}` : ""}${tm(b)}`;
    case "prop": return `${b.action === "show" ? "aparece" : "desaparece"}: ${inv(PROP_WORDS, b.kind)}${b.at !== undefined ? ` en ${b.at}s` : ""}`;
  }
}
