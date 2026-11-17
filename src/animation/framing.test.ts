import { describe, expect, it } from "vitest";
import { ACTOR_HALF_W, clampCx, feetDrop, frameShot, layoutSlots, subtitleMetrics, visibility, visibleSize, wideZoom } from "./framing.ts";
import { direct, type DirectorInput } from "./director.ts";
import { evaluate } from "./timeline.ts";
import { viewFor } from "./render.ts";
import { KAP_LOOK, MIRA_LOOK } from "./demo.ts";
import { GROUND_Y } from "./types.ts";

const V = 9 / 16, H = 16 / 9;
const minGap = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return Math.min(...s.slice(1).map((x, i) => x - s[i])); };

describe("zonas seguras de subtítulos", () => {
  it("las métricas coinciden con el ASS (misma fuente) y dejan la franja inferior libre en vertical", () => {
    const v = subtitleMetrics(1080, 1920), h = subtitleMetrics(1920, 1080);
    expect(v.fontSize).toBe(63); expect(v.marginV).toBe(Math.round(1920 * 0.17)); expect(h.fontSize).toBe(51); expect(h.marginV).toBe(Math.round(1080 * 0.07));
    expect(v.bottom).toBeCloseTo(0.83, 2); expect(v.top).toBeLessThan(v.bottom); expect(h.bottom).toBeCloseTo(0.93, 2); expect(h.top).toBeGreaterThan(0.75);
    expect(subtitleMetrics(1080, 1920, { position: "top" }).top).toBeLessThan(0.1);
    expect(subtitleMetrics(1080, 1920, { scale: 1.5 }).top).toBeLessThan(v.top);          // subtítulo más grande → zona más alta
  });
  it("feetDrop: baja la escena lo justo, nada si no hay problema, y nada en planos cerrados o con subtítulos arriba", () => {
    const safe = subtitleMetrics(1920, 1080); const { visH } = visibleSize(1, H);
    const d = feetDrop(4.5, visH, safe); expect(d).toBeGreaterThan(0.3); expect(d).toBeLessThan(1.2);
    const feet = 0.5 + (GROUND_Y + 0.55 - (4.5 + d)) / visH; expect(feet).toBeLessThanOrEqual(safe.top - 0.03 + 1e-9);
    expect(feetDrop(4.5, visH, { top: 1, bottom: 1 })).toBe(0);                            // sin subtítulos
    expect(feetDrop(4.5, visH, subtitleMetrics(1920, 1080, { position: "top" }))).toBe(0);
    const close = visibleSize(2.2, H); expect(feetDrop(3, close.visH, safe)).toBe(0);      // primer plano muy cerrado (la cara llena la pantalla): no se baja
    const med = visibleSize(1.55, H); expect(feetDrop(4.5, med.visH, safe)).toBeGreaterThan(0.3);   // plano medio: el cuerpo entero cabe → se baja para que las piernas no pisen el texto
  });
});

