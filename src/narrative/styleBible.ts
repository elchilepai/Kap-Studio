/**
 * STYLE BIBLE + FICHAS DE PERSONAJE de KAP Studio (el producto es: HISTORIA + GUION + ESCENAS + IMAGEN POR ESCENA; el montaje se hace fuera, en CapCut).
 * El estilo sale de las imágenes de referencia (assets/style/refs): se extraen el lenguaje visual, las proporciones, las líneas, los colores y la composición;
 * NUNCA se copian sus escenas. Todo prompt de imagen lleva estos bloques para que cada escena tenga el mismo KAP, el mismo secundario y el mismo mundo.
 */
export const STYLE_REFS = ["assets/style/refs/ref-desierto-ladrillo.png", "assets/style/refs/ref-cueva.png", "assets/style/refs/ref-laboratorio.png", "assets/style/refs/ref-palacio.png"];
export const KAP_REF = "assets/kap/reference.jpg";

/** Lenguaje visual (en inglés: es lo que mejor entienden los generadores de imagen). */
export const STYLE_BLOCK = [
  "2D flat cartoon illustration for a YouTube explainer series, clean vector look, finished full-scene illustration (character, background, props and lighting are one integrated drawing)",
  "uniform thick black outlines (about the same weight on characters, props and background), flat color fills with a single soft shadow tone, no gradients on characters, small hand-drawn detail lines on surfaces (cracks, bricks, planks, grass tufts, folds)",
  "characters are simple and expressive: big round head, small dot eyes or simple eyes, thick expressive eyebrows, single-line mouth, compact chunky bodies, very readable silhouettes",
  "backgrounds are richly detailed but simplified: real depth with foreground, midground and background layers, perspective lines on floors and walls, props that tell the story, warm directional light with a long soft cast shadow",
  "cinematic composition with one clear focal point, rule of thirds, strong shape contrast between the character and the setting, generous clean negative space where subtitles or voice-over graphics can go",
].join(". ") + ".";

/** Paleta del mundo (de las referencias): cielo azul pálido, arena/ocre/terracota cálidos, marrones profundos y el negro de línea. KAP (negro y dorado) destaca sobre ella. */
export const PALETTE = { cielo: "#d3e6ef", arena: "#bc9f7a", ocre: "#f5c371", terracota: "#b57f59", marron: "#4c352b", lineaNegra: "#0c0806", luzCalida: "#fce197", sombra: "#8d715b" };
export const PALETTE_BLOCK = `color palette shared by every scene of the video: pale sky blue ${PALETTE.cielo}, sand ${PALETTE.arena}, warm ochre ${PALETTE.ocre}, terracotta ${PALETTE.terracota}, deep brown ${PALETTE.marron}, soft shadow ${PALETTE.sombra}, black linework ${PALETTE.lineaNegra}; warm late-afternoon light`;

export const NEGATIVE_BLOCK = "photorealistic, 3D render, anime, manga, painterly, watercolor, blurry, noisy texture, text, letters, watermark, logo, caption, extra fingers, extra limbs, deformed hands, different outfit, different face, different hairstyle, cropped head, low contrast, dark muddy colors";

export const CHARACTER_SHEETS: Record<string, string> = {
  KAP: "KAP (the main character; keep EXACTLY the same design in every scene, match the attached reference image): a kid with a big perfectly round plain white head, simple black oval eyes, thick black slightly angled eyebrows (serious, introverted look), small round ears with a small gold hoop earring in each ear, no hair, no nose, no visible mouth unless the scene needs one (then a simple single black line); oversized black hoodie with the hood bunched behind the neck and a kangaroo pocket; thick gold Cuban chain necklace with a gold brain-shaped pendant; wide baggy black pants; black-and-white low-top sneakers; white hands; compact chunky silhouette, head about one third of the body height",
  "HERMANO DE KAP": "KAP's little brother (a secondary character; keep EXACTLY the same design in every scene): about 80% of KAP's height, the same big round white head style with simple black dot eyes, thin eyebrows and a small friendly smile, a short brown hair tuft on top, no jewelry; mustard-yellow hoodie (#e9a23b), dark blue shorts, white sneakers with red soles; white hands; same line weight and flat-color style as KAP",
};
export const characterSheet = (name: string): string => { const k = Object.keys(CHARACTER_SHEETS).find((n) => n.toLowerCase() === name.trim().toLowerCase() || name.toLowerCase().includes(n.toLowerCase().split(" ").at(-1)!) && n !== "KAP"); return k ? CHARACTER_SHEETS[k] : `${name} (a new secondary character: describe it once in the first scene where it appears — face, hair, clothes, colors — and keep it IDENTICAL in every later scene; same drawing style as KAP)`; };

// ---------------------------------------------------------------- BIBLIAS GLOBALES (se añaden UNA vez al prompt final; las descripciones de escena no las repiten)
export const STYLE_BIBLE = `${STYLE_BLOCK} ${PALETTE_BLOCK}.`;
export const KAP_CHARACTER_BIBLE = CHARACTER_SHEETS.KAP;
/** Secundarios recurrentes (diseño fijo): se incluyen solo en los prompts de las escenas donde aparecen. */
export const SECONDARY_CHARACTER_BIBLE: Record<string, string> = {
  "HERMANO DE KAP": CHARACTER_SHEETS["HERMANO DE KAP"],
  NOA: "NOA (a recurring secondary character, gender-neutral teenager; keep EXACTLY the same design in every scene): the same big round white head style as KAP with simple black dot eyes and thin eyebrows, a short teal hair tuft on top, an oversized teal sweater, gray joggers, white sneakers, white hands; same line weight and flat-color style as KAP",
};
export const GLOBAL_NEGATIVE_PROMPT = NEGATIVE_BLOCK;
export const FORMAT_9_16 = "vertical 9:16 (1080x1920) framing designed for a short-form video: the main subject sits in the central safe area, important elements away from the top 12% and bottom 22% of the frame, no text, no captions, no watermark";
/** Ficha de un secundario por nombre (o la instrucción para describir uno nuevo una sola vez y mantenerlo igual). */
export const secondarySheet = (name: string): string => { const k = Object.keys(SECONDARY_CHARACTER_BIBLE).find((n) => n.toLowerCase() === name.trim().toLowerCase()); return k ? SECONDARY_CHARACTER_BIBLE[k] : `${name} (a new secondary character: describe its face, hair, clothes and colors once in the first scene where it appears and keep it IDENTICAL in every later scene; same drawing style as KAP)`; };
