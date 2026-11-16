"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProviders } from "./providers";
import { env } from "./env";
import { audit } from "./audit";
import { requireAdmin } from "./auth/guard";
import { RenderQuality, type RenderJob } from "@/domain/render";
import { Transition, type Scene } from "@/domain/types";
import { getRenderQueue } from "./render";
import { getCapabilities } from "./render/ffmpeg";
import { planProduction } from "./studio/produce";
import { parseBrief } from "./studio/brief";
import { deriveShorts } from "./studio/after";
import { textToLines } from "./studio/script";
import { safeLocalPath } from "@/lib/security";

/** Error de validación PREVISIBLE: en producción Next oculta el texto de los errores lanzados en acciones, así que se devuelven por URL. */
class UserError extends Error {}
async function run(fd: FormData, fallback: string, fn: () => Promise<void>) {
  try { await fn(); }
  catch (e) {
    if (e instanceof UserError || e instanceof z.ZodError) {
      const to = safeLocalPath(fd.get("_errorTo") || fd.get("_redirect"), fallback);
      const msg = e instanceof z.ZodError ? "Datos no válidos: " + e.issues.map((i) => i.message).join("; ") : e.message;
      redirect(`${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
    }
    throw e; // incluidas las redirecciones de éxito (NEXT_REDIRECT)
  }
}
const now = () => new Date().toISOString();
const refresh = () => revalidatePath("/", "layout");
const back = (fd: FormData, fallback: string) => redirect(safeLocalPath(fd.get("_redirect"), fallback));

async function loadEpisode(id: unknown) {
  const p = await getProviders().storage.productions.get(String(id ?? ""));
  if (!p) throw new UserError("Producción no encontrada");
  if (p.status === "PUBLISHED") throw new UserError("Esta producción ya está publicada: no se puede regenerar");
  return p;
}
async function enqueueJob(kind: RenderJob["kind"], format: RenderJob["format"], quality: RenderJob["quality"], productionId: string, params: Record<string, unknown>) {
  const cap = await getCapabilities();
  if (!cap.ok) throw new UserError("El motor de renderizado no está disponible: " + cap.problems.join("; "));
  const { render } = getProviders();
  if ((await render.countActive()).queued >= 50) throw new UserError("La cola está llena");
  const id = crypto.randomUUID();
  await render.enqueue({ id, kind, format, quality, productionId, params, maxAttempts: env().KAP_RENDER_MAX_ATTEMPTS }, Date.now());
  getRenderQueue().kick();
  return id;
}

const Generate = z.object({
  quality: RenderQuality.default("720p"), voice: z.enum(["none", "espeak"]).default("none"),
  shortsCount: z.coerce.number().int().min(0).max(6).optional(), musicVolume: z.coerce.number().min(0).max(1).default(0.22),
});

/** «Generar episodio»: un clic → guion → escenas → recursos → voz → montaje → Shorts → revisión. */
export async function generateEpisode(fd: FormData) {
  return run(fd, "/render", async () => {
    const user = await requireAdmin();
    const p = await loadEpisode(fd.get("id"));
    if (p.kind !== "episode") throw new UserError("Solo los episodios se generan; los Shorts se derivan del episodio");
    if (!p.script.trim()) throw new UserError("Este episodio no tiene guion. Escríbelo en la ficha (la redacción automática con IA aún no está conectada).");
    const g = Generate.parse({ quality: fd.get("quality") || undefined, voice: fd.get("voice") || undefined, shortsCount: fd.get("shortsCount") || undefined, musicVolume: fd.get("musicVolume") || undefined });
    const brief = String(fd.get("brief") ?? "").slice(0, 2000);
    const hints = parseBrief(brief);
    const shortsCount = g.shortsCount ?? hints.shortsCount ?? 3;
    const musicAssetId = String(fd.get("musicAssetId") ?? "") || undefined;
    const { storage } = getProviders();
    await storage.productions.save({ ...p, brief, musicAssetId, updatedAt: now() });
    const jobId = await enqueueJob("episode", "16:9", g.quality, p.id, { mode: "full", brief, voice: g.voice, musicAssetId, musicVolume: g.musicVolume, shortsCount, targetSec: hints.targetSec });
    await audit("estudio.generar", p.id, `${g.quality} voz=${g.voice} shorts=${shortsCount} job=${jobId}`, user.username);
    refresh(); back(fd, "/render");
  });
}

/** Vuelve a componer con las escenas actuales (tras corregirlas en el editor). Solo se re-renderiza lo cambiado. */
export async function recompose(fd: FormData) {
  return run(fd, "/render", async () => {
    const user = await requireAdmin();
    const p = await loadEpisode(fd.get("id"));
    if (!p.scenes.length) throw new UserError("No hay escenas: analiza el guion primero");
    const g = Generate.parse({ quality: fd.get("quality") || undefined, voice: fd.get("voice") || undefined, musicVolume: fd.get("musicVolume") || undefined });
    const musicAssetId = String(fd.get("musicAssetId") ?? "") || p.musicAssetId;
    await enqueueJob(p.kind, p.kind === "short" ? "9:16" : "16:9", g.quality, p.id, { mode: "rerender", voice: g.voice, musicAssetId, musicVolume: g.musicVolume });
    await audit("estudio.recomponer", p.id, undefined, user.username); refresh(); back(fd, "/render");
  });
}

export async function regenerateShorts(fd: FormData) {
  return run(fd, "/render", async () => {
    const user = await requireAdmin();
    const p = await loadEpisode(fd.get("id"));
    const g = Generate.parse({ quality: fd.get("quality") || undefined, voice: fd.get("voice") || undefined, shortsCount: fd.get("shortsCount") || 3 });
    const n = await deriveShorts(getProviders().storage, getProviders().render, p.id, g.shortsCount ?? 3, { quality: g.quality, maxAttempts: env().KAP_RENDER_MAX_ATTEMPTS, voice: g.voice }, (await import("./providers")).MEDIA_DIR);
    getRenderQueue().kick(); await audit("estudio.shorts", p.id, `${n} Shorts`, user.username); refresh(); back(fd, "/render");
  });
}

/** Solo análisis (sin renderizar): crea el plan de escenas y abre el editor para revisarlo. */
export async function analyzeScript(fd: FormData) {
  return run(fd, "/render", async () => {
    const user = await requireAdmin();
    const p = await loadEpisode(fd.get("id"));
    if (!p.script.trim()) throw new UserError("El episodio no tiene guion");
    const { scenes } = await planProduction(p, getProviders().storage, p.brief);
    await getProviders().storage.productions.save({ ...p, scenes, updatedAt: now() });
    await audit("estudio.analizar", p.id, `${scenes.length} escenas`, user.username); refresh(); back(fd, `/episodios/${p.id}/escenas`);
  });
}

const SceneForm = z.object({
  title: z.string().max(120), location: z.string().max(120), text: z.string().max(8000),
  durationSec: z.coerce.number().min(2).max(120), transition: Transition, motion: z.enum(["kenburns", "static"]),
  visualAssetId: z.string().optional(), narrationAssetId: z.string().optional(), sfxAssetId: z.string().optional(),
});

/** Corrección manual de una escena generada. Queda «bloqueada»: el pipeline no la sobrescribe. */
export async function saveScene(fd: FormData) {
  return run(fd, "/render", async () => {
    const user = await requireAdmin();
    const p = await loadEpisode(fd.get("id")); const sid = String(fd.get("sceneId"));
    const f = SceneForm.parse({
      title: fd.get("title") ?? "", location: fd.get("location") ?? "", text: fd.get("text") ?? "", durationSec: fd.get("durationSec"),
      transition: fd.get("transition"), motion: fd.get("motion"), visualAssetId: String(fd.get("visualAssetId") ?? "") || undefined,
      narrationAssetId: String(fd.get("narrationAssetId") ?? "") || undefined, sfxAssetId: String(fd.get("sfxAssetId") ?? "") || undefined,
    });
    const chars = await getProviders().storage.characters.list();
    const lines = textToLines(f.text, chars);
    const scenes = p.scenes.map((s): Scene => s.id !== sid ? s : {
      ...s, title: f.title, location: f.location, lines, narration: lines.filter((l) => !l.speaker).map((l) => l.text).join(" "),
      dialogue: lines.filter((l) => l.speaker).map((l) => `${l.speaker}: ${l.text}`).join("\n"),
      durationSec: f.durationSec, durationSource: f.durationSec !== s.durationSec ? "manual" : s.durationSource, transition: f.transition, motion: f.motion,
      visualAssetId: f.visualAssetId, visualSource: f.visualAssetId ? (f.visualAssetId === s.visualAssetId ? s.visualSource : "manual") : "card",
      narrationAssetId: f.narrationAssetId, sfxAssetId: f.sfxAssetId, locked: true,
    });
    await getProviders().storage.productions.save({ ...p, scenes, updatedAt: now() });
    await audit("estudio.escena_editar", `${p.id}:${sid}`, undefined, user.username); refresh(); back(fd, `/episodios/${p.id}/escenas`);
  });
}

export async function moveScene(fd: FormData) {
  return run(fd, "/render", async () => {
    await requireAdmin();
    const p = await loadEpisode(fd.get("id")); const i = p.scenes.findIndex((s) => s.id === fd.get("sceneId")); const j = i + (fd.get("dir") === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= p.scenes.length) return;
    const sc = [...p.scenes]; [sc[i], sc[j]] = [sc[j], sc[i]];
    await getProviders().storage.productions.save({ ...p, scenes: sc.map((s, k) => ({ ...s, order: k })), updatedAt: now() }); refresh(); back(fd, `/episodios/${p.id}/escenas`);
  });
}
export async function deleteScene(fd: FormData) {
  return run(fd, "/render", async () => {
    await requireAdmin();
    const p = await loadEpisode(fd.get("id"));
    await getProviders().storage.productions.save({ ...p, scenes: p.scenes.filter((s) => s.id !== fd.get("sceneId")).map((s, k) => ({ ...s, order: k })), updatedAt: now() }); refresh(); back(fd, `/episodios/${p.id}/escenas`);
  });
}
export async function addScene(fd: FormData) {
  return run(fd, "/render", async () => {
    await requireAdmin();
    const p = await loadEpisode(fd.get("id"));
    const s: Scene = Scene_default(p.scenes.length);
    await getProviders().storage.productions.save({ ...p, scenes: [...p.scenes, s], updatedAt: now() }); refresh(); back(fd, `/episodios/${p.id}/escenas`);
  });
}
const Scene_default = (order: number): Scene => ({ id: crypto.randomUUID(), order, title: `Escena ${order + 1}`, location: "", summary: "", characterIds: [], dialogue: "", durationSec: 5, lines: [{ text: "Texto de la escena." }], narration: "Texto de la escena.", visualHint: "", mood: "", tags: [], transition: "fade", motion: "kenburns", durationSource: "manual", locked: true });

export async function previewScene(fd: FormData) {
  return run(fd, "/render", async () => {
    await requireAdmin();
    const p = await loadEpisode(fd.get("id"));
    await enqueueJob("preview", "16:9", "480p", p.id, { mode: "rerender", sceneId: String(fd.get("sceneId")), voice: String(fd.get("voice") || "none") });
    refresh(); back(fd, `/episodios/${p.id}/escenas`);
  });
}

export async function saveSubtitleStyle(fd: FormData) {
  return run(fd, "/render", async () => {
    const user = await requireAdmin();
    const { storage } = getProviders();
    const cur = (await storage.settings.get("settings")) ?? { id: "settings" as const, channelName: "KAP", channelUrl: "", publishWeekday: 5, subtitlesEnabled: true, subtitleScale: 1, subtitlePosition: "bottom" as const };
    await storage.settings.save({ ...cur, subtitlesEnabled: fd.get("enabled") === "on", subtitleScale: Math.min(1.8, Math.max(0.6, Number(fd.get("scale")) || 1)), subtitlePosition: (["bottom", "center", "top"].includes(String(fd.get("position"))) ? String(fd.get("position")) : "bottom") as "bottom" });
    await audit("estudio.estilo_subtitulos", undefined, undefined, user.username); refresh(); back(fd, "/render");
  });
}

/** Metadatos de un recurso de la biblioteca para la asignación automática (rol, etiquetas, licencia). */
export async function setAssetMeta(fd: FormData) {
  return run(fd, "/render", async () => {
    const user = await requireAdmin();
    const { storage } = getProviders(); const a = await storage.assets.get(String(fd.get("id")));
    if (!a) throw new UserError("Recurso no encontrado");
    const role = z.enum(["background", "character", "narration", "music", "sfx", "other"]).parse(fd.get("role") || "other");
    const license = String(fd.get("license") ?? "").trim().slice(0, 200), attribution = String(fd.get("attribution") ?? "").trim().slice(0, 300);
    if (role === "music" && !license) throw new UserError("La música necesita una licencia (p. ej. «propia», «CC0», «CC BY 4.0») antes de poder usarse");
    const tags = String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
    await storage.assets.save({ ...a, role, tags, license: license || a.license, attribution: attribution || undefined });
    await audit("biblioteca.metadatos", a.id, role, user.username); refresh(); back(fd, "/biblioteca");
  });
}
