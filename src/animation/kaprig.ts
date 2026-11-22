import fs from "node:fs";
import path from "node:path";
import type { LayeredRig } from "./types.ts";

/**
 * KAP DE REFERENCIA (ilustración): el rig por capas de KAP sale de la imagen de referencia (assets/kap, preparado con scripts/prepare-kap-sprite.py):
 * torso (sin cabeza), cabeza (sin ojos ni cejas), ojos y cejas por expresión y bocas por visema. Es EL MISMO personaje en todos los planos del Short
 * (no se regenera): el movimiento es limitado e intencionado (respiración, parpadeo, mirada, cabeza, inclinación, desplazamiento).
 */
export const KAP_DIR = path.join(process.cwd(), "assets", "kap");
type KapMeta = { size: [number, number]; head: { box: number[]; pivot: [number, number] }; face: { center: [number, number]; size: [number, number] }; eyes: string[]; mouths: string[]; restMouths: string[] };
let meta: KapMeta | undefined;
const load = (): KapMeta | undefined => { try { return (meta ??= JSON.parse(fs.readFileSync(path.join(KAP_DIR, "rig.json"), "utf8")) as KapMeta); } catch { return undefined; } };
export const kapAvailable = () => !!load();
/** id de recurso («kap/…») → fichero PNG del repositorio. */
export const kapAssetPath = (id: string) => (id.startsWith("kap/") ? path.join(KAP_DIR, `${id.slice(4)}.png`) : undefined);

export function kapRig(): LayeredRig | undefined {
  const m = load(); if (!m) return undefined; const [W, H] = m.size, hb = m.head.box, pv = m.head.pivot, fc = m.face.center;
  return { kind: "layered", pxPerUnit: H / 3.0,   // KAP mide 3 unidades de mundo (como el resto de personajes)
    parts: [{ id: "torso", role: "torso", image: "kap/torso", anchor: [W / 2, H], at: [0, 0], z: 0 }, { id: "head", role: "head", image: "kap/head", anchor: [pv[0] - hb[0], pv[1] - hb[1]], parent: "torso", at: [pv[0], pv[1]], z: 1 }],
    face: { parent: "head", at: [fc[0] - hb[0], fc[1] - hb[1]], eyes: Object.fromEntries(m.eyes.map((k) => [k, `kap/eyes-${k}`])), mouths: Object.fromEntries(m.mouths.map((k) => [k, `kap/mouth-${k}`])), restMouths: Object.fromEntries(m.restMouths.map((k) => [k, `kap/mouth-rest-${k}`])) },
    animations: ["idle", "talk", "listen", "settle", "recoil", "shrink", "droop", "tense"] };
}
