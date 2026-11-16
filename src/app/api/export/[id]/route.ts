import { adminOr401 } from "@/server/auth/guard";
import { getProviders } from "@/server/providers";
import { STATUS_LABEL } from "@/domain/workflow";

/** Paquete de publicación manual: metadatos listos para pegar en YouTube Studio. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await adminOr401(); if ("denied" in g) return g.denied;
  const { id } = await ctx.params;
  const { storage } = getProviders();
  const p = await storage.productions.get(id);
  if (!p) return new Response("No encontrado", { status: 404 });
  const parent = p.parentId ? await storage.productions.get(p.parentId) : undefined;
  const pkg = {
    canal: "KAP", tipo: p.kind === "episode" ? "episodio" : "short", temporada: p.season, numero: p.number,
    titulo: p.kind === "episode" ? `KAP T${p.season}E${p.number} — ${p.title}` : `${p.title} #shorts`,
    descripcion: p.synopsis, episodioRelacionado: parent?.title ?? null, estado: STATUS_LABEL[p.status],
    fechaPrevista: p.plannedDate ?? null, videoDescarga: p.videoAssetId ? `/api/media/${p.videoAssetId}` : null, guion: p.script,
  };
  return new Response(JSON.stringify(pkg, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="kap-${p.kind}-${p.number}.json"` },
  });
}
