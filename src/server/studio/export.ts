import type { Production } from "@/domain/types";
import type { RenderJob } from "@/domain/render";
import { dimensions } from "@/server/render/presets";

/** Solo se exporta lo APROBADO por el administrador (modo APPROVAL): la exportación nunca aprueba ni publica nada. */
export const EXPORTABLE = ["APPROVED", "SCHEDULED", "PUBLISHED"] as const;
export const canExport = (status: Production["status"]) => (EXPORTABLE as readonly string[]).includes(status);

export const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "sin-titulo";

/** Nombre del archivo descargable: kap-t1e3-la-noche-larga-16x9-1080p.mp4 · kap-t1-short-2-…-9x16-1080p.mp4 */
export function exportFileName(p: Pick<Production, "kind" | "season" | "number" | "title">, format: RenderJob["format"], quality: RenderJob["quality"], ext: string): string {
  const id = p.kind === "episode" ? `t${p.season}e${p.number}` : `t${p.season}-short-${p.number}`;
  return `kap-${id}-${slug(p.title)}-${format.replace(":", "x")}-${quality}.${ext}`;
}
export const exportDimensions = (format: RenderJob["format"], quality: RenderJob["quality"]) => dimensions(format, quality);

/** Parámetros con los que se generó (voz, música, estilo) la última vez: la exportación debe sonar y verse igual que lo aprobado. */
export function lastGenerationParams(jobs: RenderJob[], productionId: string): Record<string, unknown> | undefined {
  const j = jobs.filter((x) => x.productionId === productionId && (x.kind === "episode" || x.kind === "short") && x.status === "done").sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];
  if (!j) return undefined;
  const { voice, musicAssetId, musicVolume, animation } = j.params as Record<string, unknown>;
  return { mode: "rerender", voice, musicAssetId, musicVolume, animation };
}
