import { getProviders } from "./providers";

/** Anota una acción en el registro de actividad. Nunca debe romper la acción que se audita. */
export async function audit(action: string, target?: string, detail?: string, actor = "owner", ip?: string) {
  try { await getProviders().storage.activity.record({ actor, action, target, detail: detail?.slice(0, 500), ip }); }
  catch (e) { console.error("[audit] no se pudo registrar:", (e as Error).message); }
}
