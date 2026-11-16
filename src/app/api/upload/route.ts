import { adminOr401 } from "@/server/auth/guard";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProviders, MEDIA_DIR, TMP_DIR } from "@/server/providers";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { cleanOldTemp } from "@/server/tmp";
import { isSameOrigin, safeLocalPath } from "@/lib/security";
import { sniff } from "@/lib/sniff";
import { ffprobe, getCapabilities, type ProbeResult } from "@/server/render/ffmpeg";

export const runtime = "nodejs";

type Parsed = { fields: Record<string, string>; tmp?: string; name?: string; size: number; head: Uint8Array; truncated: boolean };

/** Recibe el multipart en streaming y vuelca el archivo a disco (nunca completo en memoria). */
function receive(req: Request, maxBytes: number): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: Object.fromEntries(req.headers), limits: { fileSize: maxBytes, files: 1, fields: 12, fieldSize: 2048, parts: 20 } });
    const out: Parsed = { fields: {}, size: 0, head: new Uint8Array(0), truncated: false };
    const writes: Promise<unknown>[] = [];
    bb.on("field", (k, v) => { out.fields[k] = v; });
    bb.on("file", (_field, stream, info) => {
      const tmp = path.join(TMP_DIR, `up-${crypto.randomUUID()}.part`);
      out.tmp = tmp; out.name = info.filename;
      const chunks: Buffer[] = []; let have = 0;
      stream.on("data", (c: Buffer) => { out.size += c.length; if (have < 64) { chunks.push(c); have += c.length; } });
      stream.on("limit", () => { out.truncated = true; });
      writes.push(pipeline(stream, fs.createWriteStream(tmp, { mode: 0o600 })).then(() => { out.head = new Uint8Array(Buffer.concat(chunks).subarray(0, 64)); }));
    });
    bb.on("error", reject);
    bb.on("close", () => Promise.all(writes).then(() => resolve(out), reject));
    if (!req.body) return reject(new Error("Cuerpo vacío"));
    Readable.fromWeb(req.body as never).on("error", reject).pipe(bb);
  });
}

export async function POST(req: Request) {
  const g = await adminOr401(); if ("denied" in g) return g.denied;
  if (!isSameOrigin(req.headers)) return new Response("Origen no permitido", { status: 403 });
  const maxBytes = env().KAP_MAX_UPLOAD_MB * 1024 * 1024;
  await fsp.mkdir(TMP_DIR, { recursive: true, mode: 0o700 });
  await fsp.mkdir(MEDIA_DIR, { recursive: true, mode: 0o700 });
  void cleanOldTemp(TMP_DIR, env().KAP_TEMP_TTL_HOURS);

  let parsed: Parsed;
  try { parsed = await receive(req, maxBytes); }
  catch { return new Response("Subida inválida", { status: 400 }); }

  const back = safeLocalPath(parsed.fields.redirect, "/biblioteca");
  const go = (q: string) => NextResponse.redirect(new URL(back + (back.includes("?") ? "&" : "?") + q, req.url), 303);
  const fail = async (msg: string) => { if (parsed.tmp) await fsp.rm(parsed.tmp, { force: true }); await audit("upload.rechazada", parsed.name, msg); return go("error=" + encodeURIComponent(msg)); };

  if (!parsed.tmp || parsed.size === 0) return fail("Selecciona un archivo");
  if (parsed.truncated) return fail(`El archivo supera el límite de ${env().KAP_MAX_UPLOAD_MB} MB`);
  const kind = sniff(parsed.head);
  if (!kind) return fail("Tipo de archivo no admitido (vídeo, imagen, audio o subtítulos reales; SVG/HTML no se aceptan)");

  // Integridad: el archivo debe ser realmente legible por FFmpeg (si está disponible). Se guardan sus metadatos reales.
  let probe: ProbeResult | undefined;
  if (kind.kind !== "subtitle" && (await getCapabilities()).ffprobe) {
    try { probe = await ffprobe(parsed.tmp); }
    catch { return fail("El archivo está dañado o no es un medio válido (FFmpeg no pudo leerlo)"); }
    if (kind.kind === "video" && !probe.hasVideo) return fail("El archivo no contiene pista de vídeo");
    if (kind.kind === "audio" && !probe.hasAudio) return fail("El archivo no contiene pista de audio");
  }

  const { storage } = getProviders();
  const id = crypto.randomUUID();
  const stored = id + kind.ext;
  await fsp.rename(parsed.tmp, path.join(MEDIA_DIR, stored));
  const safeName = path.basename(parsed.name ?? "archivo").replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ()]/g, "_").slice(0, 120);
  await storage.assets.save({
    id, kind: kind.kind, path: stored, origin: "uploaded", license: (parsed.fields.license || "propio").slice(0, 120),
    createdAt: new Date().toISOString(), name: safeName, mime: kind.mime, size: parsed.size,
    ...(probe ? { durationSec: probe.durationSec || undefined, width: probe.width || undefined, height: probe.height || undefined, hasAudio: probe.hasAudio } : {}),
  });
  const attach = parsed.fields.attachTo;
  if (attach && kind.kind === "video") {
    const p = await storage.productions.get(attach);
    if (p) {
      if (p.videoAssetId) {
        const old = await storage.assets.get(p.videoAssetId);
        if (old) { await fsp.rm(path.join(MEDIA_DIR, path.basename(old.path)), { force: true }); await storage.assets.remove(old.id); }
      }
      await storage.productions.save({ ...p, videoAssetId: id, updatedAt: new Date().toISOString() });
    }
  }
  await audit("upload.ok", id, `${safeName} · ${kind.mime} · ${parsed.size} B`);
  revalidatePath("/", "layout");
  return go("ok=1");
}
