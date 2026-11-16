import { z } from "zod";

export const RenderFormat = z.enum(["16:9", "9:16"]);
export type RenderFormat = z.infer<typeof RenderFormat>;
export const RenderQuality = z.enum(["480p", "720p", "1080p"]);
export type RenderQuality = z.infer<typeof RenderQuality>;
export const RenderKind = z.enum(["slate", "episode", "short"]);
export type RenderKind = z.infer<typeof RenderKind>;
export const RenderStatus = z.enum(["queued", "running", "done", "failed", "canceled"]);
export type RenderStatus = z.infer<typeof RenderStatus>;

export const RENDER_STATUS_LABEL: Record<RenderStatus, string> = {
  queued: "En cola", running: "Renderizando", done: "Completado", failed: "Fallido", canceled: "Cancelado",
};

export type RenderResult = { durationSec: number; width: number; height: number; sizeBytes: number };

/** Trabajo de renderizado persistente. El estado y el progreso reflejan el proceso FFmpeg real. */
export type RenderJob = {
  id: string; productionId?: string; kind: RenderKind; format: RenderFormat; quality: RenderQuality;
  params: Record<string, unknown>;
  status: RenderStatus; progress: number; attempts: number; maxAttempts: number;
  error?: string; log?: string; outputAssetId?: string; result?: RenderResult;
  createdAt: number; startedAt?: number; finishedAt?: number; notBefore: number;
  cancelRequested: boolean; worker?: string; heartbeat?: number;
};
