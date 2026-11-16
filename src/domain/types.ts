import { z } from "zod";

/** Estados del flujo de producción. Una producción solo avanza si la etapa anterior está completa. */
export const ProductionStatus = z.enum([
  "IDEA", "SCRIPTING", "STORYBOARD", "ASSETS", "VOICE", "RENDER",
  "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED",
]);
export type ProductionStatus = z.infer<typeof ProductionStatus>;

export const Id = z.string().min(1);

export const Character = z.object({
  id: Id, name: z.string(), description: z.string().default(""),
  traits: z.array(z.string()).default([]), voiceNotes: z.string().default(""),
  referenceAssetIds: z.array(Id).default([]),
});
export type Character = z.infer<typeof Character>;

export const Scene = z.object({
  id: Id, order: z.number().int(), location: z.string(), summary: z.string(),
  characterIds: z.array(Id).default([]), dialogue: z.string().default(""),
  durationSec: z.number().nonnegative().default(0),
});
export type Scene = z.infer<typeof Scene>;

export const Asset = z.object({
  id: Id, kind: z.enum(["image", "audio", "video", "music", "subtitle"]),
  path: z.string(), origin: z.enum(["uploaded", "generated", "stock"]),
  license: z.string().default("propio"), createdAt: z.string(),
});
export type Asset = z.infer<typeof Asset>;

/** Un episodio (≈5 min) y/o un short derivado de él. */
export const Production = z.object({
  id: Id,
  kind: z.enum(["episode", "short"]),
  number: z.number().int().positive(),
  parentId: Id.optional(),            // un short apunta a su episodio
  title: z.string(),
  status: ProductionStatus,
  synopsis: z.string().default(""),
  script: z.string().default(""),
  scenes: z.array(Scene).default([]),
  assetIds: z.array(Id).default([]),
  plannedWeek: z.string().optional(), // ISO week, p. ej. 2026-W47
  createdAt: z.string(), updatedAt: z.string(),
});
export type Production = z.infer<typeof Production>;

/** Continuidad narrativa: hechos canónicos que los guiones nuevos deben respetar. */
export const CanonFact = z.object({
  id: Id, text: z.string(), establishedIn: Id.optional(), tags: z.array(z.string()).default([]),
});
export type CanonFact = z.infer<typeof CanonFact>;

export const ReviewDecision = z.object({
  productionId: Id, decision: z.enum(["approve", "reject", "changes"]),
  note: z.string().default(""), decidedAt: z.string(),
});
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const JobKind = z.enum(["script", "storyboard", "voice", "render", "publish", "stats"]);
export const Job = z.object({
  id: Id, kind: JobKind, productionId: Id.optional(),
  state: z.enum(["queued", "running", "done", "failed", "needs_input"]),
  provider: z.string(), log: z.array(z.string()).default([]), createdAt: z.string(),
});
export type Job = z.infer<typeof Job>;
