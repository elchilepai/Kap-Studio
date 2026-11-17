import type { Line } from "./script";
import { sentences } from "./text";
import { subtitleMetrics } from "@/animation/framing";

/**
 * Subtítulos. La sincronización es PROPORCIONAL: el tiempo de cada fragmento depende de su longitud dentro de la
 * ventana de locución de la escena (duración real del audio si existe; estimada si no). No es alineación forzada
 * palabra a palabra: eso requeriría un reconocedor de voz (proveedor futuro).
 */
export type Cue = { start: number; end: number; speaker?: string; text: string };
export type SubStyle = { enabled: boolean; scale: number; position: "bottom" | "center" | "top"; fontName: string };
export const DEFAULT_SUB_STYLE: SubStyle = { enabled: true, scale: 1, position: "bottom", fontName: "Inter" };

/** Parte `text` en como máximo 2 líneas equilibradas de `max` caracteres. */
export function wrap2(text: string, max: number): string[] {
  const t = text.trim(); if (t.length <= max) return [t];
  const words = t.split(/\s+/); let best = 0, diff = Infinity;
  for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(" ").length, b = words.slice(i).join(" ").length; const d = Math.abs(a - b); if (Math.max(a, b) <= max * 1.15 && d < diff) { diff = d; best = i; } }
  if (!best) best = Math.ceil(words.length / 2);
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** Reparte `text` en n trozos de longitud parecida cortando entre palabras (n = lo mínimo para que ninguno pase de `limit`). */
export function splitBalanced(text: string, limit: number): string[] {
  const t = text.trim(); if (t.length <= limit) return [t];
  const n = Math.ceil(t.length / limit), target = t.length / n, out: string[] = []; let buf = "";
  for (const w of t.split(/\s+/)) {
    const next = buf ? `${buf} ${w}` : w;
    if (buf && out.length < n - 1 && next.length > target && Math.abs(buf.length - target) <= Math.abs(next.length - target)) { out.push(buf); buf = w; } else buf = next;
  }
  if (buf) out.push(buf); return out;
}

/** `splitLong`: en formato vertical una frase larga no cabe en 2 líneas de ~22 caracteres: se divide en varios subtítulos consecutivos. */
export function buildSceneCues(lines: Line[], durationSec: number, o: { maxChars: number; lead?: number; tail?: number; splitLong?: boolean } ): Cue[] {
  const lead = o.lead ?? 0.3, tail = o.tail ?? 0.3;
  const win = Math.max(0.5, durationSec - lead - tail);
  const chunks: { speaker?: string; text: string }[] = [];
  for (const l of lines) {
    let buf = "";
    const flush = () => { if (buf.trim()) chunks.push({ speaker: l.speaker, text: buf.trim() }); buf = ""; };
    const parts = sentences(l.text).flatMap((x) => (o.splitLong ? splitBalanced(x, o.maxChars * 2) : [x]));
    for (const s of parts) { if (buf && (buf + " " + s).length > o.maxChars * 2) flush(); buf = (buf + " " + s).trim(); }
    flush();
  }
  const total = chunks.reduce((n, c) => n + c.text.length + 8, 0) || 1;
  let t = lead; const cues: Cue[] = [];
  for (const c of chunks) {
    const d = Math.max(0.9, (win * (c.text.length + 8)) / total);
    cues.push({ start: t, end: Math.min(durationSec, t + d), speaker: c.speaker, text: c.text }); t += d;
  }
  // si los mínimos de 0,9 s desbordan la ventana, se reescala para que nada quede fuera de la escena
  const over = (cues.at(-1)?.end ?? 0) > durationSec ? (durationSec - lead) / ((cues.at(-1)?.end ?? 1) - lead) : 1;
  return over < 1 ? cues.map((c) => ({ ...c, start: lead + (c.start - lead) * over, end: lead + (c.end - lead) * over })) : cues;
}

const ts = (s: number) => { const cs = Math.round(s * 100); const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), sec = Math.floor((cs % 6000) / 100); return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
const esc = (s: string) => s.replace(/\\/g, "＼").replace(/[{}]/g, "").replace(/\n/g, "\\N");
const ACCENT = "&H0049B9E9", WHITE = "&H00F5F5F5";

/** ASS (libass) con la identidad KAP: texto blanco con contorno oscuro #111318 y nombre del personaje en amarillo #E9B949. */
export function toASS(cues: Cue[], o: { width: number; height: number; style: SubStyle; maxChars?: number }): string {
  const vertical = o.height > o.width;
  const { fontSize: fs, align, marginV } = subtitleMetrics(o.width, o.height, o.style);   // misma fórmula que usa la composición para la zona segura
  const maxChars = o.maxChars ?? (vertical ? 22 : 44);
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${o.width}\nPlayResY: ${o.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: KAP,${o.style.fontName},${fs},${WHITE},${WHITE},&H00131118,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(fs * 0.07))},${Math.max(1, Math.round(fs * 0.03))},${align},${Math.round(o.width * 0.06)},${Math.round(o.width * 0.06)},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const ev = cues.map((c) => {
    const body = wrap2(c.text, maxChars).map(esc).join("\\N");
    const who = c.speaker ? `{\\c${ACCENT}&}${esc(c.speaker)}:{\\c${WHITE}&} ` : "";
    return `Dialogue: 0,${ts(c.start)},${ts(c.end)},KAP,,0,0,0,,{\\fad(120,120)}${who}${body}`;
  }).join("\n");
  return head + ev + "\n";
}

const srtTs = (s: number, comma: boolean) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}${comma ? "," : "."}${String(ms % 1000).padStart(3, "0")}`; };
const plain = (c: Cue) => (c.speaker ? `${c.speaker}: ` : "") + c.text;
export const toSRT = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${srtTs(c.start, true)} --> ${srtTs(c.end, true)}\n${plain(c)}\n`).join("\n");
export const toVTT = (cues: Cue[]) => "WEBVTT\n\n" + cues.map((c) => `${srtTs(c.start, false)} --> ${srtTs(c.end, false)}\n${plain(c)}\n`).join("\n");
