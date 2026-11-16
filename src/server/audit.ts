import { getProviders } from "./providers";
import { currentUser } from "./auth/guard";

/** Anota una acción en el registro de actividad (con el usuario de la sesión). Nunca rompe la acción auditada. */
export async function audit(action: string, target?: string, detail?: string, actor?: string, ip?: string) {
  try {
    const who = actor ?? (await currentUser())?.username ?? "anónimo";
    await getProviders().storage.activity.record({ actor: who, action, target, detail: detail?.slice(0, 500), ip });
  } catch (e) { console.error("[audit] no se pudo registrar:", (e as Error).message); }
}
