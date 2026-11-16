"use server";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProviders, MEDIA_DIR } from "./providers";
import { env } from "./env";
import { audit } from "./audit";
import { requireAdmin } from "./auth/guard";
import { RenderFormat, RenderQuality } from "@/domain/render";
import { getRenderQueue } from "./render";
import { getCapabilities } from "./render/ffmpeg";

const MAX_QUEUED = 50;
const Enqueue = z.object({
  format: RenderFormat, quality: RenderQuality,
  durationSec: z.coerce.number().int().min(1).max(120).default(8),
  productionId: z.string().max(100).optional(),
});
const refresh = () => revalidatePath("/render");

export async function enqueueRender(fd: FormData) {
  const user = await requireAdmin();
  const parsed = Enqueue.safeParse({
    format: fd.get("format"), quality: fd.get("quality"), durationSec: fd.get("durationSec") || undefined,
    productionId: String(fd.get("productionId") ?? "") || undefined,
  });
  if (!parsed.success) throw new Error("Parámetros de renderizado inválidos");
  const { render, storage } = getProviders();
  const cap = await getCapabilities();
  if (!cap.ok) throw new Error("El motor de renderizado no está disponible: " + cap.problems.join("; "));
  if (parsed.data.productionId && !(await storage.productions.get(parsed.data.productionId))) throw new Error("La producción no existe");
  const { queued } = await render.countActive();
  if (queued >= MAX_QUEUED) throw new Error(`La cola está llena (${MAX_QUEUED} trabajos pendientes)`);
  const id = crypto.randomUUID();
  await render.enqueue({
    id, kind: "slate", format: parsed.data.format, quality: parsed.data.quality, productionId: parsed.data.productionId,
    params: { durationSec: parsed.data.durationSec }, maxAttempts: env().KAP_RENDER_MAX_ATTEMPTS,
  }, Date.now());
  await audit("render.encolar", id, `${parsed.data.format} ${parsed.data.quality} ${parsed.data.durationSec}s`, user.username);
  getRenderQueue().kick(); refresh();
}

export async function cancelRender(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const st = await getRenderQueue().cancel(id);
  await audit("render.cancelar", id, st, user.username); refresh();
}

export async function retryRender(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const ok = await getProviders().render.retry(id);
  if (!ok) throw new Error("Solo se pueden reintentar trabajos fallidos o cancelados");
  await audit("render.reintentar", id, undefined, user.username);
  getRenderQueue().kick(); refresh();
}

export async function deleteRender(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const { render, storage } = getProviders();
  const j = await render.remove(id);
  if (!j) throw new Error("No se puede eliminar un trabajo en ejecución (cancélalo primero)");
  if (j.outputAssetId) {
    const a = await storage.assets.get(j.outputAssetId);
    if (a) { await fs.rm(path.join(MEDIA_DIR, path.basename(a.path)), { force: true }); await storage.assets.remove(a.id); }
  }
  await audit("render.eliminar", id, undefined, user.username); refresh();
}
