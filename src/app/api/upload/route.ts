import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProviders, MEDIA_DIR } from "@/server/providers";
import type { Asset } from "@/domain/types";

export const runtime = "nodejs";

function kindOf(mime: string, name: string): Asset["kind"] | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(srt|vtt)$/i.test(name)) return "subtitle";
  return null;
}

export async function POST(req: Request) {
  const fd = await req.formData();
  const back = String(fd.get("redirect") || "/biblioteca");
  const go = (q: string) => NextResponse.redirect(new URL(back + (back.includes("?") ? "&" : "?") + q, req.url), 303);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return go("error=" + encodeURIComponent("Selecciona un archivo"));
  const kind = kindOf(file.type, file.name);
  if (!kind) return go("error=" + encodeURIComponent("Tipo de archivo no admitido (vídeo, imagen, audio o subtítulos)"));

  const { storage } = getProviders();
  const id = crypto.randomUUID();
  const ext = (path.extname(file.name) || "").toLowerCase().replace(/[^.a-z0-9]/g, "");
  const stored = id + ext;
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, stored), Buffer.from(await file.arrayBuffer()));
  await storage.assets.save({
    id, kind, path: stored, origin: "uploaded", license: String(fd.get("license") || "propio"),
    createdAt: new Date().toISOString(), name: file.name, mime: file.type, size: file.size,
  });
  const attach = String(fd.get("attachTo") || "");
  if (attach && kind === "video") {
    const p = await storage.productions.get(attach);
    if (p) {
      if (p.videoAssetId) {
        const old = await storage.assets.get(p.videoAssetId);
        if (old) { await fs.rm(path.join(MEDIA_DIR, path.basename(old.path)), { force: true }); await storage.assets.remove(old.id); }
      }
      await storage.productions.save({ ...p, videoAssetId: id, updatedAt: new Date().toISOString() });
    }
  }
  revalidatePath("/", "layout");
  return go("ok=1");
}
