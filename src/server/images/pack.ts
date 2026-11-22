/**
 * PAQUETE DE IMÁGENES (flujo manual): guion → prompts visuales → imágenes. HOY el proyecto no tiene generador de imágenes (sin GPU, sin modelo de imagen y sin acceso a ellos),
 * así que KAP Studio deja listo, por escena, todo lo que hace falta para generarlas FUERA con el generador que se use: el prompt completo (style bible + fichas de personaje),
 * el prompt negativo, las imágenes de referencia a adjuntar y el guion de narración (para ElevenLabs). Las imágenes que se generen se dejan en `imagenes/scene-NN.png`
 * y `missingImages` dice cuáles faltan. Cuando exista un generador local, se enchufa como `ImageProvider` (puerto en ports/studio.ts) sin cambiar el resto.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { ImageProvider } from "@/ports/studio";
import { imagePrompt, narrationScript, storyboardMarkdown, type Storyboard } from "@/narrative/storyboard";
import { KAP_REF, STYLE_REFS } from "@/narrative/styleBible";

const pad = (n: number) => String(n).padStart(2, "0"), EXT = [".png", ".jpg", ".jpeg", ".webp"];
export async function writeImagePack(dir: string, sb: Storyboard, o: { aspect?: "9:16" | "16:9"; root?: string } = {}): Promise<{ files: string[] }> {
  const root = o.root ?? process.cwd(), files: string[] = []; const w = async (rel: string, text: string) => { const f = path.join(dir, rel); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, text); files.push(rel); };
  await w("storyboard.md", storyboardMarkdown(sb, o)); await w("storyboard.json", JSON.stringify(sb, null, 1)); await w("narracion-elevenlabs.txt", narrationScript(sb));
  for (const s of sb.scenes) { const p = imagePrompt(s, o); await w(`prompts/scene-${pad(s.n)}.txt`, `${p.prompt}\n\n--- NEGATIVE PROMPT ---\n${p.negative}\n\n--- ATTACH AS REFERENCE ---\n${p.references.join("\n")}\n`); }
  await fs.mkdir(path.join(dir, "imagenes"), { recursive: true }); await fs.mkdir(path.join(dir, "referencias"), { recursive: true });
  for (const ref of [KAP_REF, ...STYLE_REFS]) { try { await fs.copyFile(path.join(root, ref), path.join(dir, "referencias", path.basename(ref))); files.push(`referencias/${path.basename(ref)}`); } catch { /* sin referencia en disco */ } }
  await w("LEEME.md", `# Cómo usar este paquete\n\n1. Para cada escena, abre \`prompts/scene-NN.txt\`, pégalo en tu generador de imágenes y **adjunta las referencias** de \`referencias/\` (KAP: \`reference.jpg\`; estilo: las otras). Usa el negative prompt si tu generador lo admite.\n2. Guarda cada imagen como \`imagenes/scene-NN.png\` (mismo NN que la escena). Usa el MISMO generador, semilla/estilo y referencias en todas para mantener a KAP, al hermano y el mundo idénticos.\n3. \`narracion-elevenlabs.txt\` es lo único que se debe locutar: las descripciones «Visual» NO se pronuncian.\n4. Monta en CapCut: zoom, paneo, transiciones, música, subtítulos y efectos.\n\nImágenes esperadas: ${sb.scenes.length}. Formato: ${o.aspect ?? "9:16"}.\n`);
  return { files };
}
/** Escenas cuya imagen todavía no está en `imagenes/` (scene-NN.png|jpg|webp). */
export async function missingImages(dir: string, sb: Storyboard): Promise<number[]> {
  const out: number[] = []; for (const s of sb.scenes) { let ok = false; for (const e of EXT) { try { await fs.access(path.join(dir, "imagenes", `scene-${pad(s.n)}${e}`)); ok = true; break; } catch { /* siguiente extensión */ } } if (!ok) out.push(s.n); } return out;
}
/** Proveedor «manual»: declara honestamente que NO genera imágenes (el generador está fuera); sirve para que las capacidades lo muestren y para enchufar uno real después. */
export const manualImageProvider: ImageProvider = { id: "manual", label: "Generador externo (flujo manual por prompts)", free: true, available: async () => false, generate: async () => { throw new Error("No hay generador de imágenes conectado: usa los prompts del paquete (src/server/images/pack.ts)."); } };
