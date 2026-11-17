import type { Scene } from "@/domain/types";
import { parseDirection, beatToDirection, type Beat } from "@/animation/beats";
import type { ScreenplayIR, IRScene } from "@/domain/screenplay";
import type { ScriptInterpreter } from "@/ports/studio";
import { estimateSeconds, norm, tokens, uniq, wordCount } from "./text";
import { parseScript, splitLong, type ParsedScene } from "./script";

/** Texto del autor (formato documentado) → IR. Es el ÚNICO sitio que conoce la sintaxis del guion. */
export function parsedToIR(parsed: ParsedScene[]): ScreenplayIR {
  const warnings: string[] = [];
  const scenes: IRScene[] = splitLong(parsed).map((p, i) => {
    const beats: Beat[] = [];
    for (const raw of p.directions ?? []) { const r = parseDirection(raw); if (r.beat) beats.push(r.beat); else warnings.push(`Escena ${i + 1}: ${r.warning}`); }
    return {
      title: p.title, location: p.location, mood: p.mood ?? "", lines: p.lines.map((l) => ({ ...(l.speaker ? { speaker: l.speaker } : {}), text: l.text })), beats,
      ...(p.directions?.length ? { source: p.directions } : {}), memory: p.memory ?? [],
      hints: { ...(p.imagen ? { image: p.imagen } : {}), ...(p.musica ? { music: p.musica } : {}), ...(p.transicion ? { transition: p.transicion } : {}), ...(p.duracion ? { durationSec: p.duracion } : {}), ...(p.sfx ? { sfx: p.sfx } : {}) },
    };
  });
  return { v: 1, scenes, warnings };
}

/** Intérprete por reglas: no usa IA. Es el intérprete que hay conectado hoy. */
export const ruleInterpreter: ScriptInterpreter = {
  id: "reglas", label: "Intérprete por reglas (formato documentado)", free: true,
  available: async () => true,
  interpret: async ({ script, characters }) => parsedToIR(parseScript(script, characters.map((c, i) => ({ id: String(i), name: c.name })))),
};

/** IR validada → escenas del dominio (ids, personajes de la biblia, duraciones estimadas, etiquetas). Las direcciones quedan como texto editable. */
export function irToScenes(ir: ScreenplayIR, chars: { id: string; name: string }[], newId: () => string = () => crypto.randomUUID()): Scene[] {
  const out = ir.scenes.map((p, i) => {
    const named = new Set([...p.lines.map((l) => l.speaker), ...p.beats.map((b) => ("actor" in b ? b.actor : undefined))].filter(Boolean).map((n) => norm(n!)));
    const text = norm(p.lines.map((l) => `${l.speaker ?? ""} ${l.text}`).join(" ") + " " + p.title);
    const characterIds = chars.filter((c) => named.has(norm(c.name)) || new RegExp(`(^|[^a-z0-9])${norm(c.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text)).map((c) => c.id);
    const words = p.lines.reduce((n, l) => n + wordCount(l.text), 0);
    const title = p.title || p.lines.find((l) => !l.speaker)?.text.split(/\s+/).slice(0, 6).join(" ").replace(/[.,;:!?…]+$/, "") || `Escena ${i + 1}`;
    return {
      id: newId(), order: i, title, location: p.location, summary: "", characterIds, lines: p.lines.map((l) => ({ speaker: l.speaker, text: l.text })),
      narration: p.lines.filter((l) => !l.speaker).map((l) => l.text).join(" "), dialogue: p.lines.filter((l) => l.speaker).map((l) => `${l.speaker}: ${l.text}`).join("\n"),
      visualHint: p.hints.image ?? "", mood: p.mood,
      tags: uniq([...tokens(p.location), ...tokens(p.hints.image ?? ""), ...tokens(p.mood), ...chars.filter((c) => characterIds.includes(c.id)).flatMap((c) => tokens(c.name))]),
      transition: (p.hints.transition as Scene["transition"]) ?? "fade", motion: "kenburns" as const,
      durationSec: p.hints.durationSec ?? Math.round(estimateSeconds(words) * 10) / 10, durationSource: p.hints.durationSec ? ("manual" as const) : ("estimated" as const),
      directions: p.source ?? p.beats.map(beatToDirection), memory: p.memory ?? [], locked: false,
    };
  });
  // Ritmo: si el autor no fija la transición, cambio de lugar → fundido (a negro si es oscuro); mismo lugar con diálogo → CORTE seco; mismo lugar sin diálogo → disolución.
  return out.map((sc, i) => {
    if (ir.scenes[i].hints.transition || i === 0) return sc;
    const prev = ir.scenes[i - 1], cur = ir.scenes[i]; const same = norm(prev.location) === norm(cur.location) && !!cur.location; const dialog = cur.lines.some((l) => l.speaker);
    const t: Scene["transition"] = !same ? (/oscur|tens|miedo|misteri/.test(norm(cur.mood)) ? "fadeblack" : "fade") : dialog ? "cut" : "dissolve";
    return { ...sc, transition: t };
  });
}
