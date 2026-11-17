/** Perfil por fotograma del motor 2D: reparto del tiempo entre escenario, personajes, primer plano, efectos y copia RGBA.
 *  node --no-warnings scripts/prof-frame.mjs [h|v] [city|street|forest|rooftop|room] [day|dusk|night] */
import { createCanvas } from "@napi-rs/canvas";
import { direct } from "../src/animation/director.ts";
import { renderFrame } from "../src/animation/render.ts";
import { drawSet, drawForeground } from "../src/animation/sets.ts";
import { drawCharacter, poseFor } from "../src/animation/character.ts";
import { evaluate } from "../src/animation/timeline.ts";
import { KAP_LOOK, MIRA_LOOK } from "../src/animation/demo.ts";
const [W, H] = process.argv[2] === "v" ? [1080, 1920] : [1920, 1080];
const preset = process.argv[3] ?? "city", tod = process.argv[4] ?? "night";
const inp = { duration: 8, aspect: W / H, index: 1, fps: 30, width: W, height: H, location: preset === "forest" ? "Bosque" : preset === "street" ? "Calle" : preset === "rooftop" ? "Azotea" : "Ciudad", mood: "", tags: [], narration: "El viento cruza", style: { ink: "#0d0f14", line: 0.04, grade: "none", vignette: 0.25, shadow: true },
  characters: [{ id: "kap", name: "KAP", appearance: KAP_LOOK }, { id: "mira", name: "Mira", appearance: MIRA_LOOK }], directions: [],
  lines: [{ speaker: "KAP", text: "No recuerdo cómo llegué.", start: 0.3, end: 2.5 }, { speaker: "MIRA", text: "Entonces lo averiguamos.", start: 3, end: 5.2 }] };
const stage = direct(inp); stage.set.preset = preset; stage.set.timeOfDay = tod;
const cv = createCanvas(W, H), ctx = cv.getContext("2d"); const res = { images: {} };
const N = 150; const T = (f) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) { f(i); cv.data(); }   // Skia es diferido: hay que leer los píxeles para que se rasterice de verdad
   return Number(process.hrtime.bigint() - t0) / 1e6 / N; };
renderFrame(ctx, stage, 0, res, W, H);
const full = T((i) => renderFrame(ctx, stage, i / 30 * 1.5, res, W, H));
const copy = (() => { const t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) Buffer.from(cv.data()); return Number(process.hrtime.bigint() - t0) / 1e6 / N; })();
// partes
import { viewFor } from "../src/animation/render.ts";
import { GROUND_Y } from "../src/animation/types.ts";
const part = (what) => T((i) => { const t = i / 30 * 1.5; const st = evaluate(stage, t); const v = viewFor(stage, W / H, st); const s = H / v.visH;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#111318"; ctx.fillRect(0, 0, W, H); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-v.cx, -v.cy);
  const view = { l: v.cx - v.visW / 2 - 1, r: v.cx + v.visW / 2 + 1, t: v.cy - v.visH / 2 - 1, b: v.cy + v.visH / 2 + 1, cx: v.cx };
  if (what === "set") drawSet(ctx, stage.set, view, t, res.images, "#0d0f14");
  if (what === "chars") for (const a of stage.actors.map((a, k) => ({ a, s: st.actors[k] }))) { ctx.save(); ctx.translate(a.s.x, GROUND_Y + 0.55); drawCharacter(ctx, a.a.appearance, poseFor(a.s, t, 1), { ink: "#0d0f14", line: 0.04, facing: a.s.facing, shadow: true, alpha: 1 }, res.images); ctx.restore(); }
  if (what === "fg") drawForeground(ctx, stage.set, view, res.images, "#0d0f14"); });
const base = part("none"), set = part("set") - base, chars = part("chars") - base, fg = part("fg") - base;
console.log(JSON.stringify({ res: `${W}x${H}`, preset, tod, full_ms: +full.toFixed(1), copyRGBA_ms: +copy.toFixed(1), set_ms: +set.toFixed(1), chars_ms: +chars.toFixed(1), foreground_ms: +fg.toFixed(1), overlays_ms: +(full - set - chars - fg - base).toFixed(1) }));
