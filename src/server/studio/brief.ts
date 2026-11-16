import { norm } from "./text";

/**
 * Interpretación MÍNIMA y por reglas de la petición del usuario. NO es comprensión de lenguaje natural:
 * solo reconoce patrones concretos. Todo lo demás se conserva tal cual para cuando exista un proveedor de IA.
 */
export type BriefHints = { targetSec?: number; shortsCount?: number; mood?: string; recognized: string[]; unrecognized: string };

const NUM: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
const MOODS: [RegExp, string][] = [[/oscur|sombri/, "oscuro"], [/tens/, "tenso"], [/aleg|diverti|luminos/, "alegre"], [/epic/, "épico"], [/calm|tranquil|sereno/, "calmado"], [/trist|melanc/, "triste"], [/misteri|intrig/, "misterio"]];

export function parseBrief(brief: string): BriefHints {
  const n = norm(brief); const rec: string[] = []; const h: BriefHints = { recognized: rec, unrecognized: brief.trim() };
  const m = /(\d+(?:[.,]\d+)?)\s*(?:min(?:uto)?s?\b|')/.exec(n);
  if (m) { const v = parseFloat(m[1].replace(",", ".")); if (v >= 0.5 && v <= 30) { h.targetSec = Math.round(v * 60); rec.push(`duración objetivo ${v} min`); } }
  if (/\bsin shorts?\b/.test(n)) { h.shortsCount = 0; rec.push("sin Shorts"); }
  else { const s = /(\d+|un|uno|una|dos|tres|cuatro|cinco|seis)\s+shorts?\b/.exec(n); if (s) { const v = /^\d+$/.test(s[1]) ? +s[1] : NUM[s[1]]; if (v >= 0 && v <= 8) { h.shortsCount = v; rec.push(`${v} Shorts`); } } }
  for (const [re, name] of MOODS) if (re.test(n)) { h.mood = name; rec.push(`ánimo «${name}»`); break; }
  return h;
}
