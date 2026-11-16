import type { Providers } from "@/ports";
import { createMemoryStorage } from "@/adapters/local/memory-storage";

const notAvailable = (what: string) => async () => {
  throw new Error(`${what}: adaptador no configurado todavía`);
};

/**
 * Composition root: único lugar donde se eligen adaptadores.
 * Fase 0: solo almacenamiento en memoria; el resto lanza "no configurado" de forma explícita
 * (no se simulan integraciones que no existen).
 */
export function getProviders(): Providers {
  return {
    storage: createMemoryStorage(),
    scriptWriter: { id: "none", draft: notAvailable("ScriptWriter") },
    voice: { id: "none", synthesize: notAvailable("VoiceSynth") },
    renderer: { id: "none", render: notAvailable("Renderer") },
    publisher: { id: "none", publish: notAvailable("Publisher") },
    stats: { id: "none", fetch: notAvailable("ChannelStats") },
  };
}
