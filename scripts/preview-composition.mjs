/**
 * Hoja de contactos de la composición: escenas de 2, 3 y 4 personajes en vertical y horizontal, con la zona segura de
 * subtítulos marcada (rojo translúcido). Sirve para revisar a ojo que nadie queda cortado ni los pies bajo el texto.
 *   node --no-warnings scripts/preview-composition.mjs <salida.png> [v|h] [n personajes ...]
 */
import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { direct } from "../src/animation/director.ts";
import { renderFrame } from "../src/animation/render.ts";
import { subtitleMetrics } from "../src/animation/framing.ts";
import { KAP_LOOK, MIRA_LOOK } from "../src/animation/demo.ts";

const [out, mode = "v", ...ns] = process.argv.slice(2); const counts = ns.length ? ns.map(Number) : [2, 3, 4];
const vertical = mode === "v", W = vertical ? 270 : 480, H = vertical ? 480 : 270, FULL = vertical ? [1080, 1920] : [1920, 1080];
const people = [["kap", "KAP", KAP_LOOK], ["mira", "Mira", MIRA_LOOK], ["vega", "Vega", { ...KAP_LOOK, top: "#3b7a6f", hairStyle: "curly", skin: "#8a5a3c" }], ["nico", "Nico", { ...MIRA_LOOK, top: "#b5543c", hairStyle: "ponytail", hairColor: "#a0382b" }]];
const safe = subtitleMetrics(...FULL); const rows = [];
for (const n of counts) {
  const ch = people.slice(0, n).map(([id, name, appearance]) => ({ id, name, appearance }));
  const lines = ch.map((c, i) => ({ speaker: c.name.toUpperCase(), text: i % 2 ? "¿Seguimos adelante?" : "Sí, vamos.", start: 0.5 + i * 2.5, end: 2.3 + i * 2.5 }));
  const stage = direct({ duration: 3 + n * 2.5, aspect: W / H, index: 0, fps: 30, width: W, height: H, location: "Calle vacía", mood: "", tags: [], narration: "", style: { ink: "#0d0f14", line: 0.04, grade: "none", vignette: 0.25, shadow: true }, characters: ch, directions: [], lines, safe });
  stage.set.preset = "street"; stage.set.timeOfDay = "dusk";
  const times = [0.1, ...lines.map((l) => l.start + 1.2)]; rows.push({ n, stage, times, lines });
}
const cols = Math.max(...rows.map((r) => r.times.length)), sheet = createCanvas(cols * (W + 6) + 6, rows.length * (H + 6) + 6), s = sheet.getContext("2d");
s.fillStyle = "#222"; s.fillRect(0, 0, sheet.width, sheet.height);
rows.forEach((r, ri) => r.times.forEach((t, ci) => {
  const cv = createCanvas(W, H), c = cv.getContext("2d"); renderFrame(c, r.stage, t, { images: {} }, W, H);
  c.fillStyle = "rgba(255,40,40,0.28)"; c.fillRect(0, safe.top * H, W, (safe.bottom - safe.top) * H);   // zona de subtítulos
  c.fillStyle = "#fff"; c.font = "11px sans-serif"; c.fillText(`${r.n} pers · t=${t.toFixed(1)}`, 4, 12);
  s.drawImage(cv, 6 + ci * (W + 6), 6 + ri * (H + 6));
}));
fs.writeFileSync(out, sheet.toBuffer("image/png")); console.log("ok", out);
