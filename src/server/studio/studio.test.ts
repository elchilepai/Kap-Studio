import { describe, expect, it } from "vitest";
import type { Asset, Character, Place, Scene } from "@/domain/types";
import { parseScript, splitLong, textToLines, toScenes } from "./script";
import { parseBrief } from "./brief";
import { assignAll, assignVisual } from "./visuals";
import { DEFAULT_SUB_STYLE, buildSceneCues, toASS, toSRT, toVTT, wrap2 } from "./subtitles";
import { planShorts } from "./shorts";
import { estimateSeconds, norm } from "./text";

const chars = [{ id: "c1", name: "KAP" }, { id: "c2", name: "Mira" }];
let n = 0; const id = () => `s${++n}`;

describe("analizador de guion (reglas)", () => {
  const script = `# Refugio
[imagen: ciudad vacía de noche]
[música: tenso]
[transición: fadeblack]
El viento golpea las ventanas del refugio. KAP despierta sin recordar nada.
MIRA: ¿Lo oyes? Algo se acerca.
KAP: Sí. Debemos irnos ya.

ESCENA 2: Azotea
[duración: 12]
Amanece sobre la ciudad. Mira señala el horizonte.`;
  it("detecta escenas, directivas, diálogo y personajes", () => {
    const sc = toScenes(parseScript(script, chars), chars, id);
    expect(sc).toHaveLength(2);
    expect(sc[0]).toMatchObject({ title: "Refugio", location: "Refugio", visualHint: "ciudad vacía de noche", transition: "fadeblack", mood: "" });
    expect(sc[0].lines.map((l) => l.speaker)).toEqual([undefined, "Mira", "KAP"]);
    expect(sc[0].characterIds.sort()).toEqual(["c1", "c2"]);
    expect(sc[0].dialogue).toContain("Mira: ¿Lo oyes?");
    expect(sc[1]).toMatchObject({ title: "Azotea", durationSec: 12, durationSource: "manual" });
    expect(sc[1].characterIds).toEqual(["c2"]);
  });
  it("sin encabezados: párrafos → escenas, fusionando los muy cortos", () => {
    const t = "Corto uno.\n\nCorto dos.\n\n" + "Una frase larga de relleno para superar el umbral de palabras mínimo de la escena. ".repeat(4);
    const sc = parseScript(t, chars);
    expect(sc.length).toBe(2); expect(sc[0].lines.length).toBe(2);
  });
  it("divide escenas largas por frases sin partir diálogos", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Frase número ${i} con varias palabras para alargar el texto bastante.`).join(" ");
    const out = splitLong([{ title: "Larga", location: "Larga", lines: [{ text: long }, { speaker: "KAP", text: "Un diálogo corto." }] }]);
    expect(out.length).toBeGreaterThan(1); expect(out.every((s) => s.lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0) <= 70)).toBe(true);
    expect(out.flatMap((s) => s.lines).filter((l) => l.speaker).length).toBe(1);
  });
  it("guion vacío → sin escenas; duración estimada acotada", () => {
    expect(parseScript("   \n\n  ", chars)).toEqual([]);
    expect(estimateSeconds(1)).toBe(3); expect(estimateSeconds(1000)).toBe(30);
  });
  it("ida y vuelta texto ↔ líneas (editor)", () => {
    const l = textToLines("Narrador suelto.\nMIRA: hola\nKAP: ¿qué?", chars);
    expect(l).toEqual([{ text: "Narrador suelto." }, { speaker: "Mira", text: "hola" }, { speaker: "KAP", text: "¿qué?" }]);
  });
});

describe("petición del usuario (solo patrones reconocibles)", () => {
  it("extrae duración, shorts y ánimo; conserva el resto", () => {
    const h = parseBrief("Episodio de 5 minutos con 3 shorts, tono oscuro y mucha tensión");
    expect(h).toMatchObject({ targetSec: 300, shortsCount: 3, mood: "oscuro" }); expect(h.unrecognized).toContain("mucha tensión");
    expect(parseBrief("dos shorts").shortsCount).toBe(2); expect(parseBrief("sin shorts por favor").shortsCount).toBe(0);
  });
  it("no inventa nada cuando no reconoce", () => {
    const h = parseBrief("Haz algo épico con un dragón"); expect(h.targetSec).toBeUndefined(); expect(h.shortsCount).toBeUndefined(); expect(h.mood).toBe("épico");
  });
});

const A = (o: Partial<Asset> & { id: string }): Asset => ({ kind: "image", path: o.id + ".png", origin: "uploaded", license: "propio", createdAt: "2026-01-01", name: o.id, mime: "image/png", size: 1, ...o });
const S = (o: Partial<Scene>): Scene => ({ id: "x", order: 0, location: "", summary: "", characterIds: [], dialogue: "", durationSec: 5, title: "", lines: [], narration: "", visualHint: "", mood: "", tags: [], transition: "fade", motion: "kenburns", durationSource: "estimated", directions: [], memory: [], locked: false, ...o });
const P = (o: Partial<Place>): Place => ({ id: "p", name: "Refugio", description: "", createdAt: "x", ...o });
const C = (o: Partial<Character>): Character => ({ id: "c1", name: "KAP", description: "", traits: [], voiceNotes: "", referenceAssetIds: [], ...o });

describe("asignación de visuales", () => {
  const assets = [A({ id: "refugio-noche", tags: ["refugio", "noche"] }), A({ id: "azotea", tags: ["azotea"] }), A({ id: "kap-ref" }), A({ id: "tema", kind: "audio", role: "music" })];
  it("usa la biblioteca por etiquetas y recuerda el lugar", () => {
    const a = assignVisual(S({ location: "Refugio", tags: ["refugio"] }), { assets, characters: [], places: [], recent: [] });
    expect(a).toMatchObject({ visualAssetId: "refugio-noche", visualSource: "library", rememberPlace: { placeName: "Refugio", assetId: "refugio-noche" } });
  });
  it("la memoria del lugar (continuidad entre episodios) gana a la biblioteca", () => {
    const a = assignVisual(S({ location: "Refugio", tags: ["azotea"] }), { assets, characters: [], places: [P({ visualAssetId: "kap-ref" })], recent: [] });
    expect(a).toMatchObject({ visualAssetId: "kap-ref", visualSource: "memory" });
  });
  it("la directiva [imagen:] tiene prioridad sobre la memoria", () => {
    const a = assignVisual(S({ location: "Refugio", visualHint: "azotea al amanecer" }), { assets, characters: [], places: [P({ visualAssetId: "kap-ref" })], recent: [] });
    expect(a.visualSource).toBe("directive"); expect(a.visualAssetId).toBe("azotea");
  });
  it("personaje → su imagen de referencia; sin nada → tarjeta (no se inventa)", () => {
    expect(assignVisual(S({ characterIds: ["c1"] }), { assets, characters: [C({ referenceAssetIds: ["kap-ref"] })], places: [], recent: [] })).toMatchObject({ visualSource: "character", visualAssetId: "kap-ref" });
    expect(assignVisual(S({ location: "Lugar desconocido" }), { assets: [], characters: [], places: [], recent: [] })).toEqual({ visualSource: "card" });
  });
  it("nunca usa audio/música como imagen, y respeta la elección manual", () => {
    expect(assignVisual(S({ tags: ["tema"] }), { assets, characters: [], places: [], recent: [] }).visualAssetId).toBeUndefined();
    expect(assignVisual(S({ visualSource: "manual", visualAssetId: "azotea" }), { assets, characters: [], places: [], recent: [] })).toMatchObject({ visualAssetId: "azotea", visualSource: "manual" });
  });
  it("evita repetir la misma imagen más de dos veces seguidas si hay alternativa", () => {
    const two = [A({ id: "a", tags: ["bosque"] }), A({ id: "b", tags: ["bosque"], createdAt: "2026-02-01" })];
    const r = assignAll([S({ id: "1", tags: ["bosque"] }), S({ id: "2", tags: ["bosque"] }), S({ id: "3", tags: ["bosque"] })], { assets: two, characters: [], places: [] });
    expect(r.scenes.map((s) => s.visualAssetId)).toEqual(["a", "a", "b"]);
  });
  it("las escenas bloqueadas no se reasignan", () => {
    const r = assignAll([S({ id: "1", locked: true, visualSource: "manual", visualAssetId: "azotea", tags: ["refugio"] })], { assets, characters: [], places: [] });
    expect(r.scenes[0].visualAssetId).toBe("azotea");
  });
});

describe("subtítulos", () => {
  it("cues: dentro de la escena, ordenados, proporcionales y sin solaparse", () => {
    const cues = buildSceneCues([{ speaker: "MIRA", text: "Una frase corta. Otra frase bastante más larga que la primera para ver proporción." }, { speaker: "KAP", text: "Vamos." }], 10, { maxChars: 42 });
    expect(cues.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < cues.length; i++) { expect(cues[i].start).toBeGreaterThanOrEqual(0); expect(cues[i].end).toBeLessThanOrEqual(10.001); expect(cues[i].end).toBeGreaterThan(cues[i].start); if (i) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end - 0.001); }
  });
  it("escenas muy cortas con mucho texto se reescalan sin desbordar", () => {
    const cues = buildSceneCues([{ speaker: "KAP", text: Array.from({ length: 12 }, (_, i) => `Frase ${i}.`).join(" ") }], 3, { maxChars: 10 });
    expect(Math.max(...cues.map((c) => c.end))).toBeLessThanOrEqual(3.001);
  });
  it("wrap2 equilibra en 2 líneas", () => { expect(wrap2("uno dos tres cuatro cinco seis", 18)).toEqual(["uno dos tres", "cuatro cinco seis"]); });
  it("ASS: estilo KAP, nombre en amarillo, escapes seguros, tamaños según formato y posición", () => {
    const cues = [{ start: 0.5, end: 2, speaker: "KAP", text: "Hola {mundo} \\ fin" }];
    const h = toASS(cues, { width: 1920, height: 1080, style: DEFAULT_SUB_STYLE });
    expect(h).toContain("PlayResX: 1920"); expect(h).toContain("Style: KAP,Inter,51"); expect(h).toContain("&H0049B9E9"); expect(h).not.toContain("{mundo}"); expect(h).toContain("0:00:00.50");
    const v = toASS(cues, { width: 1080, height: 1920, style: { ...DEFAULT_SUB_STYLE, scale: 1.2, position: "center" } });
    expect(v).toContain("Style: KAP,Inter,75"); expect(v).toMatch(/,5,\d+,\d+,0,1\n/);
  });
  it("SRT y VTT válidos", () => {
    const c = [{ start: 1.5, end: 3.25, text: "Hola" }];
    expect(toSRT(c)).toBe("1\n00:00:01,500 --> 00:00:03,250\nHola\n"); expect(toVTT(c)).toContain("WEBVTT"); expect(toVTT(c)).toContain("00:00:01.500 --> 00:00:03.250");
  });
});

describe("planificación de Shorts", () => {
  const eps = Array.from({ length: 12 }, (_, i) => S({ id: `e${i}`, order: i, durationSec: 20, lines: i === 5 ? [{ speaker: "KAP", text: "a" }, { speaker: "MIRA", text: "b" }, { speaker: "KAP", text: "c" }] : [{ text: "x" }], characterIds: i === 5 ? ["c1", "c2"] : [] }));
  it("elige tramos de 20-58 s sin solaparse, en orden, con motivo", () => {
    const p = planShorts(eps, 3);
    expect(p).toHaveLength(3);
    for (const s of p) { expect(s.durationSec).toBeGreaterThanOrEqual(20); expect(s.durationSec).toBeLessThanOrEqual(58); expect(s.reason).toBeTruthy(); }
    const ids = p.flatMap((s) => s.sceneIds); expect(new Set(ids).size).toBe(ids.length);
    expect(p[0].startSec).toBeLessThan(p[1].startSec);
    expect(p.some((s) => s.sceneIds.includes("e0"))).toBe(true); expect(p.some((s) => s.sceneIds.includes("e5"))).toBe(true);
  });
  it("casos límite", () => { expect(planShorts(eps, 0)).toEqual([]); expect(planShorts([], 3)).toEqual([]); expect(planShorts(eps.slice(0, 2), 5).length).toBeLessThanOrEqual(1); });
});
describe("texto", () => { it("norm quita acentos", () => expect(norm("Ñandú Árbol")).toBe("nandu arbol")); });

describe("direcciones de escena (cableado del analizador)", () => {
  it("las directivas 2D del guion llegan a Scene.directions y no se mezclan con las de imagen/música", () => {
    const sc = toScenes(parseScript(`# Refugio\n[entra: KAP izquierda]\n[camara: zoom 1.3]\n[vfx: lluvia]\n[imagen: refugio de noche]\n[musica: tenso]\nKAP despierta.`, chars), chars, id);
    expect(sc[0].directions).toEqual(["entra: KAP izquierda", "camara: zoom 1.3", "vfx: lluvia"]);
    expect(sc[0].visualHint).toBe("refugio de noche");
  });
});