describe("reparto de personajes sin solapamientos", () => {
  it("horizontal: igual que siempre", () => {
    expect(layoutSlots(2, H).map((s) => s.x)).toEqual([5.8, 10.2]); expect(layoutSlots(3, H).map((s) => s.x)).toEqual([4.4, 8, 11.6]); expect(layoutSlots(4, H).every((s) => s.row === 0)).toBe(true);
  });
  it.each([1, 2, 3, 4])("vertical, %i personaje(s): caben en el plano general y los de la misma fila no se solapan", (n) => {
    const l = layoutSlots(n, V), z = wideZoom(l.map((s) => s.x), V, 0.8, 1), { visW } = visibleSize(z, V);
    for (const s of l) { expect(s.x - ACTOR_HALF_W).toBeGreaterThan(8 - visW / 2); expect(s.x + ACTOR_HALF_W).toBeLessThan(8 + visW / 2); }
    for (const row of [0, 1] as const) { const xs = l.filter((s) => s.row === row).map((s) => s.x); if (xs.length > 1) expect(minGap(xs)).toBeGreaterThanOrEqual(2 * ACTOR_HALF_W); }
    if (n >= 3) expect(l.some((s) => s.row === 1)).toBe(true);                             // con 3-4 se escalona en profundidad
    expect(z).toBeGreaterThanOrEqual(0.8);                                                 // sin encoger más de un 20 % ni siquiera el plano general
  });
  it("con 4 personajes en vertical el plano de grupo abre solo ≈ 5 % (no se encoge a todos) y no corta a nadie", () => {
    const xs = layoutSlots(4, V).map((s) => s.x); expect(wideZoom(xs, V, 0.8, 1)).toBeGreaterThanOrEqual(0.92);
    const a = xs.map((x, i) => ({ id: "p" + i, x })); const r = frameShot({ actors: a, focus: "p1", aspect: V, zoom: 1.3, minZoom: 0.8, look: 1, leadFrac: 0.1 });
    expect(r.cut).toEqual([]); expect(r.zoom).toBeGreaterThanOrEqual(0.9);                 // ningún primer plano aísla a uno sin cortar a un vecino → plano de grupo
    // con 2 personajes sí se cierra: plano de dos o primer plano
    const r2 = frameShot({ actors: [{ id: "a", x: 6.7 }, { id: "b", x: 9.3 }], focus: "a", aspect: V, zoom: 1.3, minZoom: 0.8, look: 1, leadFrac: 0.1 }); expect(r2.zoom).toBeGreaterThan(1.05);
  });
});

describe("solucionador de planos: nadie cortado por el borde", () => {
  const set = (xs: number[]) => xs.map((x, i) => ({ id: "p" + i, x }));
  const check = (r: ReturnType<typeof frameShot>, xs: number[], aspect: number) => { const { visW } = visibleSize(r.zoom, aspect); return xs.map((x) => visibility(x, r.cx, visW)); };
  it("el caso detectado: contraplano en vertical con dos personajes pegados → se abre a un plano de dos o se aparta al otro del todo", () => {
    const xs = [6.7, 9.3], r = frameShot({ actors: set(xs), focus: "p0", aspect: V, zoom: 1.3, look: 1, leadFrac: 0.1 });
    expect(r.cut).toEqual([]); expect(check(r, xs, V)).not.toContain("cut"); expect(check(r, xs, V)[0]).toBe("in");
  });
  it("barrido: ninguna combinación de posiciones y plano deja a alguien cortado cuando hay solución", () => {
    let bad = 0, n = 0;
    for (const aspect of [V, H]) for (const d of [1.5, 2.2, 2.6, 3.4, 4.4, 6, 8]) for (const z of [1.18, 1.3, 1.55]) for (const look of [-1, 1] as const) {
      const xs = [8 - d / 2, 8 + d / 2]; const r = frameShot({ actors: set(xs), focus: "p0", aspect, zoom: z, minZoom: aspect < 1 ? 0.8 : 1, look, leadFrac: aspect < 1 ? 0.1 : 0.17 }); n++;
      if (r.cut.length) bad++;
      expect(check(r, xs, aspect)[0]).toBe("in");                                         // quien habla, siempre entero
    }
    expect(bad).toBe(0); expect(n).toBeGreaterThan(50);
  });
  it("cercano al ideal: si todo cabe, respeta el zoom pedido y la regla de tercios", () => {
    const r = frameShot({ actors: set([6, 10]), focus: "p0", aspect: H, zoom: 1.25, look: 1, leadFrac: 0.17 });
    expect(r.zoom).toBeCloseTo(1.25, 1); expect(r.lead).toBeCloseTo(0.17, 1); expect(r.cut).toEqual([]);
  });
  it("clampCx es la misma restricción que usa el renderizador", () => {
    const { visW } = visibleSize(1.3, V); expect(clampCx(-5, visW)).toBeCloseTo(visW / 2 - 1.2); expect(clampCx(99, visW)).toBeCloseTo(16 - visW / 2 + 1.2); expect(clampCx(8, visW)).toBe(8);
  });
});

