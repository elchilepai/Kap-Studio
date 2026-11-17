import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { adminOr401 } from "@/server/auth/guard";
import { getProviders, MEDIA_DIR } from "@/server/providers";
import { canExport, exportFileName } from "@/server/studio/export";

export const runtime = "nodejs";

/**
 * Descarga de archivos FINALES (como adjunto, con nombre limpio). Solo de producciones aprobadas.
 *   ?f=video            → el vídeo revisado/aprobado
 *   ?f=export&job=<id>  → una exportación definitiva terminada
 *   ?f=srt | vtt        → subtítulos sueltos
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await adminOr401(); if ("denied" in g) return g.denied;
  const { id } = await ctx.params; const url = new URL(req.url); const f = url.searchParams.get("f") ?? "video";
  const { storage, render } = getProviders();
  const p = await storage.productions.get(id);
  if (!p) return new Response("No encontrado", { status: 404 });
  if (!canExport(p.status)) return new Response("Solo se descarga lo aprobado: aprueba primero la producción.", { status: 409 });

  let assetId: string | undefined, name: string, type: string;
  if (f === "video") {
    assetId = p.videoAssetId; const a = assetId ? await storage.assets.get(assetId) : undefined;
    name = exportFileName(p, p.kind === "short" ? "9:16" : "16:9", (a?.height ?? 0) >= 1000 || (a?.width ?? 0) >= 1900 ? "1080p" : a && Math.min(a.width ?? 0, a.height ?? 0) >= 700 ? "720p" : "480p", "mp4"); type = "video/mp4";
  } else if (f === "export") {
    const j = await render.get(String(url.searchParams.get("job") ?? ""));
    if (!j || j.kind !== "export" || j.productionId !== p.id || j.status !== "done") return new Response("No encontrado", { status: 404 });
    assetId = j.outputAssetId; name = exportFileName(p, j.format, j.quality, "mp4"); type = "video/mp4";
  } else if (f === "srt" || f === "vtt") {
    const a = (await storage.assets.list()).find((x) => x.kind === "subtitle" && x.name === `subs-${p.id}.${f}`);
    assetId = a?.id; name = exportFileName(p, p.kind === "short" ? "9:16" : "16:9", "1080p", f).replace(/-1080p\./, "."); type = f === "vtt" ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8";
  } else return new Response("Parámetro f no válido", { status: 400 });

  const a = assetId ? await storage.assets.get(assetId) : undefined;
  if (!a) return new Response("No encontrado", { status: 404 });
  const file = path.join(MEDIA_DIR, path.basename(a.path));
  let size: number; try { size = (await fsp.stat(file)).size; } catch { return new Response("No encontrado", { status: 404 }); }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: {
    "Content-Type": type, "Content-Length": String(size), "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin",
  } });
}
