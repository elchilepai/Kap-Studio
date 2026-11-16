import type { Asset, Character, Place, Scene } from "@/domain/types";
import { norm, tokens, uniq } from "./text";

/**
 * Asignación de recursos visuales a escenas (reglas, no IA). Prioridad:
 *  1. elección manual (escena bloqueada o con visual manual)   2. directiva [imagen: …]
 *  3. memoria visual del lugar (Place.visualAssetId → continuidad entre episodios)
 *  4. mejor coincidencia de etiquetas/nombre en la biblioteca  5. imagen de referencia del personaje
 *  6. tarjeta KAP (sin recurso): honesto, no se inventa ninguna imagen.
 */
export type Assignment = { visualAssetId?: string; visualSource: NonNullable<Scene["visualSource"]>; rememberPlace?: { placeName: string; assetId: string } };

const isVisual = (a: Asset) => (a.kind === "image" || a.kind === "video") && a.role !== "music" && a.role !== "narration" && a.role !== "sfx";
const assetTokens = (a: Asset) => uniq([...(a.tags ?? []).flatMap((t) => tokens(t)), ...tokens(a.name.replace(/\.[a-z0-9]+$/i, ""))]);
const score = (want: string[], a: Asset) => { const have = new Set(assetTokens(a)); return want.filter((t) => have.has(t)).length; };

export function assignVisual(scene: Scene, ctx: { assets: Asset[]; characters: Character[]; places: Place[]; recent: string[] }): Assignment {
  const visuals = ctx.assets.filter(isVisual);
  const ok = (id?: string) => !!id && visuals.some((a) => a.id === id);
  if (scene.visualSource === "manual" && ok(scene.visualAssetId)) return { visualAssetId: scene.visualAssetId, visualSource: "manual" };

  const variety = (list: { a: Asset; s: number }[]) => {            // evita repetir la misma imagen más de 2 veces seguidas
    const best = [...list].sort((x, y) => y.s - x.s || x.a.createdAt.localeCompare(y.a.createdAt));
    const repeated = (id: string) => ctx.recent.slice(-2).every((r) => r === id) && ctx.recent.length >= 2;
    return best.find((b) => !repeated(b.a.id)) ?? best[0];
  };

  if (scene.visualHint) {
    const want = tokens(scene.visualHint);
    const c = variety(visuals.map((a) => ({ a, s: score(want, a) })).filter((x) => x.s > 0));
    if (c) return { visualAssetId: c.a.id, visualSource: "directive" };
  }
  const place = ctx.places.find((p) => scene.location && norm(p.name) === norm(scene.location));
  if (place && ok(place.visualAssetId)) return { visualAssetId: place.visualAssetId, visualSource: "memory" };

  const want = uniq([...tokens(scene.location), ...tokens(scene.title), ...scene.tags]);
  const c = want.length ? variety(visuals.map((a) => ({ a, s: score(want, a) })).filter((x) => x.s > 0)) : undefined;
  if (c) return { visualAssetId: c.a.id, visualSource: "library", ...(scene.location ? { rememberPlace: { placeName: scene.location, assetId: c.a.id } } : {}) };

  for (const id of scene.characterIds) {
    const ref = ctx.characters.find((ch) => ch.id === id)?.referenceAssetIds.find(ok);
    if (ref) return { visualAssetId: ref, visualSource: "character" };
  }
  return { visualSource: "card" };
}

/** Asigna visuales a todo el plan en orden y devuelve además qué lugares recordar. */
export function assignAll(scenes: Scene[], ctx: Omit<Parameters<typeof assignVisual>[1], "recent">) {
  const recent: string[] = []; const remember = new Map<string, string>();
  const out = scenes.map((s) => {
    if (s.locked && s.visualSource) { if (s.visualAssetId) recent.push(s.visualAssetId); return s; }
    const a = assignVisual(s, { ...ctx, recent });
    if (a.visualAssetId) recent.push(a.visualAssetId);
    if (a.rememberPlace) remember.set(a.rememberPlace.placeName, a.rememberPlace.assetId);
    return { ...s, visualAssetId: a.visualAssetId, visualSource: a.visualSource };
  });
  return { scenes: out, remember };
}
