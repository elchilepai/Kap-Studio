import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSceneCues, timedLines } from "./subtitles";
import { actionSeconds, fitTimeline, sceneSeconds, sceneTimeline, timelineSeconds } from "./timeline";
import { parseScript } from "./script";
import { sceneAudio, espeakProvider } from "./voice";
import { irToScenes, parsedToIR } from "./interpreter";
import type { Scene } from "@/domain/types";

const SCRIPT = `# Salón
[mood: Noche, interior]
KAP: KAP: ¿Qué fue eso?
VACÍO: El hermano se acerca a la ventana y mira hacia el pasillo.
KAP: KAP cierra los ojos con fuerza y se queda inmóvil, mirando al suelo.
HERMANO DE KAP: No sé… ¿vamos a ver?
KAP: (Se levanta despacio y coge la mano de su hermano.)
KAP: ¡Espera!
Una puerta se cierra al otro lado del pasillo.`;
const CHARS = [{ id: "1", name: "KAP" }, { id: "2", name: "Hermano de KAP" }];
const lines = () => parseScript(SCRIPT, CHARS)[0].lines;

describe("separación narración / diálogo: lo que se lee y se oye es solo lo que se dice", () => {
  it("los subtítulos son SOLO frases habladas: ninguna acción, ninguna descripción, ningún «KAP: KAP:» ni «VACÍO:», ningún hablante que no sea personaje", () => {
    const cues = buildSceneCues(lines(), 20, { maxChars: 44 });
    expect(cues.map((c) => `${c.speaker}: ${c.text}`)).toEqual(["KAP: ¿Qué fue eso?", "Hermano de KAP: No sé… ¿vamos a ver?", "KAP: ¡Espera!"]);
    const all = cues.map((c) => c.text).join(" "); expect(all).not.toMatch(/KAP: KAP|VACÍO|\(|\)|se acerca|cierra los ojos|se levanta|puerta se cierra/i);
    for (const c of cues) expect(["KAP", "Hermano de KAP"]).toContain(c.speaker);
    for (const c of cues) expect(c.end).toBeLessThanOrEqual(20.001);
  });
  it("la narración sigue estando para el DIRECTOR (con tiempos) pero no como diálogo", () => {
    const tl = timedLines(lines(), 20, { maxChars: 44 }), actions = tl.filter((l) => l.kind === "action");
    expect(actions.map((a) => a.text)).toEqual(["El hermano se acerca a la ventana y mira hacia el pasillo.", "KAP cierra los ojos con fuerza y se queda inmóvil, mirando al suelo.", "Se levanta despacio y coge la mano de su hermano.", "Una puerta se cierra al otro lado del pasillo."]);
    expect(actions.every((a) => a.speaker === undefined)).toBe(true); expect(tl.filter((l) => l.kind === "dialogue")).toHaveLength(3);
    for (let i = 1; i < tl.length; i++) expect(tl[i].start).toBeGreaterThanOrEqual(tl[i - 1].start);   // en orden
  });
  it("las acciones ocupan tiempo (no se leen): una escena sin diálogo dura lo que piden sus acciones y no genera ningún subtítulo", () => {
    const silent = [{ text: "Se oye un portazo." }, { text: "KAP se queda quieto. Mira hacia la puerta. Su hermano aparece en el pasillo." }];
    expect(buildSceneCues(silent, 8, { maxChars: 44 })).toEqual([]); expect(sceneSeconds(silent)).toBeCloseTo(actionSeconds(silent[0].text) + actionSeconds(silent[1].text), 5);
    expect(actionSeconds(silent[1].text)).toBeGreaterThan(actionSeconds(silent[0].text));   // tres acciones piden más tiempo que una
    const ir = parsedToIR(parseScript("# Pasillo\nSe oye un portazo.\nKAP se queda quieto.", CHARS)); const sc = irToScenes(ir, CHARS.map((c) => ({ id: c.id, name: c.name })), () => "x")[0];
    expect(sc.durationSec).toBeGreaterThanOrEqual(3); expect(sc.dialogue).toBe("");
  });
  it("cada frase hablada cae en su hueco: tras una acción larga, el subtítulo empieza más tarde", () => {
    const withAction = [{ text: "KAP se levanta. Cruza la habitación. Abre la puerta despacio." }, { speaker: "KAP", text: "¿Hola?" }], onlyTalk = [{ speaker: "KAP", text: "¿Hola?" }];
    const a = buildSceneCues(withAction, 12, { maxChars: 44 })[0], b = buildSceneCues(onlyTalk, 12, { maxChars: 44 })[0];
    expect(a.start).toBeGreaterThan(b.start + 1);
    const items = sceneTimeline(withAction, [undefined, 1.0]); expect(items.map((i) => i.kind)).toEqual(["action", "dialogue"]); expect(items[1].start).toBeCloseTo(items[0].end, 5);
    expect(timelineSeconds(fitTimeline(items, 10))).toBeCloseTo(10, 5);
  });
});

describe("la voz solo pronuncia el diálogo", () => {
  it("se sintetizan SOLO las frases habladas, las acciones son silencio y la duración de la locución sale de ambas", async () => {
    const voice = espeakProvider(); if (!(await voice.available())) return;   // sin eSpeak no hay nada que comprobar
    const said: string[] = [], spy = { ...voice, synthesize: async (t: string, f: string, o: Parameters<typeof voice.synthesize>[2]) => { said.push(t); return voice.synthesize(t, f, o); } };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kap-narr-")); const L = lines();
    try {
      const scene = { id: "s", lines: L, narration: "", durationSec: 10 } as unknown as Scene;
      const a = await sceneAudio(scene, { assetPath: async () => undefined, voice: spy, cacheDir: path.join(dir, "cache"), tmpDir: path.join(dir, "tmp") });
      expect(said).toEqual(["¿Qué fue eso?", "No sé… ¿vamos a ver?", "¡Espera!"]);   // ninguna acción ni «VACÍO»
      expect(a!.items!.map((i) => i.kind)).toEqual(L.map((l) => (l.speaker ? "dialogue" : "action"))); expect(a!.durationSec).toBeGreaterThan(timelineSeconds(a!.items!) - 0.3);
      const again = await sceneAudio(scene, { assetPath: async () => undefined, voice: spy, cacheDir: path.join(dir, "cache"), tmpDir: path.join(dir, "tmp2") });   // caché: no vuelve a sintetizar
      expect(said).toHaveLength(3); expect(again!.items).toEqual(a!.items);
      expect(await sceneAudio({ ...scene, lines: [{ text: "Se oye un portazo." }] } as Scene, { assetPath: async () => undefined, voice: spy, cacheDir: path.join(dir, "cache"), tmpDir: path.join(dir, "tmp3") })).toBeUndefined();   // sin diálogo no hay voz
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }, 60_000);
});