describe("las líneas [clave: valor] nunca se narran ni se subtitulan", () => {
  it("pose y plano son direcciones; una clave desconocida se conserva para AVISAR, no para locutarla", () => {
    const sc = toScenes(parseScript(`# Bosque\n[pose: Vega brazos cruzados en 1s]\n[plano: primer plano KAP corte]\n[baila: KAP]\nKAP camina despacio.\nMIRA: Hola.`, chars), chars, id);
    expect(sc[0].directions).toEqual(["pose: Vega brazos cruzados en 1s", "plano: primer plano KAP corte", "baila: KAP"]);
    expect(sc[0].narration).toBe("KAP camina despacio."); expect(sc[0].lines.map((l) => l.text).join(" ")).not.toMatch(/pose|plano|baila|\[/);
  });
  it("también sin encabezados de escena", () => {
    const sc = parseScript(`[vfx: lluvia]\nLlueve.\n\n[zumba: KAP]\nOtra frase.`, chars);
    expect(sc.flatMap((x) => x.lines).every((l) => !/\[|zumba|vfx/.test(l.text))).toBe(true);
  });
  it("«KAP: KAP: texto» se presenta como «KAP: texto» (el modelo repetía el nombre dentro de la línea)", () => {
    const p = parseScript("# Patio\nKAP: KAP: La pelota se fue volando.\nHERMANO DE KAP: HERMANO DE KAP: ¿Qué pasó?\nKAP: KAP, ¿me oyes?", [{ id: "1", name: "KAP" }, { id: "2", name: "Hermano de KAP" }]);
    expect(p[0].lines).toEqual([{ speaker: "KAP", text: "La pelota se fue volando." }, { speaker: "Hermano de KAP", text: "¿Qué pasó?" }, { speaker: "KAP", text: "KAP, ¿me oyes?" }]);   // un vocativo no se toca
  });
});
