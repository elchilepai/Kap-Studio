import { z } from "zod";
import type { Beat } from "@/animation/beats";

/**
 * REPRESENTACIÓN INTERMEDIA DE GUION (IR). Es el contrato entre la capa de INTERPRETACIÓN (texto → estructura) y la capa de
 * ANIMACIÓN (estructura → vídeo). Lo produce el intérprete por reglas hoy y un LLM mañana; se valida SIEMPRE con este esquema
 * antes de usarse, así que una salida defectuosa de un modelo nunca llega al motor de animación.
 */
const Side = z.enum(["left", "right"]);
const T = { at: z.number().min(0).max(3600).optional(), dur: z.number().min(0.05).max(600).optional() };
const Name = z.string().min(1).max(60);

export const BeatSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enter"), actor: Name, from: z.enum(["left", "right", "fade"]), ...T }),
  z.object({ type: z.literal("exit"), actor: Name, to: z.enum(["left", "right", "fade"]), ...T }),
  z.object({ type: z.literal("walk"), actor: Name, to: z.union([z.number().min(0).max(16), z.enum(["left", "right", "center"])]), run: z.boolean().optional(), ...T }),
  z.object({ type: z.literal("face"), actor: Name, dir: Side, at: T.at }),
  z.object({ type: z.literal("expression"), actor: Name, value: z.enum(["neutral", "happy", "sad", "angry", "surprised", "worried", "thinking"]), at: T.at }),
  z.object({ type: z.literal("gesture"), actor: Name, value: z.enum(["none", "wave", "point", "shrug", "nod", "shake", "think", "raise"]), ...T }),
  z.object({ type: z.literal("pose"), actor: Name, value: z.enum(["idle", "arms_crossed", "hands_hips", "pointing", "thinking", "facepalm", "cheer", "shrug"]), ...T }),
  z.object({ type: z.literal("camera"), mode: z.enum(["zoom", "pan", "follow", "shake", "reset"]), zoom: z.number().min(0.8).max(2.5).optional(), dir: Side.optional(), actor: Name.optional(), amp: z.number().min(0).max(1).optional(), ...T }),
  z.object({ type: z.literal("shot"), size: z.enum(["wide", "medium", "close"]), actor: Name.optional(), at: T.at, cut: z.boolean().optional() }),
  z.object({ type: z.literal("vfx"), effect: z.enum(["rain", "snow", "fog", "flash", "darken", "dust"]), intensity: z.number().min(0).max(3).optional(), ...T }),
  z.object({ type: z.literal("prop"), kind: z.enum(["lantern", "box", "door", "sign", "star", "moon", "tree", "lamp"]), action: z.enum(["show", "hide"]), at: T.at }),
]) satisfies z.ZodType<Beat>;

export const IRLine = z.object({ speaker: Name.optional(), text: z.string().min(1).max(1200) });
export const IRScene = z.object({
  title: z.string().max(120).default(""), location: z.string().max(120).default(""),
  timeOfDay: z.enum(["day", "dusk", "night"]).optional(), mood: z.string().max(60).default(""),
  lines: z.array(IRLine).min(1).max(120), beats: z.array(BeatSchema).max(200).default([]),
  /** Direcciones tal como las escribió el autor (se conservan para no reescribir su texto). */
  source: z.array(z.string().max(300)).max(200).optional(),
  hints: z.object({ image: z.string().max(200).optional(), music: z.string().max(200).optional(), transition: z.string().max(40).optional(), durationSec: z.number().min(2).max(120).optional(), sfx: z.string().max(200).optional() }).default({}),
});
export const ScreenplayIR = z.object({ v: z.literal(1), scenes: z.array(IRScene).min(1).max(300), warnings: z.array(z.string()).default([]) });
export type IRScene = z.infer<typeof IRScene>;
export type ScreenplayIR = z.infer<typeof ScreenplayIR>;

export type IRReport = { ir?: ScreenplayIR; errors: string[]; warnings: string[]; newCharacters: string[]; newPlaces: string[] };

/**
 * Valida una IR venga de donde venga (reglas, LLM, JSON pegado a mano) contra la biblia: errores de forma → se rechaza con
 * motivos legibles; personajes/lugares que no existen → se informan (para crearlos) sin inventar nada.
 */
export function validateIR(input: unknown, bible: { characters: string[]; places: string[] }): IRReport {
  const r = ScreenplayIR.safeParse(input);
  if (!r.success) return { errors: r.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`), warnings: [], newCharacters: [], newPlaces: [] };
  const nk = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const chars = new Set(bible.characters.map(nk)), places = new Set(bible.places.map(nk));
  const newChars = new Map<string, string>(), newPlaces = new Map<string, string>(); const warnings = [...r.data.warnings];
  r.data.scenes.forEach((s, i) => {
    if (s.location && !places.has(nk(s.location))) newPlaces.set(nk(s.location), s.location);
    for (const n of [...s.lines.map((l) => l.speaker), ...s.beats.map((b) => ("actor" in b ? b.actor : undefined))]) if (n && !chars.has(nk(n))) newChars.set(nk(n), n);
    if (s.lines.reduce((a, l) => a + l.text.length, 0) < 3) warnings.push(`Escena ${i + 1}: casi sin texto`);
  });
  return { ir: r.data, errors: [], warnings, newCharacters: [...newChars.values()], newPlaces: [...newPlaces.values()] };
}
