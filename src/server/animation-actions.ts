"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProviders } from "./providers";
import { audit } from "./audit";
import { requireAdmin } from "./auth/guard";
import { Accessory, HairStyle, Outfit, StyleBible } from "@/domain/animation";
import { ContinuityError, applyDesignChange } from "./animation/design";

const Draft = z.object({
  skin: z.string(), hairStyle: HairStyle, hairColor: z.string(), eyeColor: z.string(),
  height: z.number(), build: z.number(), outfits: z.array(Outfit.extend({ accessory: Accessory })).min(1),
});
const back = (msg?: string) => redirect(`/universo?tab=diseno${msg ? `&error=${encodeURIComponent(msg)}` : ""}`);

/** Guarda el diseño 2D de un personaje aplicando la regla de continuidad (justificación + versión). */
export async function saveCharacterDesign(fd: FormData) {
  const user = await requireAdmin();
  const { storage } = getProviders(); const c = await storage.characters.get(String(fd.get("characterId") ?? ""));
  if (!c) return back("Personaje no encontrado");
  let draft: z.infer<typeof Draft>;
  try { draft = Draft.parse(JSON.parse(String(fd.get("design") ?? "{}"))); } catch (e) { return back("Diseño no válido: " + (e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") : "formato incorrecto")); }
  try {
    const next = { archetype: "flat" as const, ...draft, version: c.design?.version ?? 1, changeLog: c.design?.changeLog ?? [] };
    const design = applyDesignChange(c, next, String(fd.get("note") ?? ""), new Date().toISOString());
    await storage.characters.save({ ...c, design });
    await audit("personaje.diseno", c.id, `v${design.version}`, user.username);
  } catch (e) { if (e instanceof ContinuityError) return back(e.message); throw e; }
  revalidatePath("/", "layout"); back();
}

export async function saveStyleBible(fd: FormData) {
  const user = await requireAdmin();
  const parsed = StyleBible.safeParse({
    id: "style", name: String(fd.get("name") ?? "KAP").slice(0, 60), referenceNotes: String(fd.get("referenceNotes") ?? "").slice(0, 4000),
    ink: String(fd.get("ink") ?? "#0d0f14"), lineWidth: Number(fd.get("lineWidth") ?? 0.045), grade: String(fd.get("grade") ?? "none"), vignette: Number(fd.get("vignette") ?? 0.3),
    shadow: fd.get("shadow") === "on", defaultMode: String(fd.get("defaultMode") ?? "animated2d"), updatedAt: new Date().toISOString(),
  });
  if (!parsed.success) return back("Estilo no válido: " + parsed.error.issues.map((i) => i.message).join("; "));
  await getProviders().storage.style.save(parsed.data); await audit("estilo.guardar", undefined, parsed.data.defaultMode, user.username);
  revalidatePath("/", "layout"); back();
}
