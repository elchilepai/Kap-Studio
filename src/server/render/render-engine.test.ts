import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CanceledError, RenderError, ffprobe, getCapabilities, isDeterministicFailure, parseProgressLine, runFfmpeg, runningFfmpegProcesses } from "./ffmpeg";
import { dimensions, encodeArgs } from "./presets";
import { escFilter, renderSlate, wrapText } from "./slate";

const dirs: string[] = [];
const tmp = async () => { const d = await fs.mkdtemp(path.join(os.tmpdir(), "kap-r-")); dirs.push(d); return d; };
afterAll(async () => { for (const d of dirs) await fs.rm(d, { recursive: true, force: true }); });

describe("presets", () => {
  it("dimensiones pares y proporción correcta", () => {
    expect(dimensions("16:9", "1080p")).toEqual({ width: 1920, height: 1080 });
    expect(dimensions("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(dimensions("16:9", "480p")).toEqual({ width: 854, height: 480 });
    expect(dimensions("9:16", "720p")).toEqual({ width: 720, height: 1280 });
    for (const f of ["16:9", "9:16"] as const) for (const q of ["480p", "720p", "1080p"] as const) {
      const d = dimensions(f, q); expect(d.width % 2).toBe(0); expect(d.height % 2).toBe(0);
    }
  });
  it("codificación H.264 + AAC + faststart", () => {
    const a = encodeArgs().join(" ");
    expect(a).toContain("libx264"); expect(a).toContain("-c:a aac"); expect(a).toContain("+faststart"); expect(a).toContain("yuv420p");
  });
});

describe("utilidades", () => {
  it("parseProgressLine", () => {
    const s: { outSec?: number; speed?: number; ended?: boolean } = {};
    parseProgressLine("out_time_us=2500000", s); parseProgressLine("speed=3.5x", s); parseProgressLine("progress=end", s);
    expect(s).toEqual({ outSec: 2.5, speed: 3.5, ended: true });
    parseProgressLine("out_time_us=N/A", s); expect(s.outSec).toBe(2.5);
  });
  it("clasifica errores deterministas vs transitorios", () => {
    expect(isDeterministicFailure("x.mp4: No such file or directory")).toBe(true);
    expect(isDeterministicFailure("Invalid data found when processing input")).toBe(true);
    expect(isDeterministicFailure("Cannot allocate memory")).toBe(false);
  });
  it("escFilter y wrapText", () => {
    expect(escFilter("a:b'c%d")).toBe("'a\\:b\\'c\\%d'");
    expect(wrapText("uno dos tres cuatro", 8)).toBe("uno dos\ntres\ncuatro");
    expect(wrapText("a ".repeat(50), 4, 2).split("\n").length).toBe(2);
  });
});

describe("FFmpeg real", () => {
  it("capacidades del entorno", async () => {
    const c = await getCapabilities(true);
    expect(c.problems).toEqual([]); expect(c.ok).toBe(true); expect(c.h264 && c.aac && c.filters.subtitles).toBe(true);
  });

  it.each([["16:9", "480p", 854, 480], ["9:16", "480p", 480, 854], ["16:9", "720p", 1280, 720]] as const)(
    "renderiza tarjeta %s %s: H.264+AAC, dimensiones, duración y progreso reales", async (format, quality, w, h) => {
      const d = await tmp(); const progress: number[] = [];
      const r = await renderSlate({ title: "El despertar de KAP: título largo con acentos áéíóú ñ y % : ' símbolos", durationSec: 3, format, quality, tmpDir: d, onProgress: (f) => progress.push(f) });
      const p = await ffprobe(r.file);
      expect(p.videoCodec).toBe("h264"); expect(p.audioCodec).toBe("aac"); expect(p.pixFmt).toBe("yuv420p");
      expect([p.width, p.height]).toEqual([w, h]);
      expect(p.durationSec).toBeGreaterThan(2.9); expect(p.durationSec).toBeLessThan(3.4);
      expect(progress.length).toBeGreaterThan(0); expect(progress.every((x) => x >= 0 && x < 1)).toBe(true);
      expect(Math.max(...progress)).toBeGreaterThan(0.5);
      // moov al principio (faststart): los primeros 64 KB deben contener el átomo 'moov'
      const head = (await fs.readFile(r.file)).subarray(0, 65536).toString("latin1"); expect(head).toContain("moov");
    }, 60_000);

  it("cancelación real: mata el proceso, no deja procesos huérfanos", async () => {
    const d = await tmp(); const ac = new AbortController(); let first = 0;
    const before = runningFfmpegProcesses();
    const p = renderSlate({ title: "Largo", durationSec: 600, format: "16:9", quality: "1080p", tmpDir: d, signal: ac.signal, onProgress: (f) => { if (!first) { first = f; setTimeout(() => ac.abort(), 100); } } });
    await expect(p).rejects.toBeInstanceOf(CanceledError);
    expect(runningFfmpegProcesses()).toBe(before);
  }, 60_000);

  it("cancelar antes de empezar no lanza ningún proceso", async () => {
    const ac = new AbortController(); ac.abort();
    await expect(runFfmpeg(["-version"], { signal: ac.signal })).rejects.toBeInstanceOf(CanceledError);
  });

  it("entrada inexistente → RenderError NO reintentable con detalle de FFmpeg", async () => {
    const e = await runFfmpeg(["-i", "/no/existe.mp4", "-f", "null", "-"]).catch((x) => x);
    expect(e).toBeInstanceOf(RenderError); expect(e.retryable).toBe(false); expect(e.message).toMatch(/No such file/i);
  });

  it("ffprobe rechaza archivos corruptos y de texto", async () => {
    const d = await tmp(); const f = path.join(d, "x.mp4"); await fs.writeFile(f, Buffer.alloc(2000, 7));
    await expect(ffprobe(f)).rejects.toBeInstanceOf(RenderError);
  });

  it("ffprobe no sigue referencias a archivos/URLs (protocol_whitelist=file)", async () => {
    const d = await tmp(); const f = path.join(d, "evil.m3u8");
    await fs.writeFile(f, "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:9/x.ts\n#EXT-X-ENDLIST\n");
    await expect(ffprobe(f, 8000)).rejects.toBeInstanceOf(RenderError);
  });
});
