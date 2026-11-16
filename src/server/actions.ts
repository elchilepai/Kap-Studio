"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs/promises";
import path from "node:path";
import { getProviders, MEDIA_DIR } from "./providers";
import { ENTITIES, parseFields } from "./entities";
import { canTransition, STATUS_LABEL } from "@/domain/workflow";
import type { Job, ProductionStatus } from "@/domain/types";
import { Settings } from "@/domain/types";
import { today } from "@/lib/format";
import { safeLocalPath } from "@/lib/security";
import { audit } from "./audit";
import { requireAdmin } from "./auth/guard";

const now = () => new Date().toISOString();
const refresh = () => revalidatePath("/", "layout");

/** Crea o edita cualquier entidad genérica (personaje, lugar, coste, producción…). */
export async function saveEntity(fd: FormData) {
  await requireAdmin();
  const def = ENTITIES[String(fd.get("_entity"))];
  if (!def) throw new Error("Entidad desconocida");
  const st = getProviders().storage as unknown as Record<string, { get(id: string): Promise<unknown>; save(x: unknown): Promise<unknown> }>;
  const repo = st[def.collection as string];
  const id = String(fd.get("_id") ?? "");
  const existing = id ? ((await repo.get(id)) as Record<string, unknown> | undefined) : undefined;
  const data: Record<string, unknown> = {
    ...(existing ?? { id: crypto.randomUUID(), createdAt: now(), updatedAt: now() }),
    ...def.defaults, ...parseFields(def, fd),
  };
  if (def.key === "production") {
    const kind = String(fd.get("_kind") ?? existing?.kind ?? "episode");
    data.kind = kind;
    if (!existing) data.status = "IDEA";
    if (kind === "short" && fd.has("parentId")) data.parentId = String(fd.get("parentId") ?? "") || undefined;
    data.updatedAt = now();
  }
  const parsed = def.schema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  await repo.save(parsed.data);
  refresh();
  await audit(existing ? "entidad.editar" : "entidad.crear", `${def.key}:${(parsed.data as { id: string }).id}`);
  const back = safeLocalPath(fd.get("_redirect"), "");
  if (back) redirect(back);
}

export async function deleteEntity(entity: string, id: string, back?: string) {
  await requireAdmin();
  const def = ENTITIES[entity];
  if (!def) throw new Error("Entidad desconocida");
  const { storage } = getProviders();
  if (def.key === "production") {
    const p = await storage.productions.get(id);
    if (p?.videoAssetId) await removeAsset(p.videoAssetId);
    for (const s of (await storage.productions.list()).filter((x) => x.parentId === id)) await storage.productions.save({ ...s, parentId: undefined });
  }
  if (def.key === "character") {
    for (const r of (await storage.relationships.list()).filter((r) => r.fromId === id || r.toId === id)) await storage.relationships.remove(r.id);
  }
  await (storage as unknown as Record<string, { remove(id: string): Promise<void> }>)[def.collection as string].remove(id);
  await audit("entidad.eliminar", `${def.key}:${id}`);
  refresh();
  const to = safeLocalPath(back, "");
  if (to) redirect(to);
}

async function removeAsset(id: string) {
  const { storage } = getProviders();
  const a = await storage.assets.get(id);
  if (!a) return;
  await fs.rm(path.join(MEDIA_DIR, path.basename(a.path)), { force: true });
  await storage.assets.remove(id);
  for (const p of await storage.productions.list())
    if (p.videoAssetId === id) await storage.productions.save({ ...p, videoAssetId: undefined, updatedAt: now() });
}
export async function deleteAsset(id: string) {
  await requireAdmin(); await removeAsset(id); await audit("asset.eliminar", id); refresh(); }

