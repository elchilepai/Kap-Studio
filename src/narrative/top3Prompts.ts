/**
 * PROMPTS TOP 3 V4 (módulo puro) — de una escena del storyboard a un prompt completo para una IMAGEN ESTÁTICA 9:16 (generador externo). El estilo global y la identidad de KAP son bloques fijos que se
 * añaden siempre igual (KAP solo si aparece), y la parte de la escena lleva composición, plano/perspectiva, posición/pose/expresión de KAP, entorno, luz, objetos, profundidad, acción congelada y texto.
 * No describe animación ni movimiento de cámara: eso es solo una sugerencia aparte para CapCut.
 */
import { wordCount } from "./visualShort.ts";
import { CAMARAS } from "./scenePlanV4.ts";
import type { Issue } from "./chainV4.ts";

export const STYLE_CARD = "Professional 2D stickman-style cartoon illustration, clean and cinematic. Thick confident black outlines, flat cel colors with soft shading and subtle gradients, with volume built through lighting, perspective, overlapping elements and depth, hand-inked texture strokes in the environment (wood grain, cracks, brick lines, fabric folds). Characters have big round white heads with simple black dot eyes. Richly detailed, believable backgrounds with three clear depth layers (foreground, midground, background) and slight atmospheric perspective. One strong, motivated light source per image (window light, screen glow, lamp, street light) with warm/cool contrast. Strong, varied composition and clear visual storytelling. Looks like a frame from a premium animated explainer channel, not a presentation slide.";
export const KAP_CARD = "KAP, the exact character from the attached reference image: a huge round bald white head with simple black oval eyes and thick black angular eyebrows, small round white ears each with a gold hoop earring, a short white neck, an oversized black hoodie (hood down) with a thick chunky gold chain and a gold brain-shaped pendant, wide baggy black pants, black-and-white low-top sneakers without logos, simple white rounded hands, bold black outline. Chibi proportions: the head is about one third of his height. Do not redesign him: no hair, no glasses, no beard, no extra accessories, no change of outfit or colors.";
export const FORMAT_CARD = "Vertical 9:16 aspect ratio (1080x1920), single still image. Keep the top 12% and the bottom 20% free of important details (subtitle and app UI safe area).";
export const NEGATIVE_CARD = "photorealistic, 3D render, generic flat vector clipart, stock illustration, corporate presentation style, childish crayon drawing, empty plain background, extra characters, extra fingers, redesigned KAP, brand names or logos, watermark, random or gibberish text, blurry text, motion blur, speed lines, animation frames, comic panels.";
export type PromptScene = { n: number; kapPresente: boolean; composicion: string; planoPerspectiva: string; kapPosicion: string; kapPose: string; kapExpresion: string; entorno: string; iluminacion: string; objetos: string; profundidad: string; accion: string; texto: string[]; capcut: { movimiento: (typeof CAMARAS)[number]; detalle: string } };
export type PromptPack = { estilo: string; kap: string; formato: string; negativo: string; escenas: PromptScene[] };

/** Prompt completo (un solo bloque de texto) para una escena. */
export function composePrompt(s: PromptScene): string {
  const kap = s.kapPresente ? `${KAP_CARD} In this image KAP is ${s.kapPosicion}. Pose: ${s.kapPose}. Expression: ${s.kapExpresion}.` : "KAP does not appear in this image; it still belongs to KAP's story through its objects and setting.";
  const text = s.texto.length ? `Text inside the image, rendered exactly, clean and legible, and nothing else: ${s.texto.map((t) => `"${t}"`).join(", ")}.` : "No text anywhere in the image.";
  return [`Use the attached KAP reference image as the character and style reference.`, `STYLE: ${STYLE_CARD}`, `CHARACTER: ${kap}`, `COMPOSITION: ${s.composicion}`, `SHOT AND PERSPECTIVE: ${s.planoPerspectiva}.`, `ENVIRONMENT: ${s.entorno}`, `LIGHTING: ${s.iluminacion}`, `OBJECTS: ${s.objetos}`, `DEPTH: ${s.profundidad}`, `FROZEN ACTION (a single still moment): ${s.accion}`, `TEXT: ${text}`, `FORMAT: ${FORMAT_CARD}`, `AVOID: ${NEGATIVE_CARD}`].join("\n");
}
const BRANDS = /\b(?:nike|jordan|adidas|instagram|whatsapp|tiktok|iphone|apple|samsung|youtube|facebook|twitter|snapchat|telegram)\b/i, ANIM = /\b(?:animat\w*|video|moving|motion|camera move\w*|zoom\w*|pan\b|rotat\w*|loop\w*)\b/i;
const FIELDS = ["composicion", "planoPerspectiva", "entorno", "iluminacion", "objetos", "profundidad", "accion"] as const;
/** Validación estructural de los prompts (sin modelo). */
export function promptIssues(p: PromptPack, sceneCount = 11): Issue[] {
  const out: Issue[] = [], add = (id: string, msg: string) => out.push({ id, msg });
  if (p.escenas.length !== sceneCount) add("escenas", `${p.escenas.length} prompts (deben ser ${sceneCount})`);
  for (const s of p.escenas) {
    for (const f of FIELDS) if (wordCount(s[f]) < 8) add("campo", `escena ${s.n}: «${f}» demasiado corto (< 8 palabras)`);
    if (s.kapPresente) for (const f of ["kapPosicion", "kapPose", "kapExpresion"] as const) if (wordCount(s[f]) < 3) add("kap", `escena ${s.n}: KAP aparece pero falta «${f}»`);
    const prompt = composePrompt(s), kapIn = prompt.includes("huge round bald white head");
    if (s.kapPresente !== kapIn) add("kap", `escena ${s.n}: la ficha de KAP debe aparecer solo cuando KAP aparece`);
    if (!/9:16/.test(prompt)) add("formato", `escena ${s.n}: falta la relación de aspecto 9:16`);
    if (BRANDS.test(prompt.replace(NEGATIVE_CARD, ""))) add("marca", `escena ${s.n}: menciona una marca o plataforma concreta`);
    if (ANIM.test(prompt.replace(NEGATIVE_CARD, "").replace(STYLE_CARD, ""))) add("animacion", `escena ${s.n}: describe animación o movimiento (el prompt es de una imagen estática)`);
    if (s.texto.length > 6 || s.texto.some((t) => wordCount(t) > 8)) add("texto", `escena ${s.n}: demasiado texto en la imagen`);
    if (!(CAMARAS as readonly string[]).includes(s.capcut.movimiento)) add("camara", `escena ${s.n}: movimiento «${s.capcut.movimiento}» no posible en CapCut`);
  }
  return out;
}
