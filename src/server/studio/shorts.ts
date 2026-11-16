import type { Scene } from "@/domain/types";

/**
 * Selección de tramos para Shorts (reglas explicables, no IA). Se buscan ventanas de escenas consecutivas de
 * 20-58 s y se puntúan por: apertura del episodio (gancho), final (cliffhanger), densidad de diálogo y presencia
 * de personajes. Se eligen las N mejores sin solaparse y se devuelven en orden cronológico.
 */
export type ShortPlan = { sceneIds: string[]; startSec: number; durationSec: number; score: number; reason: string };
export const SHORT_MIN = 20, SHORT_MAX = 58;

export function planShorts(scenes: Scene[], count: number): ShortPlan[] {
  if (count <= 0 || scenes.length === 0) return [];
  const starts: number[] = []; let t = 0; for (const s of scenes) { starts.push(t); t += s.durationSec; }
  const cands: (ShortPlan & { a: number; b: number })[] = [];
  for (let a = 0; a < scenes.length; a++) {
    let dur = 0;
    for (let b = a; b < scenes.length; b++) {
      dur += scenes[b].durationSec;
      if (dur > SHORT_MAX) break;
      if (dur < SHORT_MIN && b < scenes.length - 1) continue;
      if (dur < 8) continue;
      const win = scenes.slice(a, b + 1);
      const dialogue = win.reduce((n, s) => n + s.lines.filter((l) => l.speaker).length, 0);
      const chars = new Set(win.flatMap((s) => s.characterIds)).size;
      const reasons: string[] = []; let score = dialogue * 1.2 + chars * 0.8 + Math.min(dur, SHORT_MAX) / 30;
      if (a === 0) { score += 3; reasons.push("apertura del episodio"); }
      if (b === scenes.length - 1) { score += 2; reasons.push("final / cliffhanger"); }
      if (dialogue) reasons.push(`${dialogue} líneas de diálogo`);
      cands.push({ a, b, sceneIds: win.map((s) => s.id), startSec: starts[a], durationSec: Math.round(dur * 10) / 10, score: Math.round(score * 10) / 10, reason: reasons.join(" · ") || "fragmento narrativo" });
    }
  }
  const chosen: typeof cands = [];
  for (const c of [...cands].sort((x, y) => y.score - x.score)) {
    if (chosen.length >= count) break;
    if (chosen.every((k) => c.b < k.a || c.a > k.b)) chosen.push(c);
  }
  return chosen.sort((x, y) => x.a - y.a).map(({ a: _a, b: _b, ...p }) => (void _a, void _b, p));
}
