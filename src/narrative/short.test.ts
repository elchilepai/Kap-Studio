import { describe, expect, it } from "vitest";
import { audioGaps, beatsToScenes, causalReasons, estimateRenderSeconds, groupScenes, repairShort, shortRetentionCheck, introReasons, outroReasons, type ShortBeat } from "./short";
import { parseDirection, parseDirectorCue } from "../animation/beats";
import { validateIR } from "../domain/screenplay";
import { draftToIR } from "../server/ai/episode";
import { draftToShortScript, storyToDraft, type ShortStory } from "../server/ai/short";
import { parsedToIR } from "../server/studio/interpreter";
import { parseScript } from "../server/studio/script";
import { B, good, INTRO, OBJETO, OUTRO } from "./short.fixture";

const names = ["KAP", "Hermano de KAP"];
const story: ShortStory = { intro: INTRO, outro: OUTRO, objeto: OBJETO, objetivo: "hacer una torre alta", title: "Las latas", logline: "KAP copia una torre y la hace a su manera.", hook: "", cast: names, beats: [] };
const PRES = { intro: INTRO, outro: OUTRO };
const check = (b: ShortBeat[], objeto = OBJETO) => shortRetentionCheck(b, { renderSeconds: estimateRenderSeconds(beatsToScenes(b, names, { objeto, ...PRES })), objeto, presenter: PRES });
/** El primer Short real: tristeza → abrazo → sonrisa. No debe pasar. */
const hugs = (): ShortBeat[] => [
  B("hook", "situacion", "KAP mira por la ventana con una mirada triste, observando a otros niños en el parque.", { location: "Habitación" }),
  B("contexto", "situacion", "KAP entra en la habitación donde su hermano juega. El hermano sonríe al ver a KAP.", { location: "Habitación", change: "el hermano sonríe" }),
  B("escalada", "intento", "KAP mira a su hermano y luego se mira las manos, frustrado.", { location: "Habitación", change: "KAP se siente frustrado" }),
  B("escalada", "fallo", "El hermano lo observa y le da un abrazo pequeño.", { location: "Habitación", change: "abrazo" }),
  B("escalada", "segundo-intento", "KAP se pone de pie y empieza a limpiar la habitación.", { location: "Habitación", change: "KAP limpia" }),
  B("giro", "descubrimiento", "El hermano lo mira con admiración y le da otro abrazo, sonriendo.", { location: "Habitación", change: "otro abrazo" }),
  B("remate", "remate", "KAP mira a su hermano y suspira, con una sonrisa pequeña. El hermano le devuelve la sonrisa.", { location: "Habitación", change: "sonrisa" }),
];

