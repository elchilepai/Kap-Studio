/**
 * Detección del tipo real de un archivo por sus primeros bytes ("magic numbers").
 * Nunca se confía en el Content-Type ni en la extensión que declara el cliente.
 * SVG y HTML quedan excluidos a propósito: pueden ejecutar scripts en el origen de la app.
 */
export type Sniffed = { kind: "video" | "image" | "audio" | "subtitle"; mime: string; ext: string };

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));
const eq = (b: Uint8Array, at: number, bytes: number[]) => bytes.every((v, i) => b[at + i] === v);

export function sniff(head: Uint8Array): Sniffed | null {
  if (head.length < 4) return null;
  if (eq(head, 0, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mime: "image/png", ext: ".png" };
  if (eq(head, 0, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg", ext: ".jpg" };
  if (ascii(head, 0, 4) === "GIF8") return { kind: "image", mime: "image/gif", ext: ".gif" };
  if (ascii(head, 0, 4) === "RIFF" && head.length >= 12) {
    const t = ascii(head, 8, 12);
    if (t === "WEBP") return { kind: "image", mime: "image/webp", ext: ".webp" };
    if (t === "WAVE") return { kind: "audio", mime: "audio/wav", ext: ".wav" };
    if (t === "AVI ") return { kind: "video", mime: "video/x-msvideo", ext: ".avi" };
  }
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") {
    const brand = ascii(head, 8, 12);
    if (brand === "M4A " || brand === "M4B ") return { kind: "audio", mime: "audio/mp4", ext: ".m4a" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime", ext: ".mov" };
    return { kind: "video", mime: "video/mp4", ext: ".mp4" };
  }
  if (eq(head, 0, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: "video", mime: "video/webm", ext: ".webm" };
  if (ascii(head, 0, 4) === "OggS") return { kind: "audio", mime: "audio/ogg", ext: ".ogg" };
  if (ascii(head, 0, 4) === "fLaC") return { kind: "audio", mime: "audio/flac", ext: ".flac" };
  if (ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return { kind: "audio", mime: "audio/mpeg", ext: ".mp3" };
  // Subtítulos: solo texto plano con marcas típicas (nunca marcado HTML/XML).
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head.slice(0, 512)).replace(/^﻿/, "");
  if (/^WEBVTT/.test(text)) return { kind: "subtitle", mime: "text/vtt", ext: ".vtt" };
  if (/^\s*\d+\s*\r?\n\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) return { kind: "subtitle", mime: "text/plain", ext: ".srt" };
  return null;
}
