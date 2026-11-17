import fs from "node:fs/promises";
import path from "node:path";
import type { RenderJob } from "@/domain/render";
import type { RenderStore, Storage } from "@/ports";
import { audit } from "@/server/audit";
import { today } from "@/lib/format";
import { planShorts } from "./shorts";
import type { ProduceParams } from "./produce";

const now = () => new Date().toISOString();

async function dropAsset(st: Storage, mediaDir: string, id?: string) {
  const a = id ? await st.assets.get(id) : undefined; if (!a) return;
  await fs.rm(path.join(mediaDir, path.basename(a.path)), { force: true }); await st.assets.remove(a.id);
}

/**
 * Tras un render correcto:
 *  · episodio/short: adjunta el vídeo, sustituye el anterior generado y pasa a REVISIÓN. NUNCA aprueba ni publica:
 *    la aprobación final sigue siendo manual del administrador (y se reinicia si el contenido cambia).
 *  · episodio (modo completo): deriva los Shorts 9:16 y los encola.
 *  · preview: conserva solo la última vista previa por producción.
 */
export async function afterRender(job: RenderJob, assetId: string, st: Storage, render: RenderStore, mediaDir: string, maxAttempts: number) {
  if (!job.productionId || job.kind === "slate") return;
  const prod = await st.productions.get(job.productionId); if (!prod) return;
  const prm = job.params as ProduceParams;

  if (job.kind === "preview") {
    for (const j of await render.list(200)) if (j.kind === "preview" && j.productionId === prod.id && j.id !== job.id && j.outputAssetId) { await dropAsset(st, mediaDir, j.outputAssetId); await render.remove(j.id); }
    return;
  }
  const old = prod.videoAssetId ? await st.assets.get(prod.videoAssetId) : undefined;
  if (old && old.origin === "generated") await dropAsset(st, mediaDir, old.id);
  const fresh = (await st.productions.get(prod.id))!;
  const dur = (await st.assets.get(assetId))?.durationSec ?? 0;
  await st.productions.save({ ...fresh, videoAssetId: assetId, durationSec: Math.round(dur), producedAt: today(), status: "REVIEW", updatedAt: now() });
  await audit("estudio.generado", prod.id, `${job.kind} ${job.format} ${job.quality} → en revisión`, "pipeline");

  if (job.kind === "episode" && (prm.shortsCount ?? 0) > 0)
    await deriveShorts(st, render, prod.id, prm.shortsCount!, { quality: job.quality, maxAttempts, voice: prm.voice, musicVolume: prm.musicVolume }, mediaDir);
}

/** Planifica y encola los Shorts 9:16 de un episodio (sustituye los automáticos anteriores aún no aprobados). */
export async function deriveShorts(st: Storage, render: RenderStore, episodeId: string, count: number,
  o: { quality: RenderJob["quality"]; maxAttempts: number; voice?: ProduceParams["voice"]; musicVolume?: number }, mediaDir: string): Promise<number> {
  const ep = await st.productions.get(episodeId); if (!ep || ep.kind !== "episode") return 0;
  for (const s of await st.productions.list())
    if (s.generated && s.parentId === ep.id && !["APPROVED", "SCHEDULED", "PUBLISHED"].includes(s.status)) { await dropAsset(st, mediaDir, s.videoAssetId); await st.productions.remove(s.id); }
  const plans = planShorts(ep.scenes, count);
  let num = Math.max(0, ...(await st.productions.list()).filter((p) => p.kind === "short").map((p) => p.number));
  for (const [k, pl] of plans.entries()) {
    const sc = pl.sceneIds.map((id) => ep.scenes.find((s) => s.id === id)!).filter(Boolean).map((s, i) => ({ ...s, id: crypto.randomUUID(), order: i }));
    const id = crypto.randomUUID(); num++;
    await st.productions.save({
      id, kind: "short", number: num, parentId: ep.id, season: ep.season, title: `${ep.title} · Short ${k + 1}`, status: "RENDER",
      synopsis: pl.reason, script: sc.map((s) => s.lines.map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)).join("\n")).join("\n\n"),
      scenes: sc, assetIds: [], durationSec: Math.round(pl.durationSec), generated: true, brief: "", cast: ep.cast, storyTime: ep.storyTime, musicAssetId: ep.musicAssetId, createdAt: now(), updatedAt: now(),
    });
    await render.enqueue({ id: crypto.randomUUID(), kind: "short", format: "9:16", quality: o.quality, productionId: id, maxAttempts: o.maxAttempts,
      params: { mode: "rerender", voice: o.voice ?? "none", musicAssetId: ep.musicAssetId, musicVolume: o.musicVolume } satisfies ProduceParams }, Date.now());
  }
  await audit("estudio.shorts", ep.id, `${plans.length} Shorts derivados y encolados`, "pipeline");
  return plans.length;
}