/** El caso negativo pedido: miradas, caminar, sentarse, escribir y sonreír, aunque Qwen lo etiquete con la estructura completa. */
const labelledEmpty = (): ShortBeat[] => [
  B("hook", "situacion", "KAP mira a otros niños desde la ventana. Los niños juegan con un cuaderno de dibujos en la calle.", { location: "Habitación", characters: ["KAP"] }),
  B("contexto", "intento", "KAP camina hacia la puerta con paso firme y sale a la calle. Camina despacio hasta el parque.", { location: "Calle", change: "KAP sale de casa" }),
  B("escalada", "fallo", "KAP se queda parado a unos metros del grupo. Nadie lo ve. KAP se sienta en un banco.", { location: "Calle", change: "nadie lo ve" }),
  B("escalada", "reaccion", "KAP suspira y mira el suelo. Se pone serio y se levanta.", { location: "Calle", change: "KAP se pone serio" }),
  B("giro", "segundo-intento", "KAP vuelve a casa y se sienta con el cuaderno. Escribe algo en el cuaderno y lo cierra.", { location: "Habitación", change: "KAP escribe" }),
  B("giro", "descubrimiento", "KAP se da cuenta de que cada uno tiene su ritmo. Vuelve a salir con paso firme.", { location: "Calle", change: "KAP comprende" }),
  B("remate", "remate", "KAP sonríe levemente y camina hacia sus amigos. Mira al cielo y sonríe.", { location: "Calle", change: "KAP sonríe" }),
];
/** Otro tema (bici): el caso positivo genérico objetivo concreto → acción de KAP → consecuencia → reacción → estrategia distinta → consecuencia distinta → cambio. */
const bike = (): ShortBeat[] => [
  B("hook", "situacion", "El hermano de KAP pedalea sobre una bici sin ruedines y frena de golpe junto a la valla. Levanta los brazos. La bici se queda recta.", { characters: ["Hermano de KAP", "KAP"], location: "Patio" }),
  B("contexto", "situacion", "KAP sube a su bici con los ruedines puestos. Agarra el manillar con las dos manos. Empuja el pedal y avanza dos metros.", { location: "Patio", reaction: "El hermano le hace un gesto para que se quite los ruedines.", change: "KAP quiere ir sin ruedines", goal: "montar la bici sin ruedines" }),
  B("escalada", "intento", "KAP quita los ruedines con una llave. Sube a la bici y empuja el pedal con fuerza. Acelera deprisa para no caerse.", { location: "Patio", change: "KAP arranca sin ruedines", goal: "montar sin ruedines a toda velocidad" }),
  B("escalada", "fallo", "La bici se tuerce y se cae contra la valla. La rueda delantera rueda sola por el suelo. KAP se levanta con la rodilla manchada de tierra.", { location: "Patio", reaction: "KAP patea la rueda y aprieta los puños. Esconde la rodilla detrás de la bici.", change: "la bici se cae", goal: "no hacer el ridículo" }),
  B("giro", "segundo-intento", "KAP observa los pies del hermano y baja el sillín de la bici con la llave. Apoya los dos pies en el suelo y empuja despacio. La bici rueda sin pedalear hasta el final del patio.", { location: "Patio", change: "KAP prueba a ir despacio con los pies abajo", goal: "ir despacio con los pies abajo" }),
  B("giro", "descubrimiento", "La bici se mantiene recta mientras rueda despacio. KAP levanta un pie y la bici sigue recta. Pedalea una vuelta entera sin caerse.", { location: "Patio", change: "la bici se mantiene con el sillín bajo" }),
  B("remate", "remate", "KAP baja el sillín de la bici un dedo más y vuelve a pedalear junto a la valla. El hermano pedalea a su lado sin hablar.", { characters: ["Hermano de KAP", "KAP"], location: "Patio", change: "KAP pedalea junto a su hermano" }),
];

