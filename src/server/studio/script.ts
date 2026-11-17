import type { Scene } from "@/domain/types";
import { estimateSeconds, norm, sentences, tokens, uniq, wordCount } from "./text";
import { isMemoryKey } from "@/memory/directives";

/**
 * ANALIZADOR DE GUION POR REGLAS (no usa IA). Formato admitido:
 *
 *   # Refugio                      ← encabezado de escena (también "ESCENA 2: Refugio" o "INT. Refugio")
 *   [imagen: ciudad vacía de noche]← directivas: imagen, música, mood, transición, duración, sfx
 *   El viento golpea las ventanas. ← texto sin prefijo = narrador
 *   MIRA: ¿Lo oyes?                ← "NOMBRE: texto" (nombre en MAYÚSCULAS o personaje conocido) = diálogo
 *
 * Sin encabezados, cada párrafo es una escena candidata y se fusionan/dividen para un ritmo de 6-20 s.
 */
export type Line = { speaker?: string; text: string };
export type ParsedScene = {
  title: string; location: string; lines: Line[];
  imagen?: string; musica?: string; mood?: string; transicion?: string; duracion?: number; sfx?: string;
  /** Direcciones de escena 2D («clave: valor»): cámara, entra, sale, camina, expresión, gesto, mira, vfx, aparece, desaparece. */
  directions?: string[];
  /** Directivas de memoria narrativa («conoce: …», «obtiene: …»): se conservan aparte y NUNCA se narran ni van al director. */
  memory?: string[];
};
export type KnownCharacter = { id: string; name: string };

const HEADING = /^\s*(?:#{1,3}\s+|(?:ESCENA|ESC\.?|SCENE)\s*\d*\s*[:.\-—–]\s*|(?:INT|EXT)\.?\s+)(.+?)\s*$/i;
const DIRECTIVE = /^\s*\[\s*(música|musica|imagen|mood|ánimo|animo|transición|transicion|duración|duracion|sfx|efecto|cámara|camara|entra|sale|camina|expresión|expresion|gesto|pose|plano|mira|vfx|aparece|desaparece)\s*:\s*(.+?)\s*\]\s*$/i;
const STAGE_KEYS = new Set(["camara", "entra", "sale", "camina", "expresion", "gesto", "pose", "plano", "mira", "vfx", "aparece", "desaparece"]);
/** Cualquier otra línea «[clave: valor]» es una dirección que no conocemos: se AVISA en el editor, nunca se narra ni se subtitula. */
const GENERIC_DIRECTIVE = /^\s*\[\s*([^\]:]{1,30}?)\s*:\s*(.+?)\s*\]\s*$/;
const DIALOGUE = /^\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 .'-]{1,24}?)\s*:\s*(.+)$/;
const TRANSITIONS = ["cut", "fade", "fadeblack", "dissolve", "slideleft", "slideright", "wipeleft", "circleopen"];

function applyDirective(sc: ParsedScene, key: string, val: string) {
  const k = norm(key);
  if (isMemoryKey(k)) { (sc.memory ??= []).push(`${k.replace(/\s+/g, "-")}: ${val}`); return; }
  if (STAGE_KEYS.has(k)) { (sc.directions ??= []).push(`${k}: ${val}`); return; }
  if (k === "musica") sc.musica = val; else if (k === "imagen") sc.imagen = val;
  else if (k === "mood" || k === "animo") sc.mood = val; else if (k === "sfx" || k === "efecto") sc.sfx = val;
  else if (k === "transicion") { const t = norm(val).replace(/[^a-z]/g, ""); if (TRANSITIONS.includes(t)) sc.transicion = t; }
  else if (k === "duracion") { const n = parseFloat(val.replace(",", ".")); if (n >= 2 && n <= 60) sc.duracion = n; }
  else (sc.directions ??= []).push(`${k}: ${val}`);   // clave desconocida: llega al director, que la avisa
}

export function parseScript(text: string, chars: KnownCharacter[] = []): ParsedScene[] {
  const known = new Map(chars.map((c) => [norm(c.name), c.name]));
  const raw = text.replace(/\r/g, "").split("\n");
  const hasHeadings = raw.some((l) => HEADING.test(l));
  const scenes: ParsedScene[] = [];
  let cur: ParsedScene | null = null; let para: Line[] = []; const globalMem: string[] = [];
  const open = (title: string): ParsedScene => { const s: ParsedScene = { title, location: title, lines: [] }; scenes.push(s); return s; };

  const lineOf = (l: string): Line => {
    const m = DIALOGUE.exec(l);
    if (m) {
      const name = m[1].trim(); const kn = known.get(norm(name));
      if (kn) return { speaker: kn, text: m[2].trim() };
      if (name === name.toUpperCase() && /[A-ZÁÉÍÓÚÑÜ]/.test(name)) return { speaker: name, text: m[2].trim() };
    }
    return { text: l.trim() };
  };
  const flushPara = () => {
    if (!para.length) return;
    if (!hasHeadings) { const s = open(""); s.lines = para; } else { (cur ??= open("Apertura")).lines.push(...para); }
    para = [];
  };

  for (const l of raw) {
    const h = HEADING.exec(l);
    if (hasHeadings && h) { flushPara(); cur = open(h[1].trim()); continue; }
    const d = DIRECTIVE.exec(l) ?? (GENERIC_DIRECTIVE.exec(l) && !HEADING.test(l) ? GENERIC_DIRECTIVE.exec(l) : null);
    if (d && isMemoryKey(d[1]) && !cur) { globalMem.push(`${norm(d[1]).replace(/\s+/g, "-")}: ${d[2]}`); continue; }   // antes de la 1.ª escena: es del episodio entero
    if (d) { if (!hasHeadings) { flushPara(); } (cur ??= open(hasHeadings ? "Apertura" : "")); applyDirective(cur, d[1], d[2]); continue; }
    if (!l.trim()) { if (!hasHeadings) flushPara(); continue; }
    para.push(lineOf(l));
    if (hasHeadings) flushPara();
  }
  flushPara();
  const result = hasHeadings ? scenes.filter((s) => s.lines.length) : shape(scenes);
  if (globalMem.length && result[0]) result[0].memory = [...globalMem, ...(result[0].memory ?? [])];
  return result;
}

