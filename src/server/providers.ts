import path from "node:path";
import type { Providers } from "@/ports";
import { env } from "./env";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createSqliteAuth } from "@/adapters/local/sqlite-auth";

const notAvailable = (what: string) => async () => {
  throw new Error(`${what}: adaptador no configurado todavía`);
};

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ env().KAP_DATA_DIR);
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const TMP_DIR = path.join(DATA_DIR, "tmp");

const g = globalThis as unknown as { __kapProviders?: Providers };

/**
 * Composition root: único lugar donde se eligen adaptadores.
 * El almacenamiento es SQLite local y persistente; el resto de puertos lanzan un error
 * explícito hasta que exista un adaptador real (no se simulan integraciones).
 */
export function getProviders(): Providers {
  if (g.__kapProviders) return g.__kapProviders;
  const storage = createSqliteStorage(path.join(DATA_DIR, "kap.db"));
  return (g.__kapProviders = {
    storage, auth: createSqliteAuth(storage.db),
    scriptWriter: { id: "none", draft: notAvailable("ScriptWriter") },
    voice: { id: "none", synthesize: notAvailable("VoiceSynth") },
    renderer: { id: "none", render: notAvailable("Renderer") },
    publisher: { id: "none", publish: notAvailable("Publisher") },
    stats: { id: "none", fetch: notAvailable("ChannelStats") },
  });
}
