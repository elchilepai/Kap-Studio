import { adminOr401 } from "@/server/auth/guard";
import { getProviders } from "@/server/providers";
import { getRenderQueue } from "@/server/render";

export const runtime = "nodejs";

/** Estado en vivo de la cola (lo consulta la interfaz cada ~1 s mientras hay trabajos activos). */
export async function GET() {
  const g = await adminOr401(); if ("denied" in g) return g.denied;
  getRenderQueue(); // garantiza que el worker está en marcha
  const { render, storage } = getProviders();
  const [jobs, counts, prods] = await Promise.all([render.list(60), render.countActive(), storage.productions.list()]);
  const label = new Map(prods.map((p) => [p.id, `${p.kind === "episode" ? `T${p.season}E${p.number}` : `Short ${p.number}`} · ${p.title}`]));
  return Response.json({
    now: Date.now(), counts,
    jobs: jobs.map((j) => ({ ...j, params: undefined, worker: undefined, productionLabel: j.productionId ? label.get(j.productionId) : undefined })),
  }, { headers: { "Cache-Control": "no-store" } });
}
