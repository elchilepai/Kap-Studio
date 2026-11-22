/**
 * STORYBOARD (módulo puro): el relato como lista de ESCENAS, cada una con su narración (lo que se dice, para la voz), su descripción visual (lo que se DIBUJA; nunca se pronuncia),
 * personajes, lugar, plano, emoción y propósito, y el PROMPT de la imagen ya montado con la style bible y las fichas de personaje. La salida principal es la imagen; el montaje es externo.
 */
import { ABSTRACT, COACH, MORAL, causalReasons, introReasons, type ShortBeat } from "./short.ts";
import { KAP_REF, NEGATIVE_BLOCK, PALETTE_BLOCK, STYLE_BLOCK, STYLE_REFS, characterSheet } from "./styleBible.ts";

export const ROLES = ["presenta", "ve-logro", "intenta-falla", "observa-prueba", "progreso"] as const;
export type Role = (typeof ROLES)[number];
export const SHOTS_SB = ["wide", "medium", "close-up", "detail", "side", "over-shoulder", "low-angle"] as const;
export const NEG_SPACE = ["top", "bottom", "left", "right", "none"] as const;
export type SceneSpec = { n: number; role: Role; narration: string; visual: string; visualEn: string; characters: string[]; location: string; shot: (typeof SHOTS_SB)[number]; emotion: string; purpose: string; negativeSpace: (typeof NEG_SPACE)[number] };
export type Storyboard = { title: string; objeto: string; objetivo: string; scenes: SceneSpec[] };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const wc = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
/** Segundos de voz de una narración (≈ 2,6 palabras/s, ritmo de locución de un Short). */
export const narrationSeconds = (t: string) => Math.round((wc(t) / 2.6 + 0.3) * 10) / 10;
export const totalNarrationSeconds = (s: Storyboard) => Math.round(s.scenes.reduce((n, x) => n + narrationSeconds(x.narration), 0) * 10) / 10;

const SHOT_TEXT: Record<SceneSpec["shot"], string> = { wide: "wide establishing shot (good for a slow zoom-in in editing)", medium: "medium shot, characters framed from the knees or waist up (good for dialogue)", "close-up": "close-up on the face (good for a reaction)", detail: "extreme close-up detail shot of the important object", side: "side-on profile shot with room to travel sideways (good for a pan)", "over-shoulder": "over-the-shoulder shot", "low-angle": "low-angle shot looking up at the character" };
const NEG_TEXT: Record<SceneSpec["negativeSpace"], string> = { top: "leave the top third of the frame calm and uncluttered", bottom: "leave the bottom third of the frame calm and uncluttered (for subtitles)", left: "leave the left side of the frame calm and uncluttered", right: "leave the right side of the frame calm and uncluttered", none: "" };

/** Una escena como VISUAL (acción) para reutilizar la comprobación de causalidad: lo que se dibuja es lo que ocurre. */
const asBeat = (s: SceneSpec): ShortBeat => ({ phase: "escalada", step: "intento", goal: s.purpose, action: s.visual, reaction: "", change: s.emotion, seconds: 6, shot: "medio", characters: s.characters, location: s.location, time: "tarde" });

