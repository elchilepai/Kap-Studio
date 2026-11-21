import type { Character } from "@/domain/types";
import type { CharacterDesign, Outfit } from "@/domain/animation";
import type { Appearance } from "@/animation/types";
import { hash32 } from "@/animation/util";

export const DEFAULT_OUTFIT_ID = "base";

/** Aspecto final = rasgos base del diseño + prenda elegida (o la primera). Es lo que se dibuja SIEMPRE: así un personaje no cambia solo. */
export function resolveAppearance(d: CharacterDesign, outfitId?: string): Appearance {
  const o = d.outfits.find((x) => x.id === outfitId) ?? d.outfits[0];
  return { skin: d.skin, hairStyle: d.hairStyle, hairColor: d.hairColor, eyeColor: d.eyeColor, top: o.top, bottom: o.bottom, shoes: o.shoes, accent: o.accent, accessory: o.accessory, height: d.height, build: d.build, body: d.body, eyeStyle: d.eyeStyle, ...(d.rig ? { rig: d.rig } : {}) };
}

const SKINS = ["#f1c9a5", "#e0ac84", "#c68b62", "#a8714c", "#8a5a3c", "#f6d7c0"], HAIRS = ["#2b2a33", "#4a2a1f", "#7a4a2a", "#c9a24a", "#8a8d96", "#a0382b"], EYES = ["#3b6ea8", "#2f7d5b", "#6b4a2a", "#4a4f8a"];
const TOPS = ["#E9B949", "#7a4ea8", "#3b7a6f", "#b5543c", "#4a6fa5", "#c97b9a"], BOTTOMS = ["#2f3a52", "#2d2d3a", "#4a3a2c", "#37424f"];
const STYLES = ["short", "long", "spiky", "bun", "cap"] as const, ACCS = ["none", "scarf", "glasses", "none", "backpack"] as const;

/**
 * Diseño PROVISIONAL determinista a partir del nombre (para que un personaje sin diseño no quede sin dibujar).
 * Siempre sale igual para el mismo nombre. La interfaz avisa de que es provisional y permite diseñarlo.
 */
export function autoDesign(name: string): CharacterDesign {
  const h = hash32(name.toLowerCase());
  return {
    archetype: "flat", skin: SKINS[h % SKINS.length], hairStyle: STYLES[(h >>> 3) % STYLES.length], hairColor: HAIRS[(h >>> 5) % HAIRS.length], eyeColor: EYES[(h >>> 7) % EYES.length],
    height: 1, build: 1, body: "regular", eyeStyle: "round", version: 1, changeLog: [],
    outfits: [{ id: DEFAULT_OUTFIT_ID, name: "Base", top: TOPS[(h >>> 9) % TOPS.length], bottom: BOTTOMS[(h >>> 11) % BOTTOMS.length], shoes: "#1c1f27", accent: "#ffffff", accessory: ACCS[(h >>> 13) % ACCS.length] }],
  };
}

const BASE_KEYS = ["skin", "hairStyle", "hairColor", "eyeColor", "height", "build", "body", "eyeStyle"] as const;
export type DesignDiff = { baseChanged: string[]; outfitsEdited: string[]; outfitsAdded: string[]; outfitsRemoved: string[] };
export function diffDesign(a: CharacterDesign, b: CharacterDesign): DesignDiff {
  const baseChanged = [...BASE_KEYS.filter((k) => a[k] !== b[k]), ...(JSON.stringify(a.rig ?? null) !== JSON.stringify(b.rig ?? null) ? ["rig"] : [])] as string[];
  const outfitsEdited: string[] = [], outfitsRemoved: string[] = [];
  for (const o of a.outfits) { const n = b.outfits.find((x) => x.id === o.id); if (!n) outfitsRemoved.push(o.name); else if (JSON.stringify(o) !== JSON.stringify(n)) outfitsEdited.push(o.name); }
  const outfitsAdded = b.outfits.filter((o) => !a.outfits.some((x) => x.id === o.id)).map((o) => o.name);
  return { baseChanged, outfitsEdited, outfitsAdded, outfitsRemoved };
}

export class ContinuityError extends Error {}

/**
 * REGLA DE CONTINUIDAD: cambiar el aspecto base o editar/eliminar una prenda ya usada exige una justificación narrativa
 * y sube la versión (queda en el historial). Añadir una prenda nueva es libre. Un personaje no se «redibuja» sin motivo.
 */
export function applyDesignChange(existing: Character | undefined, next: CharacterDesign, note: string, now: string, episodeId?: string): CharacterDesign {
  const prev = existing?.design;
  if (!prev) return { ...next, version: 1, changeLog: [{ version: 1, note: note.trim() || "Diseño inicial", at: now, episodeId }] };
  const d = diffDesign(prev, next);
  const breaking = d.baseChanged.length + d.outfitsEdited.length + d.outfitsRemoved.length > 0;
  if (!breaking && !d.outfitsAdded.length) return { ...next, version: prev.version, changeLog: prev.changeLog };
  if (breaking && note.trim().length < 10) throw new ContinuityError(`Cambiar el aspecto de «${existing?.name}» (${[...d.baseChanged, ...d.outfitsEdited, ...d.outfitsRemoved].join(", ")}) exige una justificación narrativa de al menos 10 caracteres: un personaje no cambia sin motivo en la historia.`);
  const version = breaking ? prev.version + 1 : prev.version;
  const entry = breaking ? note.trim() : `Prenda nueva: ${d.outfitsAdded.join(", ")}`;
  return { ...next, version, changeLog: [...prev.changeLog, { version, note: entry, at: now, episodeId }] };
}
export type { Outfit };
