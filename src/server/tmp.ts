import fs from "node:fs/promises";
import path from "node:path";

/** Borra archivos temporales más antiguos que `ttlHours`. Devuelve cuántos eliminó. */
export async function cleanOldTemp(dir: string, ttlHours: number, now = Date.now()): Promise<number> {
  let n = 0;
  let names: string[];
  try { names = await fs.readdir(dir); } catch { return 0; }
  for (const name of names) {
    const f = path.join(dir, name);
    try {
      const st = await fs.stat(f);
      if (st.isFile() && now - st.mtimeMs > ttlHours * 3600_000) { await fs.rm(f, { force: true }); n++; }
    } catch { /* ignorar */ }
  }
  return n;
}