/** Motivos por los que el storyboard NO sirve (vacío = sirve): estructura fija de 5 escenas, narración ≠ visual, causalidad visible en las imágenes, personajes y objeto coherentes. */
export function storyboardReasons(sb: Storyboard): string[] {
  const why: string[] = [], S = sb.scenes;
  if (S.length < 5) return [`faltan escenas (${S.length}; mínimo 5)`];
  S.slice(0, 5).forEach((s, i) => { if (s.role !== ROLES[i]) why.push(`la escena ${i + 1} debe ser «${ROLES[i]}» y es «${s.role}»`); });
  for (const s of S) {
    if (s.characters.length === 0) why.push(`la escena ${s.n} no tiene personajes`);
    if (wc(s.visual) < 14) why.push(`la descripción visual de la escena ${s.n} es demasiado vaga para dibujarla (${wc(s.visual)} palabras)`);
    if (wc(s.visualEn) < 20) why.push(`falta la descripción visual en inglés de la escena ${s.n}`);
    const nv = plain(s.narration), vv = plain(s.visual);
    if (nv && (vv.includes(nv) || nv.includes(vv))) why.push(`en la escena ${s.n} la narración repite la descripción visual`);
    if (/^(?:kap|el hermano|la hermana)\b.*\b(?:camina|mira|se sienta|se agacha|coge|coloca|levanta|sube|baja|corre|abre|cierra|entra|sale)\w*\b/.test(nv) && wc(s.narration) < 18) why.push(`la narración de la escena ${s.n} es una instrucción visual («${s.narration.slice(0, 40)}…»): lo que se dibuja no se dice`);
    if (ABSTRACT.test(nv) || COACH.test(nv) || MORAL.test(s.narration)) why.push(`la narración de la escena ${s.n} suena a coach o a moraleja`);
  }
  const a = S[0]; if (a) { const iw = introReasons(a.narration); if (iw.length) why.push(`escena 1: ${iw.join("; ")}`); if (!a.characters.some((c) => c.toUpperCase() === "KAP")) why.push("la escena 1 debe mostrar a KAP a cámara"); }
  if (!S.slice(1, 5).every((s) => s.characters.some((c) => c.toUpperCase() === "KAP"))) why.push("KAP debe aparecer en todas las escenas de la historia");
  if (S[1] && !S[1].characters.some((c) => c.toUpperCase() !== "KAP")) why.push("la escena 2 debe mostrar a OTRO personaje consiguiendo algo (la comparación se ve)");
  // causalidad visible en las imágenes 2-5 (la misma comprobación de contenido que usan los Shorts: objeto, acción de KAP, consecuencia, estrategia distinta, resultado)
  const cs = causalReasons([S[1], S[2], S[2], S[3], S[4], S[4]].filter(Boolean).map((s, k) => ({ ...asBeat(s!), reaction: "", step: (["situacion", "intento", "fallo", "segundo-intento", "descubrimiento", "remate"] as const)[k] })), sb.objeto);
  for (const c of cs) if (!/posterior|primer beat/.test(c)) why.push(`historia visual: ${c}`);
  return why;
}

/** Prompt completo de la imagen de una escena: estilo + paleta + fichas de los personajes presentes + plano + composición + espacio libre. */
export function imagePrompt(s: SceneSpec, o: { aspect?: "9:16" | "16:9" } = {}): { prompt: string; negative: string; references: string[] } {
  const chars = s.characters.map((c) => `- ${characterSheet(c)}`).join("\n"), aspect = o.aspect ?? "9:16";
  const prompt = [`${STYLE_BLOCK}`, PALETTE_BLOCK + ".", `SCENE: ${s.visualEn.trim().replace(/\s+$/, "")}`, `Location: ${s.location}. Mood / emotion: ${s.emotion}. Camera: ${SHOT_TEXT[s.shot]}.${NEG_TEXT[s.negativeSpace] ? ` Composition: ${NEG_TEXT[s.negativeSpace]}.` : ""}`, `CHARACTERS (identical design in every scene of the video):\n${chars}`, `Format: ${aspect === "9:16" ? "vertical 9:16 (1080x1920)" : "horizontal 16:9 (1920x1080)"}, no text, no captions, no watermark.`].join("\n\n");
  return { prompt, negative: NEGATIVE_BLOCK, references: [KAP_REF, ...STYLE_REFS] };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Guion en el formato pedido: SCENE 01 / Narration / Visual / Characters / Location / Shot / Emotion / Purpose (+ prompt de imagen). La Visual NO se pronuncia. */
export function storyboardMarkdown(sb: Storyboard, o: { aspect?: "9:16" | "16:9" } = {}): string {
  const head = `# ${sb.title}\n\n> Objeto central: ${sb.objeto} · Objetivo de KAP: ${sb.objetivo} · Narración total ≈ ${totalNarrationSeconds(sb)} s (${sb.scenes.length} escenas)\n> La línea «Visual» es una instrucción para la imagen y NO se pronuncia: solo se lee la «Narration».\n`;
  return head + sb.scenes.map((s) => { const p = imagePrompt(s, o); return `\n## SCENE ${pad(s.n)}\nNarration:\n"${s.narration}"\nVisual:\n"${s.visual}"\nCharacters:\n"${s.characters.join(", ")}"\nLocation:\n"${s.location}"\nShot:\n"${s.shot}"\nEmotion:\n"${s.emotion}"\nPurpose:\n"${s.purpose}"\n\nImage prompt (${o.aspect ?? "9:16"}):\n\`\`\`\n${p.prompt}\n\`\`\`\nNegative prompt:\n\`\`\`\n${p.negative}\n\`\`\`\nReferences to attach: ${p.references.join(", ")}\n`; }).join("");
}
/** Solo lo que se dice (para ElevenLabs): una línea por escena, sin ninguna descripción visual. */
export const narrationScript = (sb: Storyboard) => sb.scenes.map((s) => `SCENE ${pad(s.n)}: ${s.narration}`).join("\n") + "\n";