describe("director: composición de extremo a extremo (sin personajes cortados accidentalmente)", () => {
  const people = [["kap", "KAP"], ["mira", "Mira"], ["vega", "Vega"], ["nico", "Nico"]].map(([id, name], i) => ({ id, name, appearance: i % 2 ? MIRA_LOOK : KAP_LOOK }));
  const mk = (n: number, portrait: boolean, o: Partial<DirectorInput> = {}) => direct({
    duration: 12, aspect: portrait ? V : H, index: 0, fps: 30, width: portrait ? 720 : 1280, height: portrait ? 1280 : 720, location: "Calle", mood: "", tags: [], narration: "", style: { ink: "#000", line: 0.04, grade: "none", vignette: 0, shadow: true },
    characters: people.slice(0, n), directions: [], safe: subtitleMetrics(portrait ? 720 : 1280, portrait ? 1280 : 720),
    lines: people.slice(0, n).flatMap((p, i) => [{ speaker: p.name.toUpperCase(), text: i % 2 ? "¿Seguimos adelante?" : "Sí, vamos.", start: 0.5 + i * 2.5, end: 2.4 + i * 2.5 }]), ...o,
  });
  it.each([[2, true], [3, true], [4, true], [2, false], [3, false], [4, false]])("%i personajes, vertical=%s: en cada plano nadie queda cortado", (n, portrait) => {
    const s = mk(n, portrait); expect(s.warnings.filter((w) => /cortados/.test(w))).toEqual([]);
    for (let t = 0.2; t < 12; t += 0.25) {
      const f = evaluate(s, t), vw = (9 / f.camera.zoom) * (portrait ? V : H), p = evaluate(s, t - 0.12);
      if (Math.abs(p.camera.x - f.camera.x) + Math.abs(p.camera.zoom - f.camera.zoom) > 1e-6) continue;   // en mitad de un movimiento de cámara es normal que algo cruce el borde: se exige con el plano asentado
      for (const a of f.actors) { const row = s.actors.find((x) => x.id === a.id)!; if (!a.visible) continue; expect(visibility(a.x, clampCx(f.camera.x, vw), vw), `t=${t.toFixed(2)} ${row.name}`).not.toBe("cut"); }
    }
  });
  it("las dos filas traseras/delanteras llevan su fila y los pies no pisan los subtítulos en ningún plano con los pies visibles", () => {
    const s = mk(4, true); expect(s.actors.filter((a) => a.row === 1)).toHaveLength(2);
    for (let t = 0.2; t < 12; t += 0.5) { const f = evaluate(s, t), v = viewFor(s, V, f), feet = 0.5 + (GROUND_Y + 0.55 - v.cy) / v.visH; if (feet < 1) expect(feet).toBeLessThanOrEqual(s.safe!.top - 0.02); }
  });
  it.each([[2, true], [3, true], [2, false], [3, false]])("con alguien caminando durante el diálogo (%i personajes, vertical=%s) cada plano, al llegar la cámara, no corta a nadie", (n, portrait) => {
    const s = mk(n, portrait, { directions: ["camina: KAP a derecha", "entra: Mira izquierda"] }); let checked = 0;
    for (const c of s.cues) {
      if (c.type !== "camera") continue; const f = evaluate(s, c.t + Math.max(0.05, c.dur) + 0.02), vw = (9 / f.camera.zoom) * (portrait ? V : H);
      for (const a of f.actors) { if (!a.visible || a.alpha < 0.5) continue; checked++; expect(visibility(a.x, clampCx(f.camera.x, vw), vw), `cámara t=${c.t.toFixed(2)} actor ${a.id}`).not.toBe("cut"); }
    }
    expect(checked).toBeGreaterThan(4);
  });
});