describe("SHORT_RETENTION_CHECK (12 comprobaciones, sin modelo)", () => {
  it("un Short con la cadena causal completa pasa; el render dura lo que dice su contenido, no lo que declara el modelo", () => {
    const g = good(), est = estimateRenderSeconds(beatsToScenes(g, names, { objeto: OBJETO, ...PRES })); const r = check(g);
    expect(r.total).toBe(12); expect(r.failed).toEqual([]); expect(est).toBeGreaterThanOrEqual(50); expect(est).toBeLessThanOrEqual(70);
    expect(shortRetentionCheck(g, { renderSeconds: 25.9, objeto: OBJETO }).checks.find((c) => c.id === "duracion-justa")).toMatchObject({ ok: false, fix: "rewrite" });   // 20-30 s no cuenta como Short terminado
    expect(shortRetentionCheck(g, { renderSeconds: 47, objeto: OBJETO }).checks.find((c) => c.id === "duracion-justa")!.ok).toBe(false);   // el mínimo es 50 s
    expect(shortRetentionCheck(g, { renderSeconds: 58, objeto: OBJETO }).checks.find((c) => c.id === "duracion-justa")!.ok).toBe(true); expect(shortRetentionCheck(g, { renderSeconds: 90, objeto: OBJETO }).checks.find((c) => c.id === "duracion-justa")!.ok).toBe(false);
  });
  it("CAUSALIDAD REAL: miradas, paseos, sentarse, escribir y sonreír NO pasan aunque Qwen los etiquete como situación → intento → fallo → reacción → segundo intento → descubrimiento → remate", () => {
    const g = labelledEmpty(); expect(g.map((b) => b.step)).toEqual(["situacion", "intento", "fallo", "reaccion", "segundo-intento", "descubrimiento", "remate"]);
    const c = check(g, "cuaderno").checks.find((x) => x.id === "escalada")!; expect(c.ok).toBe(false); expect(c.fix).toBe("rewrite"); expect(c.note).toMatch(/ninguna acción concreta de KAP con el objeto|consecuencia observable/);
    expect(causalReasons(g, "cuaderno").join(" ")).not.toBe("");
  });
  it("una cadena real (otro tema, otro objeto) pasa por lo que dice el texto, no por las etiquetas", () => {
    expect(causalReasons(bike(), "bici")).toEqual([]);
    const relabelled = good().map((b) => ({ ...b, step: "situacion" as const })); expect(causalReasons(relabelled, OBJETO)).toEqual([]);   // las etiquetas no importan
  });
  it("«nadie lo ve» no es un fallo: sin acción previa de KAP con el objeto no hay intento ni fallo", () => {
    const g = good().map((b, i) => (i === 2 || i === 3 ? { ...b, action: "KAP se acerca al grupo. Nadie lo ve. KAP se queda parado con las manos en los bolsillos.", reaction: "" } : b));
    expect(causalReasons(g, OBJETO).join(" ")).toMatch(/consecuencia observable|ninguna acción concreta/);
  });
  it("el segundo intento no puede repetir el primero", () => {
    const g = good(), k = g.findIndex((b) => b.step === "segundo-intento"), a = g[2]; g[k] = { ...g[k], action: a.action, reaction: "" };
    expect(causalReasons(g, OBJETO).join(" ")).toMatch(/repite el primero|no hay un segundo intento/);
  });
  it("un descubrimiento abstracto o sin acción posterior no cuenta", () => {
    const abs = good().map((b) => (b.step === "descubrimiento" ? { ...b, action: b.action + " KAP se da cuenta de que cada uno tiene su ritmo." } : b)); expect(causalReasons(abs, OBJETO).join(" ")).toMatch(/abstracta/);
    const dead = good().map((b) => (b.step === "remate" ? { ...b, action: "El hermano mira las dos torres y se va. KAP levanta una ceja.", reaction: "" } : b.step === "descubrimiento" ? { ...b, action: "La torre de KAP se queda en pie, más baja y más ancha que la del hermano. Todo aguanta.", reaction: "" } : b)); expect(causalReasons(dead, OBJETO).join(" ")).toMatch(/no cambia ninguna acción posterior/);
  });
  it("el hermano no puede resolver el conflicto por KAP", () => {
    const g = good().map((b) => (["segundo-intento", "descubrimiento", "remate"].includes(b.step) ? { ...b, action: b.action.replace(/KAP /g, "El hermano ").replace(/^El hermano /, "El hermano ") } : b)); expect(causalReasons(g, OBJETO).length).toBeGreaterThan(0);
  });
  it("el gancho tiene que mostrar a alguien consiguiendo algo con el objeto; «KAP mira por la ventana» no vale", () => {
    const g = good(); g[0] = { ...g[0], action: "KAP mira por la ventana. Ve a otros niños corriendo en la calle.", reaction: "" }; expect(causalReasons(g, OBJETO).join(" ")).toMatch(/gancho/);
  });
  it("tristeza → abrazo → sonrisa (el primer Short real) NO pasa como Short válido", () => {
    const c = check(hugs(), "ventana").checks.find((x) => x.id === "escalada")!; expect(c.ok).toBe(false);
  });
  it("gancho: sin acción visible en el primer beat falla y pide parche local", () => {
    const g = good(); g[0] = B("hook", "situacion", "Una casa vieja con paredes azules y mucha luz", { seconds: 3 }); const c = shortRetentionCheck(g, { objeto: OBJETO }).checks.find((x) => x.id === "hook-claro")!; expect(c.ok).toBe(false); expect(c.fix).toBe("patch");   // sin presentador: el primer beat debe ser acción
    expect(introReasons(INTRO)).toEqual([]); expect(introReasons("Debes recordar que cada uno tiene su propio ritmo en la vida").join(" ")).toMatch(/coach/); expect(introReasons("Hola").join(" ")).toMatch(/palabras/); expect(introReasons("Hoy vamos a hablar de lo que significa avanzar en tu camino personal junto a otros").length).toBeGreaterThan(0);
    expect(outroReasons(OUTRO)).toEqual([]); expect(outroReasons({ gesto: "suspira", texto: "Cada persona tiene su ritmo y todos llegamos a donde tenemos que llegar" }).length).toBeGreaterThan(0); expect(outroReasons(undefined).length).toBe(1);
  });
  it("remate: una moraleja o una conferencia falla; un final de frase corta pasa", () => {
    const g = good(); g.at(-1)!.dialogue = { speaker: "KAP", text: "Desde ese día aprendió que la verdad es lo importante" }; expect(check(g).failed).toContain("remate");
    g.at(-1)!.dialogue = { speaker: "KAP", text: "Bueno… algo es algo." }; expect(check(g).failed).not.toContain("remate");
    g.at(-1)!.dialogue = { speaker: "KAP", text: "Cada persona tiene su propio ritmo y comparar el camino de los demás con el mío solo me hace daño sin motivo" }; expect(check(g).failed).toContain("remate");
    const m = good(); m[4].dialogue = { speaker: "KAP", text: "Lo importante es que cada uno avance a su ritmo" }; expect(check(m).failed).toContain("sin-tramos-solo-dialogo");
  });
  it("beats repetidos y prescindibles se detectan y se reparan en código (nunca el hook, el giro ni el remate)", () => {
    const g = good(); g.splice(3, 0, { ...g[2], seconds: 4 }); expect(check(g).failed).toContain("sin-repetidos");
    const fixed = repairShort(g); expect(fixed.merged).toBeGreaterThanOrEqual(1); expect(fixed.beats.length).toBeLessThan(g.length); expect(fixed.beats[0].phase).toBe("hook"); expect(fixed.beats.some((b) => b.phase === "giro")).toBe(true); expect(fixed.beats.at(-1)!.phase).toBe("remate");
  });
});

