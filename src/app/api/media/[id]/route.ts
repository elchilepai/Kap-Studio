import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getProviders, MEDIA_DIR } from "@/server/providers";

export const runtime = "nodejs";

/** Sirve archivos con soporte de Range (necesario para reproducir vídeo en iPhone/Safari). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = await getProviders().storage.assets.get(id);
  if (!a) return new Response("No encontrado", { status: 404 });
  const file = path.join(MEDIA_DIR, path.basename(a.path));
  let size: number;
  try { size = (await fsp.stat(file)).size; } catch { return new Response("No encontrado", { status: 404 }); }
  const type = a.mime || "application/octet-stream";
  const base = {
    "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
    "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin",
  };
  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (end >= size) end = size - 1;
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...base, "Content-Length": String(size) } });
}
