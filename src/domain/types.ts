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
  name: z.string().default(""), mime: z.string().default(""), size: z.number().default(0),
  // metadatos reales (ffprobe), si están disponibles
  durationSec: z.number().optional(), width: z.number().optional(), height: z.number().optional(), hasAudio: z.boolean().optional(),
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
  season: z.number().int().positive().default(1),
  durationSec: z.number().int().nonnegative().default(0),
  plannedDate: z.string().optional(),  // YYYY-MM-DD
  producedAt: z.string().optional(),   // YYYY-MM-DD
  videoAssetId: Id.optional(),         // vídeo adjunto para revisión
  publishedUrl: z.string().optional(),
  publishedAt: z.string().optional(),
  createdAt: z.string(), updatedAt: z.string(),
});
export type Production = z.infer<typeof Production>;

/** Continuidad narrativa: hechos canónicos que los guiones nuevos deben respetar. */
export const CanonFact = z.object({
  id: Id, text: z.string(), establishedIn: Id.optional(), tags: z.array(z.string()).default([]),
});
export type CanonFact = z.infer<typeof CanonFact>;

export const ReviewDecision = z.object({
  id: Id, productionId: Id, decision: z.enum(["approve", "reject", "changes"]),
  note: z.string().default(""), decidedAt: z.string(),
});
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const JobKind = z.enum(["script", "storyboard", "assets", "voice", "render", "publish", "stats", "other"]);
export const Job = z.object({
  id: Id, kind: JobKind, productionId: Id.optional(),
  state: z.enum(["queued", "running", "done", "failed", "needs_input"]),
  provider: z.string(), log: z.array(z.string()).default([]), createdAt: z.string(),
  acknowledged: z.boolean().default(false),
});
export type Job = z.infer<typeof Job>;

export const BibleEntry = z.object({
  id: Id, title: z.string().min(1), category: z.string().default("General"),
  text: z.string().default(""), createdAt: z.string(),
});
export type BibleEntry = z.infer<typeof BibleEntry>;

export const Relationship = z.object({
  id: Id, fromId: Id, toId: Id, kind: z.string().min(1), note: z.string().default(""), createdAt: z.string(),
});
export type Relationship = z.infer<typeof Relationship>;

export const StoryEvent = z.object({
  id: Id, kind: z.enum(["cronologia", "acontecimiento"]), title: z.string().min(1),
  description: z.string().default(""), when: z.string().default(""), order: z.number().default(0),
  productionId: Id.optional(), createdAt: z.string(),
});
export type StoryEvent = z.infer<typeof StoryEvent>;

export const Place = z.object({
  id: Id, name: z.string().min(1), description: z.string().default(""), createdAt: z.string(),
});
export type Place = z.infer<typeof Place>;

export const Evolution = z.object({
  id: Id, title: z.string().min(1), description: z.string().default(""), order: z.number().default(0),
  productionId: Id.optional(), createdAt: z.string(),
});
export type Evolution = z.infer<typeof Evolution>;

export const Cost = z.object({
  id: Id, concept: z.string().min(1), amountEur: z.number().nonnegative(),
  productionId: Id.optional(), date: z.string(), createdAt: z.string(),
});
export type Cost = z.infer<typeof Cost>;

export const StoryState = z.object({
  id: z.literal("story"), summary: z.string().default(""), updatedAt: z.string(),
});
export type StoryState = z.infer<typeof StoryState>;

export const Settings = z.object({
  id: z.literal("settings"), channelName: z.string().default("KAP"),
  channelUrl: z.string().default(""), publishWeekday: z.number().int().min(1).max(7).default(5),
});
export type Settings = z.infer<typeof Settings>;

export const ActivityEntry = z.object({
  id: z.number().optional(), ts: z.string(), actor: z.string(), action: z.string(),
  target: z.string().optional(), detail: z.string().optional(), ip: z.string().optional(),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;
