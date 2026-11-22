/**
 * ESTADO DE LAS IMÁGENES. Tener un PROMPT preparado no es tener la IMAGEN generada: este fichero (`imagenes-estado.md`) lista todas las escenas con el nombre esperado de su imagen, si su prompt está
 * listo y si la imagen ya está generada. La imagen se da por generada si el usuario la marca a mano (`[x]`) o si el fichero existe en `imagenes/`. Al regenerar el pack se CONSERVAN las marcas manuales.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { KAP_POSES, spoken, type VisualScene } from "@/narrative/visualShort";

const pad = (n: number) => String(n).padStart(2, "0"), EXT = [".png", ".jpg", ".jpeg", ".webp"];
export const imageFileName = (n: number) => `scene-${pad(n)}.png`;
export type ImageRow = { n: number; file: string; prompt: string; promptReady: boolean; manual: boolean; fileExists: boolean; generated: boolean };
/** Marcas manuales (`[x]` en la columna «imagen») de un imagenes-estado.md existente. */
export function parseMarks(md: string): Record<number, boolean> { const out: Record<number, boolean> = {}; for (const l of md.split("\n")) { const m = /^\|\s*(\d{2})\s*\|.*\|\s*\[( |x|X)\]\s*generada\s*\|\s*$/.exec(l); if (m) out[Number(m[1])] = m[2].toLowerCase() === "x"; } return out; }
const exists = async (f: string) => { try { await fs.access(f); return true; } catch { return false; } };
export async function imageRows(dir: string, scenes: VisualScene[], marks: Record<number, boolean> = {}): Promise<ImageRow[]> {
  const out: ImageRow[] = [];
  for (const s of scenes) { const base = imageFileName(s.n).replace(".png", ""); let fileExists = false; for (const e of EXT) if (await exists(path.join(dir, "imagenes", base + e))) { fileExists = true; break; } const manual = !!marks[s.n];
    out.push({ n: s.n, file: `imagenes/${imageFileName(s.n)}`, prompt: `prompts/scene-${pad(s.n)}.txt`, promptReady: await exists(path.join(dir, "prompts", `scene-${pad(s.n)}.txt`)), manual, fileExists, generated: manual || fileExists }); }
  return out;
}
export function statusMd(scenes: VisualScene[], rows: ImageRow[]): string {
  const done = rows.filter((r) => r.generated).length, ref = (s: VisualScene) => (s.kapPresent ? "KAP (reference.jpg)" : "—");
  return `# Estado de las imágenes\n\n**${done} de ${rows.length} imágenes generadas.** Tener el prompt listo NO es tener la imagen: marca \`[x]\` en la última columna cuando la hayas generado y guardado con el nombre indicado (o simplemente guarda el fichero en \`imagenes/\`; se detecta solo).\n\n| # | Imagen esperada | Prompt | Función | KAP | Imagen |\n|---|---|---|---|---|---|\n${rows.map((r) => { const s = scenes[r.n - 1]; return `| ${pad(r.n)} | ${r.file} | ${r.promptReady ? "listo ✅" : "pendiente ☐"} | ${s.block} · ${s.purpose.replace(/\|/g, "/")} | ${ref(s)} | [${r.generated ? "x" : " "}] generada |`; }).join("\n")}\n\nPendientes: ${rows.filter((r) => !r.generated).map((r) => pad(r.n)).join(", ") || "ninguna"}.\n`;
}
/** Una variación de pose por escena, para que quien genere las imágenes vea de un vistazo qué cuerpo/expresión lleva cada una. */
export const poseSummary = (s: VisualScene) => (s.kapPresent ? `${(s.kapPose ?? []).map((p) => KAP_POSES[p]).join(" + ")} · ${s.kapExpression}` : "sin KAP");
export const hasSpoken = (s: VisualScene) => !!spoken(s);
