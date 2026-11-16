import fs from "node:fs/promises";
import path from "node:path";
import { RenderError } from "./ffmpeg";

export const jobTmpDir = (tmpRoot: string, jobId: string) => path.join(tmpRoot, `render-${jobId}`);

/** Falla pronto, con un mensaje claro, si no hay espacio libre suficiente para renderizar. */
export async function ensureFreeSpace(dir: string, minMb: number): Promise<number> {
  await fs.mkdir(dir, { recursive: true });
  const st = await fs.statfs(dir);
  const freeMb = Math.floor((st.bavail * st.bsize) / 1048576);
  if (freeMb < minMb) throw new RenderError(`Espacio en disco insuficiente: ${freeMb} MB libres (mínimo ${minMb} MB)`, false);
  return freeMb;
}

/** Elimina carpetas temporales de render huérfanas (no pertenecen a un trabajo activo) y con más de `ttlMs`. */
export async function sweepRenderTemp(tmpRoot: string, isActive: (jobId: string) => boolean, ttlMs: number, now = Date.now()): Promise<number> {
  let n = 0, names: string[];
  try { names = await fs.readdir(tmpRoot); } catch { return 0; }
  for (const name of names) {
    const m = /^render-(.+)$/.exec(name); if (!m || isActive(m[1])) continue;
    const f = path.join(tmpRoot, name);
    try { const st = await fs.stat(f); if (now - st.mtimeMs > ttlMs) { await fs.rm(f, { recursive: true, force: true }); n++; } } catch { /* ignorar */ }
  }
  return n;
}

/** Mueve un archivo (rename; copia+borrado si cruza dispositivos). */
export async function moveFile(from: string, to: string) {
  await fs.mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
  try { await fs.rename(from, to); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e; await fs.copyFile(from, to); await fs.rm(from, { force: true }); }
}
