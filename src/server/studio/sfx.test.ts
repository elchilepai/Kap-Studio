import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ffprobe } from "@/server/render/ffmpeg";
import { SOUND_VOLUME, synthSound } from "./sfx";
import type { SoundKind } from "@/animation/types";

const maxDb = (f: string) => Number(/max_volume: (-?[\d.]+) dB/.exec(spawnSync("ffmpeg", ["-v", "info", "-i", f, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr)?.[1] ?? NaN);
describe("sonido con función (síntesis local con FFmpeg)", () => {
  it("cada sonido se sintetiza (con la duración que le toca), no es silencio y se reutiliza de la caché", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kap-sfx-"));
    try {
      for (const [k, d] of [["door", undefined], ["bump", undefined], ["knock", undefined], ["ring", undefined], ["steps", 2], ["ambience", 3.2]] as [SoundKind, number | undefined][]) {
        const f = await synthSound(k, d, { cacheDir: dir }), p = await ffprobe(f); expect(p.hasAudio, k).toBe(true); expect(p.durationSec, k).toBeGreaterThan(0.4);
        expect(maxDb(f), `${k} no debe ser silencio`).toBeGreaterThan(k === "ambience" ? -50 : -30);
      }
      const a = await synthSound("steps", 2.1, { cacheDir: dir }), b = await synthSound("steps", 2.2, { cacheDir: dir }); expect(a).toBe(b);   // se redondea a 0,5 s: misma caché
      expect((await ffprobe(await synthSound("ambience", 4, { cacheDir: dir }))).durationSec).toBeGreaterThan(3.8);
      expect(SOUND_VOLUME("ambience")).toBeLessThan(SOUND_VOLUME("bump"));   // el ambiente nunca tapa un golpe
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }, 60_000);
});
