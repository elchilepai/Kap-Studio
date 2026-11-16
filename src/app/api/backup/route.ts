import { adminOr401 } from "@/server/auth/guard";
import { getProviders } from "@/server/providers";
import { audit } from "@/server/audit";
import { STORAGE_COLLECTIONS } from "@/adapters/local/sqlite-storage";

export async function GET() {
  const g = await adminOr401(); if ("denied" in g) return g.denied;
  const st = getProviders().storage as unknown as Record<string, { list(): Promise<unknown[]> }>;
  await audit("backup.descarga");
  const out: Record<string, unknown[]> = {};
  for (const c of STORAGE_COLLECTIONS) out[c] = await st[c].list();
  return new Response(JSON.stringify({ app: "kap-studio", exportedAt: new Date().toISOString(), data: out }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="kap-backup-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
