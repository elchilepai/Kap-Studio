import { z } from "zod";

/** Biblia visual de KAP: diseño de personajes, escenarios y estilo. Persiste entre episodios (continuidad). */
export const HairStyle = z.enum(["short", "long", "bun", "bald", "cap", "spiky"]);
export const Accessory = z.enum(["none", "glasses", "scarf", "hat", "backpack"]);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal #RRGGBB");

export const Outfit = z.object({
  id: z.string().min(1).max(40), name: z.string().min(1).max(60),
  top: Color, bottom: Color, shoes: Color, accent: Color, accessory: Accessory.default("none"),
});
export type Outfit = z.infer<typeof Outfit>;

export const DesignChange = z.object({ version: z.number().int(), note: z.string(), at: z.string(), episodeId: z.string().optional() });

/** Diseño de un personaje: rasgos base (inmutables sin justificación) + prendas (guardarropa) + historial de cambios. */
export const CharacterDesign = z.object({
  archetype: z.literal("flat").default("flat"),
  skin: Color, hairStyle: HairStyle, hairColor: Color, eyeColor: Color,
  height: z.number().min(0.8).max(1.2).default(1), build: z.number().min(0.85).max(1.2).default(1),
  outfits: z.array(Outfit).min(1).max(12),
  version: z.number().int().min(1).default(1), changeLog: z.array(DesignChange).default([]),
});
export type CharacterDesign = z.infer<typeof CharacterDesign>;

export const PlaceSet = z.object({
  preset: z.enum(["room", "street", "city", "forest", "rooftop", "abstract", "image"]).default("abstract"),
  timeOfDay: z.enum(["day", "dusk", "night"]).default("dusk"), imageAssetId: z.string().optional(), accent: Color.optional(),
});
export type PlaceSet = z.infer<typeof PlaceSet>;

export const StyleBible = z.object({
  id: z.literal("style"), name: z.string().default("KAP"),
  referenceNotes: z.string().default(""),              // rasgos del canal de referencia, definidos por el propietario
  ink: Color.default("#0d0f14"), lineWidth: z.number().min(0).max(0.12).default(0.045),
  grade: z.enum(["none", "dusk", "night", "warm", "cold", "dark"]).default("none"), vignette: z.number().min(0).max(0.8).default(0.3),
  shadow: z.boolean().default(true), defaultMode: z.enum(["animated2d", "still"]).default("animated2d"),
  updatedAt: z.string().default(""),
});
export type StyleBible = z.infer<typeof StyleBible>;

export const CastEntry = z.object({ characterId: z.string(), outfitId: z.string().optional(), note: z.string().optional() });
