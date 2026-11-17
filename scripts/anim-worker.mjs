/**
 * Trabajador de renderizado 2D (proceso hijo). Lee un trabajo JSON, dibuja cada fotograma con Skia usando el MISMO
 * código que el navegador (src/animation) y escribe RGBA crudo por stdout; el proceso padre lo canaliza a FFmpeg.
 * Corre fuera del proceso web: dibujar no bloquea la interfaz. Requiere Node >= 22.18 (ejecuta TypeScript sin compilar).
 * Uso: node --no-warnings scripts/anim-worker.mjs <trabajo.json>
 */
import fs from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createFrameCache, renderFrame } from "../src/animation/render.ts";

const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { stage, width: W, height: H, fps, frames, images = {} } = job;
const res = { images: {}, cache: process.env.KAP_ANIM_CACHE === "0" ? undefined : createFrameCache((w, h) => createCanvas(w, h)) };   // KAP_ANIM_CACHE=0 desactiva la caché de fotograma (modo antiguo)
for (const [id, p] of Object.entries(images)) { try { res.images[id] = await loadImage(p); } catch (e) { process.stderr.write(`no se pudo cargar la imagen ${id}: ${e.message}\n`); } }

const cv = createCanvas(W, H); const ctx = cv.getContext("2d");
// cv.data() devuelve memoria NUEVA en cada llamada (@napi-rs/canvas 1.x): no hace falta copiarla otra vez (8 MB por fotograma).
// Se comprueba al arrancar; si una versión futura reutiliza el buffer, se vuelve a copiar.
const independent = (() => { const t = createCanvas(2, 2), k = t.getContext("2d"); k.fillStyle = "#f00"; k.fillRect(0, 0, 2, 2); const a = t.data(); k.fillStyle = "#0f0"; k.fillRect(0, 0, 2, 2); t.data(); return a[0] === 255 && a[1] === 0; })();
process.stdout.on("error", () => process.exit(0)); // el padre cerró la tubería (cancelación): salir sin ruido
for (let i = 0; i < frames; i++) {
  renderFrame(ctx, stage, i / fps, res, W, H);
  const raw = cv.data();                              // RGBA crudo
  const buf = independent ? raw : Buffer.from(raw);
  if (!process.stdout.write(buf)) await new Promise((r) => process.stdout.once("drain", r));
}
if (process.env.KAP_ANIM_STATS_FILE && res.cache) fs.appendFileSync(process.env.KAP_ANIM_STATS_FILE, JSON.stringify({ frames, ...res.cache.stats }) + "\n");
process.stdout.end();
