"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProviders } from "./providers";
import { audit } from "./audit";
import { requireAdmin } from "./auth/guard";
import { safeLocalPath } from "@/lib/security";
import { getAi } from "./ai/registry";
import { addToBase, commitMemory, createEpisodeFromRequest, MemoryError, proposeMemory, removeFromBase, retractMemory, saveDecisions, type MemoryDeps } from "./memory/service";
import type { Decision } from "@/memory";

/** Errores previsibles (reglas de la memoria): Next oculta el texto de los errores de acciones en producción, así que se devuelven por URL. */
async function run(fd: FormData, fallback: string, fn: () => Promise<void>) {
  try { await fn(); }
  catch (e) {
    if (e instanceof MemoryError || e instanceof z.ZodError) {
      const to = safeLocalPath(fd.get("_errorTo") || fd.get("_redirect"), fallback);
      const msg = e instanceof z.ZodError ? "Datos no válidos: " + e.issues.map((i) => i.message).join("; ") : e.message;
      redirect(`${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
    }
    throw e;
  }
}
const refresh = () => revalidatePath("/", "layout");
const back = (fd: FormData, fallback: string) => redirect(safeLocalPath(fd.get("_redirect"), fallback));
const deps = (user: string): MemoryDeps => ({ storage: getProviders().storage, ai: getAi(), log: (a, t, d) => audit(a, t, d, user) });

/** Recalcula la propuesta de cambios de memoria de un episodio (conserva decisiones y cambios manuales). */
export async function refreshMemory(fd: FormData) {
  return run(fd, "/episodios", async () => { const u = await requireAdmin(); await proposeMemory(deps(u.username), String(fd.get("id") ?? "")); refresh(); back(fd, "/episodios"); });
}

/** Guardar decisiones / aceptar todo / rechazar todo / confirmar en el canon. Confirmar exige episodio aprobado y todo decidido. */
export async function memoryDecide(fd: FormData) {
  return run(fd, "/episodios", async () => {
    const u = await requireAdmin(), id = String(fd.get("id") ?? ""), op = String(fd.get("op") ?? "save"), d = deps(u.username);
    const decisions: Record<string, Decision> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("d:") && (v === "accepted" || v === "rejected" || v === "pending")) decisions[k.slice(2)] = v;
    const all = op === "accept-all" ? "accepted" : op === "reject-all" ? "rejected" : undefined;
    const str = (k: string) => (fd.has(k) ? String(fd.get(k)) : undefined);
    await saveDecisions(d, id, { decisions, ...(all ? { all } : {}), summary: str("summary"), logline: str("logline"), endingNote: str("endingNote"), addManual: str("addManual") });
    if (op === "commit") await commitMemory(d, id, u.username);
    refresh(); back(fd, "/episodios");
  });
}

export async function retractMemoryAction(fd: FormData) {
  return run(fd, "/episodios", async () => { const u = await requireAdmin(); await retractMemory(deps(u.username), String(fd.get("id") ?? ""), u.username); refresh(); back(fd, "/episodios"); });
}

/** Canon base: reglas del universo, hechos y estados que escribe el usuario (escribirlos es su confirmación). */
export async function addBaseCanon(fd: FormData) {
  return run(fd, "/universo?tab=memoria", async () => { const u = await requireAdmin(); await addToBase(deps(u.username), String(fd.get("text") ?? ""), u.username); refresh(); back(fd, "/universo?tab=memoria"); });
}
export async function removeBaseCanon(fd: FormData) {
  return run(fd, "/universo?tab=memoria", async () => { const u = await requireAdmin(); await removeFromBase(deps(u.username), String(fd.get("changeId") ?? "")); await audit("memoria.base.quitar", "base", String(fd.get("changeId") ?? ""), u.username); refresh(); back(fd, "/universo?tab=memoria"); });
}

/** «Crea el episodio 7 continuando el 6»: interpreta la petición, arma el contexto y crea el borrador del episodio. */
export async function requestEpisode(fd: FormData) {
  return run(fd, "/universo?tab=memoria", async () => {
    const u = await requireAdmin(), text = String(fd.get("request") ?? "").trim().slice(0, 1000);
    if (!text) throw new MemoryError("Escribe la petición del episodio");
    const r = await createEpisodeFromRequest(deps(u.username), text); refresh(); redirect(`/episodios/${r.production.id}#memoria`);
  });
}
