/**
 * PROMPT DE IMAGEN POR ESCENA. La parte de ESCENA es corta y específica (escena, personajes, entorno, emoción, plano/composición, luz, objetos, propósito, espacio para subtítulos);
 * la Style Bible, las fichas de personaje, el formato y el negativo son GLOBALES y se combinan automáticamente al montar el prompt final (una sola vez, sin repetirlas en la escena;
 * la ficha de KAP solo entra en las escenas donde KAP aparece).
 */
import { FORMAT_9_16, GLOBAL_NEGATIVE_PROMPT, KAP_CHARACTER_BIBLE, KAP_REF, STYLE_BIBLE, STYLE_REFS, secondarySheet } from "./styleBible.ts";
import type { ShotType, VisualScene } from "./visualShort.ts";

const SHOT: Record<ShotType, string> = { wide: "wide establishing shot", medium: "medium shot", "close-up": "close-up", detail: "extreme close-up detail shot", side: "side-on profile shot", "over-shoulder": "over-the-shoulder shot", "low-angle": "low-angle shot", "top-down": "top-down overhead shot", pov: "first-person POV shot" };
const SPACE: Record<NonNullable<VisualScene["subtitleSpace"]>, string> = { top: "keep the top third calm and uncluttered", bottom: "keep the bottom third calm and uncluttered", left: "keep the left side calm and uncluttered", right: "keep the right side calm and uncluttered", none: "" };
const isKap = (c: string) => c.trim().toUpperCase() === "KAP";

/** SOLO lo específico de la escena (sin estilo, sin fichas, sin formato): es lo que se pega en un generador que ya tiene la Style Bible cargada. */
export function scenePrompt(s: VisualScene): string {
  const chars = s.characters.length ? s.characters.join(", ") : "no characters";
  const cam = [SHOT[s.shot], s.camera, s.composition].filter(Boolean).join("; "), space = SPACE[s.subtitleSpace ?? "bottom"];
  return [`SCENE: ${s.visualEn.trim().replace(/[.\s]+$/, "")}.`, `Characters: ${chars}.`, `Setting: ${s.location}.`, `Emotion: ${s.emotion}.`, `Camera/composition: ${cam}.`, s.lighting ? `Lighting: ${s.lighting}.` : "", s.objects?.length ? `Key objects: ${s.objects.join(", ")}.` : "", `Visual purpose: ${s.purpose}.`, space ? `${space[0].toUpperCase()}${space.slice(1)} (room for subtitles).` : ""].filter(Boolean).join("\n");
}

export type FinalPrompt = { scenePart: string; prompt: string; negative: string; references: string[]; globals: string[] };
/** Prompt final de la escena = escena + Style Bible global + fichas de los personajes que salen + formato 9:16. El negativo y las referencias van aparte. */
export function finalPrompt(s: VisualScene): FinalPrompt {
  const scenePart = scenePrompt(s), globals = ["STYLE_BIBLE"]; const sheets: string[] = [];
  if (s.characters.some(isKap)) { sheets.push(`- ${KAP_CHARACTER_BIBLE}`); globals.push("KAP_CHARACTER_BIBLE"); }
  const others = s.characters.filter((c) => !isKap(c)); if (others.length) { sheets.push(...others.map((c) => `- ${secondarySheet(c)}`)); globals.push("SECONDARY_CHARACTER_BIBLE"); }
  globals.push("FORMAT_9_16");
  const prompt = [scenePart, `STYLE (global): ${STYLE_BIBLE}`, ...(sheets.length ? [`CHARACTERS (identical design in every scene):\n${sheets.join("\n")}`] : []), `FORMAT (global): ${FORMAT_9_16}.`].join("\n\n");
  return { scenePart, prompt, negative: GLOBAL_NEGATIVE_PROMPT, references: s.characters.some(isKap) ? [KAP_REF, ...STYLE_REFS] : STYLE_REFS, globals };
}
