import type { Asset, Character, Place, Production, Scene } from "@/domain/types";
import type { StyleBible } from "@/domain/animation";
import type { StageSpec, StyleParams } from "@/animation/types";
import { direct } from "@/animation/director";
import { buildSceneCues } from "@/server/studio/subtitles";
import { autoDesign, resolveAppearance } from "./design";
import { norm } from "@/server/studio/text";

export const LEAD = 0.3, TAIL = 0.5;   // la narración arranca 0,3 s después del inicio de la escena (igual que el montaje)

export const styleParams = (b?: StyleBible): StyleParams => ({ ink: b?.ink ?? "#0d0f14", line: b?.lineWidth ?? 0.045, grade: b?.grade ?? "none", vignette: b?.vignette ?? 0.3, shadow: b?.shadow ?? true });

export type StageCtx = {
  production: Production; characters: Character[]; places: Place[]; style?: StyleBible;
  assetInfo: (id?: string) => Promise<{ path: string; sig: string; kind: Asset["kind"] } | undefined>;
};

/**
 * Construye el escenario 2D de UNA escena a partir de su descripción estructurada y de la biblia visual
 * (diseño de personajes, prenda del reparto, escenario del lugar, estilo). Misma función para vista previa y exportación.
 */
export async function buildSceneStage(scene: Scene, o: { durationSec: number; tail: number; width: number; height: number; fps?: number; envelope?: number[]; index: number }, ctx: StageCtx) {
  const fps = o.fps ?? 30;
  const cast = new Map(ctx.production.cast.map((c) => [c.characterId, c.outfitId]));
  const actors = scene.characterIds.map((id) => ctx.characters.find((c) => c.id === id)).filter(Boolean).map((c) => ({
    id: c!.id, name: c!.name, appearance: resolveAppearance(c!.design ?? autoDesign(c!.name), cast.get(c!.id)),
  }));
  const provisional = scene.characterIds.map((id) => ctx.characters.find((c) => c.id === id)).filter((c) => c && !c.design).map((c) => c!.name);
  const place = ctx.places.find((p) => scene.location && norm(p.name) === norm(scene.location));
  const bg = await ctx.assetInfo(scene.visualAssetId && scene.visualSource !== "card" ? scene.visualAssetId : place?.set?.imageAssetId ?? place?.visualAssetId);
  const useImage = bg && bg.kind === "image" ? bg : undefined;
  const timed = buildSceneCues(scene.lines, o.durationSec, { maxChars: o.height > o.width ? 22 : 44, lead: LEAD, tail: TAIL });
  const envelopes = o.envelope ? timed.map((c) => o.envelope!.slice(Math.max(0, Math.floor((c.start - LEAD) * fps)), Math.max(1, Math.ceil((c.end - LEAD) * fps)))) : undefined;
  const stage: StageSpec = direct({
    duration: o.durationSec, tail: o.tail, aspect: o.width / o.height, index: o.index, fps, width: o.width, height: o.height,
    location: scene.location || scene.title, mood: scene.mood, tags: scene.tags, narration: scene.narration, characters: actors,
    lines: timed.map((c) => ({ speaker: c.speaker, text: c.text, start: c.start, end: c.end })), directions: scene.directions,
    set: { ...(place?.set ? { preset: place.set.preset, timeOfDay: place.set.timeOfDay, accent: place.set.accent } : {}), ...(useImage ? { preset: "image" as const, imageId: scene.visualAssetId && scene.visualSource !== "card" ? scene.visualAssetId : place?.set?.imageAssetId ?? place?.visualAssetId } : {}) },
    envelopes, style: styleParams(ctx.style),
  });
  const images: Record<string, { path: string; sig: string }> = useImage && stage.set.imageId ? { [stage.set.imageId]: { path: useImage.path, sig: useImage.sig } } : {};
  return { stage, images, provisional };
}
