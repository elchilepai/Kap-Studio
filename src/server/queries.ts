import { getProviders } from "./providers";
import type { Production } from "@/domain/types";

export async function allProductions(): Promise<Production[]> {
  const list = await getProviders().storage.productions.list();
  return list.sort((a, b) => a.season - b.season || a.number - b.number);
}
export async function episodes() { return (await allProductions()).filter((p) => p.kind === "episode"); }
export async function shorts() { return (await allProductions()).filter((p) => p.kind === "short"); }
export async function pendingReviewCount() {
  return (await getProviders().storage.productions.list()).filter((p) => p.status === "REVIEW").length;
}
export const label = (p: Production) => `${p.kind === "episode" ? `T${p.season}E${p.number}` : `Short ${p.number}`} · ${p.title}`;
export const prodOptions = (list: Production[]) => list.map((p) => ({ value: p.id, label: label(p) }));
export function youtubeStatus() {
  const hasCreds = !!(process.env.YOUTUBE_OAUTH_CLIENT_ID && process.env.YOUTUBE_OAUTH_CLIENT_SECRET);
  return hasCreds
    ? { connected: false, label: "Credenciales presentes · autorización pendiente", detail: "La conexión OAuth se implementa en la Fase 5." }
    : { connected: false, label: "No conectado", detail: "Sin credenciales OAuth de YouTube. La publicación se hace en modo manual (paquete de exportación)." };
}
