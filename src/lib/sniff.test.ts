import { describe, expect, it } from "vitest";
import { sniff } from "./sniff";

const b = (...x: (number | string)[]) => new Uint8Array(x.flatMap((v) => typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v]));

describe("sniff", () => {
  it("detecta formatos reales", () => {
    expect(sniff(b(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0))?.mime).toBe("image/png");
    expect(sniff(b(0, 0, 0, 0x20, "ftypisom", 0, 0))?.mime).toBe("video/mp4");
    expect(sniff(b(0, 0, 0, 0x20, "ftypM4A ", 0, 0))?.kind).toBe("audio");
    expect(sniff(b("RIFF", 0, 0, 0, 0, "WAVE"))?.mime).toBe("audio/wav");
    expect(sniff(b("WEBVTT\n\n"))?.kind).toBe("subtitle");
    expect(sniff(b("1\n00:00:01,000 --> 00:00:02,000\nHola"))?.ext).toBe(".srt");
  });
  it("rechaza SVG, HTML y desconocidos aunque el cliente los declare como imagen", () => {
    expect(sniff(b('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
    expect(sniff(b("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(sniff(b("MZ\x90\x00\x03\x00\x00\x00"))).toBeNull();
    expect(sniff(b(1, 2))).toBeNull();
  });
});
