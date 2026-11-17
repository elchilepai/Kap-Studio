/**
 * Trabajador de renderizado 2D (proceso hijo). Lee un trabajo JSON, dibuja cada fotograma con Skia usando el MISMO
 * código que el navegador (src/animation) y escribe RGBA crudo por stdout; el proceso padre lo canaliza a FFmpeg.
 * Corre fuera del proceso web: dibujar no bloquea la interfaz. Requiere Node >= 22.18 (ejecuta TypeScript sin compilar).
 * Uso: node --no-warnings scripts/anim-worker.mjs <trabajo.json>
 */
import fs from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderFrame } from "../src/animation/render.ts";

const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { stage, width: W, height: H, fps, frames, images = {} } = job;
const res = { images: {} };
for (const [id, p] of Object.entries(images)) { try { res.images[id] = await loadImage(p); } catch (e) { process.stderr.write(`no se pudo cargar la imagen ${id}: ${e.message}\n`); } }

const cv = createCanvas(W, H); const ctx = cv.getContext("2d");
process.stdout.on("error", () => process.exit(0)); // el padre cerró la tubería (cancelación): salir sin ruido
for (let i = 0; i < frames; i++) {
  renderFrame(ctx, stage, i / fps, res, W, H);
  const buf = Buffer.from(cv.data());                 // RGBA crudo (copia: el buffer de Skia se reutiliza)
  if (!process.stdout.write(buf)) await new Promise((r) => process.stdout.once("drain", r));
}
process.stdout.end();
