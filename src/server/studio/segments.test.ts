import { describe, expect, it } from "vitest";
import { buildSegmentGraph, joinFrame, overlapBetween, planSegments, sceneStarts, type ComposeClip } from "./compose";
import { mapLimit } from "./pool";

const FPS = 30;
const mk = (durs: number[], tr: ComposeClip["transition"][] = []): ComposeClip[] => durs.map((d, i) => ({ file: `/c/${i}.mp4`, dur: d, transition: tr[i] ?? (i % 3 === 0 ? "cut" : "fade") }));

describe("planSegments (puro)", () => {
  const clips = mk([13.28, 9.5, 14.1, 12.07, 11, 15.3, 10.42, 8.9, 13.33, 12]);
  it.each([1, 2, 3, 4, 7, 10, 50])("los tramos son contiguos y cubren todo el vídeo (%i escenas por tramo)", (per) => {
    const { segments, totalFrames, total } = planSegments(clips, per);
    expect(segments[0].startFrame).toBe(0);
    expect(segments.at(-1)!.endFrame).toBe(totalFrames);
    expect(totalFrames).toBe(Math.ceil(total * FPS - 1e-6));
    segments.forEach((s, i) => { expect(s.endFrame).toBeGreaterThan(s.startFrame); if (i) expect(s.startFrame).toBe(segments[i - 1].endFrame); });
    expect(segments.flatMap((s) => Array.from({ length: s.b - s.a }, (_, k) => s.a + k))).toEqual(clips.map((_, i) => i));   // cada escena en un solo tramo
  });
  it("el recorte del primer clip cubre la transición de entrada y las uniones caen dentro del tramo", () => {
    const S = sceneStarts(clips.map((c) => c.dur));
    for (const s of planSegments(clips, 3).segments.slice(1)) {
      expect(s.trim).toBeGreaterThanOrEqual(overlapBetween(clips[s.a - 1], clips[s.a]) - 1e-9);   // lo anterior ya mostró la mezcla
      expect(s.trim).toBeLessThan(clips[s.a].dur);
      expect(s.startFrame / FPS).toBeCloseTo(joinFrame(S[s.a]) / FPS + s.trim, 6);   // el clip se lee fotograma a fotograma desde el de su unión
      s.offsets.forEach((o, k) => { expect(o).toBeGreaterThan(0); if (k) expect(o).toBeGreaterThan(s.offsets[k - 1]); });
    }
  });
  it("con tramo ≥ nº de escenas es un único tramo sin recorte", () => {
    const { segments } = planSegments(clips, 99); expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ a: 0, b: 10, last: 9, trim: 0 });
  });
  it("una escena y escenas sueltas no fallan", () => {
    expect(planSegments(mk([5]), 4).segments).toHaveLength(1);
    expect(planSegments(mk([5, 6]), 1).segments.map((s) => [s.a, s.b, s.last])).toEqual([[0, 1, 1], [1, 2, 1]]);
  });
});

describe("buildSegmentGraph (puro)", () => {
  const clips = mk([10, 10, 10, 10, 10, 10]);
  const { segments, total } = planSegments(clips, 2);
  it("el primer tramo lleva fundido de entrada; el último, el de salida en tiempo local; los intermedios, ninguno", () => {
    const g = segments.map((s) => buildSegmentGraph(clips, s, total));
    expect(g[0]).toContain("fade=t=in"); expect(g[0]).not.toContain("fade=t=out"); expect(g[0]).not.toContain("trim=");
    expect(g[1]).not.toMatch(/fade=t=(in|out)/); expect(g[1]).toContain("trim=start=");
    expect(g[2]).toContain("fade=t=out"); expect(g[2]).not.toContain("fade=t=in");
    const T0 = segments[2].startFrame / FPS; expect(g[2]).toContain(`st=${(total - 0.8 - T0).toFixed(3)}`);
  });
  it("cada tramo termina en [v] y lee solo sus clips (+ el siguiente para la transición)", () => {
    for (const s of segments) { const g = buildSegmentGraph(clips, s, total); expect(g).toMatch(/\[v\]$/); expect((g.match(/xfade/g) ?? []).length).toBe(s.last - s.a); }
  });
});

describe("mapLimit", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  it("conserva el orden y nunca supera el límite", async () => {
    for (const limit of [1, 2, 3]) {
      let cur = 0, max = 0;
      const r = await mapLimit([5, 1, 4, 2, 3, 0], limit, async (x, i) => { cur++; max = Math.max(max, cur); await sleep(x * 3); cur--; return i * 10; });
      expect(r).toEqual([0, 10, 20, 30, 40, 50]); expect(max).toBeLessThanOrEqual(limit); if (limit === 1) expect(max).toBe(1);
    }
  });
  it("tras un fallo no lanza más tareas y espera a las que están en marcha", async () => {
    const started: number[] = []; let finished = 0;
    await expect(mapLimit([0, 1, 2, 3, 4, 5], 2, async (x) => { started.push(x); await sleep(10); if (x === 1) throw new Error("boom"); finished++; })).rejects.toThrow("boom");
    expect(started.length).toBeLessThan(6); expect(finished).toBe(started.length - 1);
  });
});