describe("beats → escenas: sin relleno ni pérdida", () => {
  it("una historia de una sola localización NO duplica ninguna línea para fabricar escenas (la IR admite 1 escena)", () => {
    const one = [B("hook", "situacion", "KAP apila tres latas en el patio."), B("remate", "remate", "KAP empuja la torre con un dedo y aguanta.", { goal: "probar" })], sc = beatsToScenes(one, names), all = sc.flatMap((s) => s.lines.map((l) => l.text));
    expect(new Set(all).size).toBe(all.length); expect(all).toHaveLength(2); expect(sc.length).toBeLessThanOrEqual(2);
    const { draft, scenes } = storyToDraft(story, one, names); expect(draft.scenes.length).toBe(scenes.length); expect(scenes.length).toBe(sc.length + 2); expect(validateIR(parsedToIR(parseScript(draftToShortScript(draft, scenes), names.map((n, i) => ({ id: String(i), name: n })))), { characters: names, places: [] }).errors.filter((e) => !/lugar|place/i.test(e))).toEqual([]);
  });
  it("varias acciones relacionadas forman UNA escena; el corte llega con una razón (cambio de clase de montaje o de lugar) y ningún beat se pierde ni se repite", () => {
    const g = good(), sc = beatsToScenes(g, names), all = sc.flatMap((s) => s.lines.map((l) => l.text)); expect(new Set(all).size).toBe(all.length);
    expect(sc.length).toBeGreaterThan(2); expect(sc.length).toBeLessThan(g.length);   // no hay una escena por beat
    expect(sc.slice(1).every((s) => s.transition === "cut")).toBe(true); expect(sc[0].transition).toBeUndefined(); expect(groupScenes(g).flatMap((s) => s.beats)).toEqual(g);
    expect(groupScenes(g).some((s) => s.beats.length > 1)).toBe(true);   // intento + fallo juntos, segundo intento + resultado juntos
    for (const s of sc) expect(s.directions).toContain("montaje: continuo");   // el guion no parte la escena
  });
  it("NINGUNA directiva se recorta (antes: slice(0, 8)) y cada escena conserva las suyas, con tiempos de la duración real de las líneas", () => {
    const many = Array.from({ length: 9 }, (_, i) => B(i === 0 ? "hook" : i === 8 ? "remate" : "escalada", i === 8 ? "remate" : "intento", `KAP apila la lata ${i}.`, { sound: "bump", music: i % 2 ? "change" : "none", goal: `lata ${i}`, change: `lata ${i} puesta`, seconds: 2 }));
    const sc = beatsToScenes(many, names), dirs = sc.flatMap((s) => s.directions); expect(dirs.filter((d) => /^plano|^camara/.test(d))).toHaveLength(9); expect(dirs.filter((d) => /^sonido: golpe/.test(d))).toHaveLength(9); expect(dirs.filter((d) => /^marca-musica: cambio/.test(d))).toHaveLength(4);
    const { draft, scenes } = storyToDraft(story, many, names), script = draftToShortScript(draft, scenes); expect((script.match(/^\[sonido: golpe/gm) ?? []).length).toBe(9);
    const parsed = parseScript(script, names.map((n, i) => ({ id: String(i), name: n }))); expect(parsed.flatMap((p) => p.directions ?? []).filter((d) => /^sonido: golpe/.test(d))).toHaveLength(9);   // llegan al director, ninguna se pierde al partir escenas
    const t = dirs.filter((d) => /^plano|^camara/.test(d)).map((d) => Number(/en ([\d.]+)s/.exec(d)![1])); expect(t[1]).toBeGreaterThan(t[0]);
  });
  it("la narración nunca es un hablante; el diálogo conserva su hablante", () => {
    const lines = beatsToScenes(good(), names).flatMap((s) => s.lines); expect(lines.filter((l) => l.speaker).every((l) => /hermano|kap/i.test(l.speaker))).toBe(true); expect(lines.some((l) => !l.speaker && /latas/.test(l.text))).toBe(true);
  });
  it("el guion lo entiende el pipeline normal: IR válida y sin avisos por sonido/marcas", () => {
    const { draft, scenes } = storyToDraft(story, good(), names), script = draftToShortScript(draft, scenes), ir = parsedToIR(parseScript(script, names.map((n, i) => ({ id: String(i), name: n }))));
    expect(ir.warnings.filter((w) => /sonido|musica|impacto|silencio/i.test(w))).toEqual([]); expect(validateIR(ir, { characters: names, places: [] }).errors.filter((e) => !/lugar|place/i.test(e))).toEqual([]); expect(draftToIR(draft).scenes.length).toBe(scenes.length); expect(ir.scenes.length).toBeGreaterThanOrEqual(scenes.length);   // solo un beat de más de 52 palabras puede partirse (por eso el prompt lo limita)
    expect(ir.scenes[0].hints.transition).toBeUndefined(); expect(ir.scenes.slice(1).every((x) => x.hints.transition === "cut")).toBe(true);
  });
  it("las marcas de música NO se convierten en música real: ninguna escena recibe una pista (hint de música)", () => {
    const { draft, scenes } = storyToDraft(story, good(), names), script = draftToShortScript(draft, scenes), ir = parsedToIR(parseScript(script, names.map((n, i) => ({ id: String(i), name: n }))));
    expect(script).toMatch(/\[marca-musica: inicio/); expect(script).not.toMatch(/\[musica:/); expect(ir.scenes.every((s) => !s.hints.music)).toBe(true);
  });
});

describe("montaje y audio del Short", () => {
  const times = (d: string[], re: RegExp) => d.filter((x) => re.test(x)).map((x) => Number(/en ([\d.]+)s/.exec(x)![1]));
  it("las directivas NO caen todas al principio de la escena: sonidos y reacción se reparten según el texto y la duración de las líneas", () => {
    const sc = beatsToScenes(good(), names), multi = sc.filter((s) => s.directions.filter((d) => /^sonido: (?!ambiente)/.test(d)).length >= 2);
    expect(multi.length).toBeGreaterThan(0); expect(multi.some((s) => new Set(times(s.directions, /^sonido: (?!ambiente)/)).size > 1)).toBe(true);
    const nonAmbient = sc.flatMap((x) => x.directions).filter((d) => /^(sonido: (?!ambiente)|impacto|silencio)/.test(d)); expect(new Set(nonAmbient.map((d) => /en ([\d.]+)s/.exec(d)![1])).size).toBeGreaterThan(8);   // repartidos en el tiempo, no todos a 0,3 s
    expect(sc.some((s) => times(s.directions, /^plano: primer plano/).some((t) => t > 1.5))).toBe(true);   // corte a la reacción en su momento
  });
  it("cada escena (salvo la primera) entra con CORTE, también al cambiar de lugar; sin fundidos que mezclen escenas", () => {
    const g = good(); g[3].location = "Calle"; g[4].location = "Calle"; const sc = beatsToScenes(g, names); expect(sc.length).toBeGreaterThan(2); expect(sc[0].transition).toBeUndefined(); expect(sc.slice(1).every((s) => s.transition === "cut")).toBe(true);
  });
  it("hay sonido real de acción (pasos, golpes, objetos) y los tramos largos sin sonido se detectan", () => {
    const sc = beatsToScenes(good(), names), all = sc.flatMap((s) => s.directions); expect(all.some((d) => /^sonido: golpe/.test(d))).toBe(true); expect(all.some((d) => /^sonido: llamar/.test(d))).toBe(true);   // llamar = objeto colocado/golpeado (toc)
    expect(audioGaps(sc, 5).every((g) => g.to - g.from < 6)).toBe(true);
    const mute = [{ title: "x", location: "Patio", lines: [{ speaker: "", text: "KAP espera." }, { speaker: "", text: "KAP mira el cielo con calma durante un buen rato y no pasa nada más aquí." }, { speaker: "", text: "KAP sigue mirando el cielo sin hacer ruido alguno por ahora." }, { speaker: "", text: "KAP espera otro rato junto a la valla sin moverse del sitio." }, { speaker: "", text: "KAP cuenta las nubes despacio una por una mientras espera." }, { speaker: "", text: "KAP mira el suelo y espera un poco más sin decir nada." }], memory: [], stage: "inicio", shot: "medio", time: "tarde", interior: false, directions: ["sonido: ambiente en 0.3s durante 10s"], change: "x" }];
    expect(audioGaps(mute as never, 5).length).toBeGreaterThan(0);   // el ambiente de fondo no cuenta como sonido de acción
  });
});

describe("directivas solo del director (sonido, marca-musica, impacto, silencio)", () => {
  it("parseDirection no las trata como beat ni como aviso", () => { for (const d of ["sonido: puerta en 2s", "marca-musica: inicio en 0s", "impacto: en 5s", "silencio: en 6s durante 1.5s"]) expect(parseDirection(d)).toEqual({}); expect(parseDirection("camara: seguir KAP en 2s").beat).toBeDefined(); expect(parseDirection("baila: KAP").warning).toBeDefined(); });
  it("parseDirectorCue produce marcas con tiempo", () => {
    expect(parseDirectorCue("sonido: puerta en 2.5s")).toEqual({ sound: { t: 2.5, kind: "door" } }); expect(parseDirectorCue("marca-musica: inicio en 0.3s")).toEqual({ music: { t: 0.3, kind: "music_start" } }); expect(parseDirectorCue("marca-musica: cambio en 20s")?.music?.kind).toBe("music_change"); expect(parseDirectorCue("marca-musica: fin en 55s")?.music?.kind).toBe("music_stop");
    expect(parseDirectorCue("impacto: en 5s")).toEqual({ music: { t: 5, kind: "impact" }, sound: { t: 5, kind: "bump" } }); expect(parseDirectorCue("silencio: en 6s durante 2s")).toEqual({ music: { t: 6, kind: "silence", dur: 2 } });
    expect(parseDirectorCue("sonido: trompeta")?.warning).toBeDefined(); expect(parseDirectorCue("plano: general")).toBeUndefined();
  });
});
