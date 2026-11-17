import type { Production } from "@/domain/types";
import type { Storage } from "@/ports";
import type { StageSpec } from "@/animation/types";
import { buildSceneStage } from "./stage";

export type ScenePreview = { sceneId: string; stage: StageSpec; images: Record<string, string>; provisional: string[] };

/** Escenarios 2D de todas las escenas para revisar en el navegador (duraciones estimadas, labial sintético). Misma lógica que el render. */
export async function buildPreviews(p: Production, st: Storage, o: { width: number; height: number }): Promise<ScenePreview[]> {
  const [characters, places, style, assets] = await Promise.all([st.characters.list(), st.places.list(), st.style.get("style"), st.assets.list()]);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out: ScenePreview[] = [];
  for (const [i, s] of p.scenes.entries()) {
    const b = await buildSceneStage(s, { durationSec: Math.max(2.5, s.durationSec), tail: 0, width: o.width, height: o.height, index: i }, {
      production: p, characters, places, style, assetInfo: async (id) => { const a = id ? byId.get(id) : undefined; return a ? { path: a.path, sig: a.id, kind: a.kind } : undefined; },
    });
    out.push({ sceneId: s.id, stage: b.stage, images: Object.fromEntries(Object.keys(b.images).map((k) => [k, `/api/media/${k}`])), provisional: b.provisional });
  }
  return out;
}