const sceneWords = (s: ParsedScene) => s.lines.reduce((n, l) => n + wordCount(l.text), 0);

/** Sin encabezados: fusiona párrafos cortos y divide los largos para obtener escenas de ritmo razonable. */
function shape(paras: ParsedScene[]): ParsedScene[] {
  const out: ParsedScene[] = [];
  for (const p of paras) {
    const last = out.at(-1);
    if (last && sceneWords(last) < 14 && sceneWords(last) + sceneWords(p) <= 45 && !p.imagen && !p.musica) { last.lines.push(...p.lines); }
    else out.push({ ...p, lines: [...p.lines] });
  }
  return out;
}

/** Divide escenas demasiado largas (> ~20 s) en frases, sin partir diálogos. */
export function splitLong(scenes: ParsedScene[], maxWords = 52): ParsedScene[] {
  const out: ParsedScene[] = [];
  for (const sc of scenes) {
    if (sceneWords(sc) <= maxWords) { out.push(sc); continue; }
    const units: Line[] = sc.lines.flatMap((l) => l.speaker ? [l] : sentences(l.text).map((t) => ({ text: t })));
    let part: Line[] = [], w = 0, n = 1;
    const push = () => { if (part.length) { out.push({ ...sc, title: n === 1 ? sc.title : `${sc.title} (${n})`.trim(), lines: part, imagen: sc.imagen, duracion: undefined, directions: n === 1 ? sc.directions : undefined, memory: n === 1 ? sc.memory : undefined }); n++; part = []; w = 0; } };
    for (const u of units) { const uw = wordCount(u.text); if (w + uw > maxWords && part.length) push(); part.push(u); w += uw; }
    push();
  }
  return out;
}

/** Convierte lo analizado en escenas del dominio (con duración estimada, personajes y etiquetas). */
export function toScenes(parsed: ParsedScene[], chars: KnownCharacter[], newId: () => string = () => crypto.randomUUID()): Scene[] {
  return splitLong(parsed).map((p, i) => {
    const text = p.lines.map((l) => `${l.speaker ?? ""} ${l.text}`).join(" ") + " " + p.title;
    const ntext = norm(text);
    const characterIds = chars.filter((c) => new RegExp(`(^|[^a-z0-9])${norm(c.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(ntext)).map((c) => c.id);
    const words = sceneWords(p);
    const title = p.title || p.lines.find((l) => !l.speaker)?.text.split(/\s+/).slice(0, 6).join(" ").replace(/[.,;:!?…]+$/, "") || `Escena ${i + 1}`;
    return {
      id: newId(), order: i, title, location: p.location || "", summary: "", characterIds,
      lines: p.lines, narration: p.lines.filter((l) => !l.speaker).map((l) => l.text).join(" "),
      dialogue: p.lines.filter((l) => l.speaker).map((l) => `${l.speaker}: ${l.text}`).join("\n"),
      visualHint: p.imagen ?? "", mood: p.mood ?? "",
      tags: uniq([...tokens(p.location), ...tokens(p.imagen ?? ""), ...tokens(p.mood ?? ""), ...chars.filter((c) => characterIds.includes(c.id)).flatMap((c) => tokens(c.name))]),
      transition: (p.transicion as Scene["transition"]) ?? "fade", motion: "kenburns" as const,
      durationSec: p.duracion ?? Math.round(estimateSeconds(words) * 10) / 10,
      durationSource: p.duracion ? ("manual" as const) : ("estimated" as const),
      sfxAssetId: undefined, directions: p.directions ?? [], memory: p.memory ?? [], locked: false,
    };
  });
}

/** Texto de una escena en formato de guion (para el editor). */
export const linesToText = (lines: Line[]) => lines.map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)).join("\n");
export function textToLines(text: string, chars: KnownCharacter[] = []): Line[] {
  const known = new Map(chars.map((c) => [norm(c.name), c.name]));
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = DIALOGUE.exec(l); if (m) { const kn = known.get(norm(m[1].trim())); if (kn) return { speaker: kn, text: m[2].trim() }; if (m[1] === m[1].toUpperCase()) return { speaker: m[1].trim(), text: m[2].trim() }; }
    return { text: l };
  });
}
