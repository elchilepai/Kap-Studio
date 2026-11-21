import type { Line } from "./script";
import { sentences } from "./text";
import { subtitleMetrics } from "@/animation/framing";
import { fitTimeline, sceneTimeline, type TItem } from "./timeline";

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

/**
 * Subtítulos = SOLO lo que un personaje DICE. La narración/dirección no se subtitula (ni se pronuncia): dirige la animación.
 * Cada frase hablada ocupa su hueco de la línea de tiempo común (`items`, de la voz real si existe; si no, estimada y ajustada a la escena);
 * dentro de su hueco se reparte por frases. `splitLong`: en formato vertical una frase larga se divide en varios subtítulos consecutivos.
 */
export function buildSceneCues(lines: Line[], durationSec: number, o: { maxChars: number; lead?: number; tail?: number; splitLong?: boolean; items?: TItem[] }): Cue[] {
  const lead = o.lead ?? 0.3, tail = o.tail ?? 0.3, win = Math.max(0.5, durationSec - lead - tail);
  const items = o.items ?? fitTimeline(sceneTimeline(lines), win), cues: Cue[] = [];
  for (const it of items) {
    if (it.kind !== "dialogue") continue;
    const parts = sentences(it.text).flatMap((x) => (o.splitLong ? splitBalanced(x, o.maxChars * 2) : [x])), chunks: string[] = []; let buf = "";
    for (const sx of parts) { if (buf && (buf + " " + sx).length > o.maxChars * 2) { chunks.push(buf); buf = ""; } buf = (buf + " " + sx).trim(); }
    if (buf) chunks.push(buf);
    const total = chunks.reduce((n, c) => n + c.length + 8, 0) || 1, span = Math.max(0.3, it.end - it.start); let t = lead + it.start;
    for (const c of chunks) { const d = (span * (c.length + 8)) / total; cues.push({ start: t, end: Math.min(durationSec, t + d), speaker: it.speaker, text: c }); t += d; }
  }
  return cues;
}

/** Líneas que ve el DIRECTOR: las frases habladas (con su hablante) y las acciones narradas (sin hablante) con sus tiempos absolutos en la escena. */
export function timedLines(lines: Line[], durationSec: number, o: { maxChars: number; lead?: number; tail?: number; splitLong?: boolean; items?: TItem[] }): { speaker?: string; text: string; start: number; end: number; kind: "dialogue" | "action" }[] {
  const lead = o.lead ?? 0.3, tail = o.tail ?? 0.3, win = Math.max(0.5, durationSec - lead - tail), items = o.items ?? fitTimeline(sceneTimeline(lines), win), out: ReturnType<typeof timedLines> = [];
  for (const it of items) {
    if (it.kind === "action") { out.push({ text: it.text, start: lead + it.start, end: lead + it.end, kind: "action" }); continue; }
    out.push(...buildSceneCues([{ speaker: it.speaker, text: it.text }], durationSec, { ...o, items: [{ ...it, start: it.start, end: it.end }] }).map((c) => ({ speaker: c.speaker, text: c.text, start: c.start, end: c.end, kind: "dialogue" as const })));
  }
  return out;
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