/** Cambia la etapa de una producción respetando el flujo y sus precondiciones. */
export async function transition(id: string, to: ProductionStatus, note = "") {
  await requireAdmin();
  const { storage } = getProviders();
  const p = await storage.productions.get(id);
  if (!p) throw new Error("Producción no encontrada");
  if (!canTransition(p.status, to)) throw new Error(`No se puede pasar de ${STATUS_LABEL[p.status]} a ${STATUS_LABEL[to]}`);
  if (to === "REVIEW" && !p.videoAssetId) throw new Error("Adjunta un vídeo antes de enviar a revisión");
  if (to === "SCHEDULED" && !p.plannedDate) throw new Error("Indica la fecha de publicación prevista antes de programar");
  const upd = { ...p, status: to, updatedAt: now(), ...(to === "PUBLISHED" ? { publishedAt: today() } : {}) };
  await storage.productions.save(upd);
  if (["APPROVED", "REJECTED"].includes(to) || (p.status === "REVIEW" && to === "SCRIPTING")) {
    await storage.reviews.save({
      id: crypto.randomUUID(), productionId: id, decidedAt: now(), note,
      decision: to === "APPROVED" ? "approve" : to === "REJECTED" ? "reject" : "changes",
    });
  }
  await audit("produccion.transicion", id, `${p.status} → ${to}${note ? " · " + note : ""}`);
  refresh();
}
export async function transitionForm(fd: FormData) {
  await requireAdmin();
  await transition(String(fd.get("id")), String(fd.get("to")) as ProductionStatus, String(fd.get("note") ?? ""));
}

export async function publishForm(fd: FormData) {
  await requireAdmin();
  const { storage } = getProviders();
  const id = String(fd.get("id"));
  const p = await storage.productions.get(id);
  if (!p) throw new Error("Producción no encontrada");
  await storage.productions.save({ ...p, publishedUrl: String(fd.get("url") ?? "").trim() || undefined, updatedAt: now() });
  await transition(id, "PUBLISHED");
}

export async function schedule(fd: FormData) {
  await requireAdmin();
  const { storage } = getProviders();
  const id = String(fd.get("id"));
  const date = String(fd.get("plannedDate") ?? "");
  const p = await storage.productions.get(id);
  if (!p) throw new Error("Producción no encontrada");
  await storage.productions.save({ ...p, plannedDate: date || undefined, updatedAt: now() });
  if (p.status === "APPROVED") await transition(id, "SCHEDULED");
  else refresh();
}

/* ---- Trabajos (seguimiento manual hasta que existan automatizaciones) ---- */
const KIND_BY_STATUS: Partial<Record<ProductionStatus, Job["kind"]>> = {
  SCRIPTING: "script", STORYBOARD: "storyboard", ASSETS: "assets", VOICE: "voice", RENDER: "render", SCHEDULED: "publish",
};
export async function startJob(fd: FormData) {
  await requireAdmin();
  const { storage } = getProviders();
  const p = await storage.productions.get(String(fd.get("id")));
  if (!p) throw new Error("Producción no encontrada");
  await storage.jobs.save({
    id: crypto.randomUUID(), kind: KIND_BY_STATUS[p.status] ?? "other", productionId: p.id, state: "running",
    provider: "manual", log: [`${now()} Iniciado en etapa ${STATUS_LABEL[p.status]}`], createdAt: now(), acknowledged: false,
  });
  refresh();
}
export async function finishJob(fd: FormData) {
  await requireAdmin();
  const { storage } = getProviders();
  const j = await storage.jobs.get(String(fd.get("jobId")));
  if (!j) return;
  const failed = fd.get("outcome") === "failed";
  const msg = String(fd.get("message") ?? "").trim();
  await storage.jobs.save({ ...j, state: failed ? "failed" : "done", log: [...j.log, `${now()} ${failed ? "Fallo" : "Completado"}${msg ? ": " + msg : ""}`] });
  refresh();
}
export async function ackJob(fd: FormData) {
  await requireAdmin();
  const { storage } = getProviders();
  const j = await storage.jobs.get(String(fd.get("jobId")));
  if (j) await storage.jobs.save({ ...j, acknowledged: true });
  refresh();
}

/* ---- Configuración / historia ---- */
export async function saveSettings(fd: FormData) {
  await requireAdmin();
  const parsed = Settings.parse({
    id: "settings", channelName: String(fd.get("channelName") ?? "KAP").trim() || "KAP",
    channelUrl: String(fd.get("channelUrl") ?? "").trim(), publishWeekday: Number(fd.get("publishWeekday") ?? 5),
  });
  await getProviders().storage.settings.save(parsed);
  await audit("ajustes.guardar");
  refresh();
}
export async function saveStory(fd: FormData) {
  await requireAdmin();
  await getProviders().storage.story.save({ id: "story", summary: String(fd.get("summary") ?? ""), updatedAt: now() });
  refresh();
}

export async function setParent(fd: FormData) {
  await requireAdmin();
  const { storage } = getProviders();
  const p = await storage.productions.get(String(fd.get("id")));
  if (!p) throw new Error("Producción no encontrada");
  await storage.productions.save({ ...p, parentId: String(fd.get("parentId") ?? "") || undefined, updatedAt: now() });
  refresh();
}
