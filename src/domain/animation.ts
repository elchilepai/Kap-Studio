import { z } from "zod";
import type { LayeredRig } from "@/animation/types";

/** Biblia visual de KAP: diseño de personajes, escenarios y estilo. Persiste entre episodios (continuidad). */
export const HairStyle = z.enum(["short", "long", "bun", "bald", "cap", "spiky", "ponytail", "curly"]);
export const Accessory = z.enum(["none", "glasses", "scarf", "hat", "backpack", "headphones", "cape", "tie"]);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal #RRGGBB");

export const Outfit = z.object({
  id: z.string().min(1).max(40), name: z.string().min(1).max(60),
  top: Color, bottom: Color, shoes: Color, accent: Color, accessory: Accessory.default("none"),
});
export type Outfit = z.infer<typeof Outfit>;

const Px = z.tuple([z.number().min(-4000).max(4000), z.number().min(-4000).max(4000)]);
/** Rig por capas (personaje propio en PNG): partes con punto de giro y jerarquía. Se valida contra la biblioteca antes de guardarse. */
export const LayeredRigSchema = z.object({
  kind: z.literal("layered"), pxPerUnit: z.number().min(10).max(5000),
  parts: z.array(z.object({ id: z.string().min(1).max(40), role: z.string().min(1).max(30), image: z.string().min(1).max(80), anchor: Px, parent: z.string().max(40).optional(), at: Px.optional(), z: z.number().min(-50).max(50), scale: z.number().min(0.05).max(20).optional() })).min(2).max(40),
  face: z.object({ parent: z.string().max(40), at: Px, scale: z.number().min(0.05).max(20).optional(), eyes: z.record(z.string(), z.string()).optional(), mouths: z.record(z.string(), z.string()).optional() }).optional(),
  animations: z.array(z.string().max(30)).max(40).optional(),
}) satisfies z.ZodType<LayeredRig>;

export const DesignChange = z.object({ version: z.number().int(), note: z.string(), at: z.string(), episodeId: z.string().optional() });

/** Diseño de un personaje: rasgos base (inmutables sin justificación) + prendas (guardarropa) + historial de cambios. */
export const CharacterDesign = z.object({
  archetype: z.literal("flat").default("flat"),
  skin: Color, hairStyle: HairStyle, hairColor: Color, eyeColor: Color,
  height: z.number().min(0.8).max(1.2).default(1), build: z.number().min(0.85).max(1.2).default(1),
  body: z.enum(["slim", "regular", "broad"]).default("regular"), eyeStyle: z.enum(["round", "narrow", "big"]).default("round"),
  /** Si existe, el personaje se dibuja con sus propias capas PNG en lugar del vector paramétrico. */
  rig: LayeredRigSchema.optional(),
  outfits: z.array(Outfit).min(1).max(12),
  version: z.number().int().min(1).default(1), changeLog: z.array(DesignChange).default([]),
});
export type CharacterDesign = z.infer<typeof CharacterDesign>;

export const SetLayer = z.object({ image: z.string(), depth: z.number().min(-1).max(1), y: z.number().optional(), height: z.number().min(1).max(30).optional(), tile: z.boolean().optional(), alpha: z.number().min(0).max(1).optional() });
export const SetElement = z.object({ id: z.string().max(40), kind: z.enum(["lantern", "box", "door", "sign", "star", "moon", "tree", "lamp", "bench", "pillar", "bush", "plant", "crate"]), x: z.number().min(-4).max(20), y: z.number().optional(), scale: z.number().min(0.2).max(5), depth: z.number().min(-1).max(1), flip: z.boolean().optional() });
export const PlaceSet = z.object({
  preset: z.enum(["room", "street", "city", "forest", "rooftop", "patio", "abstract", "image"]).default("abstract"),
  timeOfDay: z.enum(["day", "afternoon", "dusk", "night"]).default("dusk"), imageAssetId: z.string().optional(), accent: Color.optional(),
  /** Fondo por capas con paralaje (PNG propios), elementos reutilizables y primer plano: se guardan con el lugar. */
  layers: z.array(SetLayer).max(12).optional(), elements: z.array(SetElement).max(30).optional(), foreground: z.array(SetElement).max(12).optional(),
});
export type PlaceSet = z.infer<typeof PlaceSet>;

export const StyleBible = z.object({
  id: z.literal("style"), name: z.string().default("KAP"),
  referenceNotes: z.string().default(""),              // rasgos del canal de referencia, definidos por el propietario
  ink: Color.default("#0d0f14"), lineWidth: z.number().min(0).max(0.12).default(0.045),
  grade: z.enum(["none", "dusk", "night", "warm", "cold", "dark"]).default("none"), vignette: z.number().min(0).max(0.8).default(0.3),
  shadow: z.boolean().default(true), bars: z.number().min(0).max(0.14).default(0), defaultMode: z.enum(["animated2d", "still"]).default("animated2d"),
  updatedAt: z.string().default(""),
});
export type StyleBible = z.infer<typeof StyleBible>;

export const CastEntry = z.object({ characterId: z.string(), outfitId: z.string().optional(), note: z.string().optional() });
