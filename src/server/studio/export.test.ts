import { describe, expect, it } from "vitest";
import { canExport, exportFileName, lastGenerationParams, slug } from "./export";
import type { RenderJob } from "@/domain/render";

describe("exportación final (puro)", () => {
  it("solo se exporta lo aprobado: ni borradores, ni revisión, ni rechazados", () => {
    for (const s of ["IDEA", "SCRIPTING", "STORYBOARD", "ASSETS", "VOICE", "RENDER", "REVIEW", "REJECTED"] as const) expect(canExport(s)).toBe(false);
    for (const s of ["APPROVED", "SCHEDULED", "PUBLISHED"] as const) expect(canExport(s)).toBe(true);
  });
  it("nombres de archivo limpios y estables", () => {
    expect(slug("La noche larga: ¡Ñandú & Co.!")).toBe("la-noche-larga-nandu-co");
    expect(slug("***")).toBe("sin-titulo");
    expect(exportFileName({ kind: "episode", season: 1, number: 3, title: "La noche larga" }, "16:9", "1080p", "mp4")).toBe("kap-t1e3-la-noche-larga-16x9-1080p.mp4");
    expect(exportFileName({ kind: "short", season: 2, number: 7, title: "Gancho" }, "9:16", "1080p", "mp4")).toBe("kap-t2-short-7-gancho-9x16-1080p.mp4");
    expect(exportFileName({ kind: "episode", season: 1, number: 1, title: "../../etc/passwd" }, "16:9", "720p", "mp4")).not.toMatch(/[/\\]/);   // sin rutas en el nombre
  });
  it("hereda voz, música y estilo de la última generación terminada de ESA producción", () => {
    const j = (id: string, productionId: string, finishedAt: number, params: Record<string, unknown>, status: RenderJob["status"] = "done", kind: RenderJob["kind"] = "episode") => ({ id, productionId, kind, status, finishedAt, params }) as unknown as RenderJob;
    const jobs = [j("a", "p1", 10, { voice: "none", animation: "still" }), j("b", "p1", 20, { voice: "espeak", animation: "2d", musicAssetId: "m", musicVolume: 0.3, shortsCount: 3 }), j("c", "p1", 30, { voice: "none" }, "failed"), j("d", "p2", 40, { voice: "none" }), j("e", "p1", 50, { voice: "none" }, "done", "export")];
    expect(lastGenerationParams(jobs, "p1")).toEqual({ mode: "rerender", voice: "espeak", musicAssetId: "m", musicVolume: 0.3, animation: "2d" });
    expect(lastGenerationParams(jobs, "p9")).toBeUndefined();
  });
});
