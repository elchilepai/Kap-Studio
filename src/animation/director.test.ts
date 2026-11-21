import { describe, expect, it } from "vitest";
import { direct, resolveSet, syntheticEnvelope, type DirectorInput } from "./director.ts";
import { evaluate } from "./timeline.ts";
import { KAP_LOOK, MIRA_LOOK } from "./demo.ts";

const base = (o: Partial<DirectorInput> = {}): DirectorInput => ({
  duration: 8, aspect: 16 / 9, index: 0, fps: 30, width: 854, height: 480, location: "Refugio", mood: "", tags: [], narration: "", style: { ink: "#000000", line: 0.04, grade: "none", vignette: 0, shadow: true },
  characters: [{ id: "kap", name: "KAP", appearance: KAP_LOOK }, { id: "mira", name: "Mira", appearance: MIRA_LOOK }], lines: [], directions: [], ...o,
});
const types = (s: ReturnType<typeof direct>, t: string) => s.cues.filter((c) => c.type === t);

describe("director 2D por reglas", () => {
  it("coloca a los personajes en sus huecos y mirando entre sí", () => {
    const s = direct(base()); expect(s.actors.map((a) => a.slot)).toEqual([5.8, 10.2]); expect(s.actors.map((a) => a.facing)).toEqual([1, -1]);
    expect(direct(base({ characters: [base().characters[0]] })).actors[0].slot).toBe(8);
  });
  it("el diálogo genera boca, mirada, gestos, reacción del oyente y cámara", () => {
    const s = direct(base({ lines: [{ speaker: "MIRA", text: "¿Seguimos adelante, KAP? Todavía podemos volver.", start: 0.3, end: 3.5 }, { speaker: "KAP", text: "No. ¡Vamos!", start: 3.8, end: 5.2 }] }));
    const sp = types(s, "speak"); expect(sp).toHaveLength(2); expect(sp[0]).toMatchObject({ actor: "mira", t: 0.3 }); expect((sp[0] as { envelope: number[] }).envelope.length).toBe(Math.round(3.2 * 30));
    expect(types(s, "gesture").some((g) => (g as { actor: string }).actor === "kap" && (g as { value: string }).value === "nod")).toBe(true);   // el oyente asiente
    expect(types(s, "expression").some((e) => (e as { actor: string; value: string }).actor === "mira" && (e as { value: string }).value === "thinking")).toBe(true); // pregunta → pensativa
    expect(types(s, "camera").length).toBeGreaterThan(1);
  });
  it("usa la envolvente real del audio cuando existe", () => {
    const env = Array(30).fill(0.77); const s = direct(base({ lines: [{ speaker: "KAP", text: "Hola.", start: 0, end: 1 }], envelopes: [env] }));
    expect((types(s, "speak")[0] as { envelope: number[] }).envelope).toBe(env);
  });
  it("entiende las direcciones en español y las convierte en animación", () => {
    const s = direct(base({ directions: ["entra: KAP izquierda en 0.5s", "sale: Mira derecha en 5s", "camina: KAP a centro", "expresion: Mira triste en 1s", "gesto: KAP saluda en 2s", "camara: zoom 1.4 durante 2s", "vfx: lluvia", "aparece: linterna en 1s", "mira: KAP derecha"] }));
    expect(s.warnings).toEqual([]);
    expect(types(s, "enter")[0]).toMatchObject({ actor: "kap", from: "left", t: 0.5 }); expect(s.actors[0].presentAtStart).toBe(false);
    expect(types(s, "exit")[0]).toMatchObject({ actor: "mira", to: "right", t: 5 }); expect(types(s, "move")[0]).toMatchObject({ actor: "kap", x: 8 });
    expect(types(s, "expression").some((e) => (e as { value: string }).value === "sad")).toBe(true); expect(types(s, "gesture").some((g) => (g as { value: string }).value === "wave")).toBe(true);
    expect(types(s, "camera")[0]).toMatchObject({ zoom: 1.4, dur: 2 }); expect(types(s, "effect")[0]).toMatchObject({ effect: "rain" });
    expect(s.props[0].kind).toBe("lantern"); expect(types(s, "prop")[0]).toMatchObject({ action: "show", t: 1 });
    // y la línea de tiempo lo respeta
    expect(evaluate(s, 0.2).actors[0].visible).toBe(false); expect(evaluate(s, 1.5).actors[0].visible).toBe(true); expect(evaluate(s, 7).actors[1].visible).toBe(false);
  });
  it("avisa de lo que no entiende, sin inventar", () => {
    const s = direct(base({ directions: ["baila: KAP", "gesto: Nadie saluda", "camina: KAP a ninguna parte", "texto sin clave"] }));
    expect(s.warnings.length).toBe(4); expect(s.cues.some((c) => c.type === "move")).toBe(false);
  });
  it("sin direcciones la cámara nunca queda estática (varía por escena) y es determinista", () => {
    const cam = (i: number) => types(direct(base({ index: i })), "camera").map((c) => JSON.stringify(c)).join("|");
    expect(cam(0)).not.toBe(cam(1)); expect(cam(1)).not.toBe(cam(2)); expect(cam(0)).toBe(cam(0));
    expect(JSON.stringify(direct(base({ directions: ["gesto: KAP saluda"] })))).toBe(JSON.stringify(direct(base({ directions: ["gesto: KAP saluda"] }))));
  });
  it("la narración sugiere acciones (caminar, lluvia, trueno) cuando no hay direcciones manuales", () => {
    const s = direct(base({ narration: "KAP camina bajo la lluvia mientras se oye un trueno lejano." }));
    expect(types(s, "move")).toHaveLength(1); expect(types(s, "effect").some((e) => (e as { effect: string }).effect === "rain")).toBe(true); expect(types(s, "shake")).toHaveLength(1);
    expect(types(direct(base({ narration: "KAP camina.", directions: ["camina: KAP a derecha"] })), "move")).toHaveLength(1);   // la dirección manual manda
  });
  it("en vertical (9:16) la cámara sigue a quien habla", () => {
    const s = direct(base({ aspect: 9 / 16, width: 480, height: 854, lines: [{ speaker: "MIRA", text: "Hola.", start: 0.2, end: 1.5 }, { speaker: "KAP", text: "Adiós.", start: 2, end: 3 }] }));
    expect(types(s, "camera").filter((c) => (c as { focus?: string }).focus).map((c) => (c as { focus: string }).focus)).toEqual(["mira", "kap"]);
  });
  it("el escenario sale del lugar y del ánimo", () => {
    expect(resolveSet("Refugio", [], "").preset).toBe("room"); expect(resolveSet("Azotea de la torre", [], "").preset).toBe("rooftop"); expect(resolveSet("Calle vacía", [], "oscuro")).toMatchObject({ preset: "street", timeOfDay: "night" });
    expect(resolveSet("Lugar raro", [], "").preset).toBe("abstract"); expect(resolveSet("X", [], "", { preset: "forest", timeOfDay: "day" })).toMatchObject({ preset: "forest", timeOfDay: "day" });
  });
  it("envolvente sintética: acotada, con pausas en la puntuación y determinista", () => {
    const e = syntheticEnvelope("Hola, ¿cómo estás? Muy bien.", 3, 30); expect(e).toHaveLength(90); expect(e.every((x) => x >= 0 && x <= 1)).toBe(true);
    expect(e.some((x) => x > 0.4)).toBe(true); expect(e.some((x) => x === 0)).toBe(true); expect(syntheticEnvelope("Hola, ¿cómo estás? Muy bien.", 3, 30)).toEqual(e);
  });
});

describe("decorado: un lugar exterior no se dibuja como interior", () => {
  it("«Puerta de casa» y «Calle cerca de la casa» son exterior; «Casa de KAP», «Cocina» o «Interior de la casa…» siguen siendo interior", () => {
    expect(resolveSet("Puerta de casa", [], "").preset).toBe("patio"); expect(resolveSet("Calle cerca de la casa", [], "").preset).toBe("street"); expect(resolveSet("Patio del colegio", [], "").preset).toBe("patio");
    expect(resolveSet("Casa de KAP", [], "").preset).toBe("room"); expect(resolveSet("Cocina", [], "").preset).toBe("room"); expect(resolveSet("Interior de la casa y calle cerca de la casa", [], "").preset).toBe("room");
  });
  it("si el beat dice «exterior», una casa no se dibuja como habitación; el resto del mapa no cambia", () => {
    expect(resolveSet("Casa de KAP", [], "Tarde, exterior").preset).toBe("street"); expect(resolveSet("Patio de la casa", [], "tarde, exterior").preset).toBe("patio");   // el patio doméstico no es una calle ni un skyline expect(resolveSet("Casa de KAP", [], "Tarde, interior").preset).toBe("room");
    expect(resolveSet("Azotea de la casa", [], "").preset).toBe("rooftop"); expect(resolveSet("Parque", [], "").preset).toBe("forest"); expect(resolveSet("Casa", [], "", { preset: "room" }).preset).toBe("room");
  });
});

describe("hora del día: lo que dice el guion manda", () => {
  it("mañana ≠ tarde ≠ atardecer ≠ noche, también sobre la hora del lugar guardado", () => {
    expect(resolveSet("Patio", [], "tarde, exterior").timeOfDay).toBe("afternoon"); expect(resolveSet("Patio", [], "mañana").timeOfDay).toBe("day"); expect(resolveSet("Patio", [], "de noche").timeOfDay).toBe("night"); expect(resolveSet("Patio", [], "al atardecer").timeOfDay).toBe("dusk");
    expect(resolveSet("Patio", [], "tarde", { preset: "patio", timeOfDay: "night" }).timeOfDay).toBe("afternoon");   // lo dicho gana al valor guardado
    expect(resolveSet("Patio", [], "", { preset: "patio", timeOfDay: "night" }).timeOfDay).toBe("night");               // sin hora dicha, vale la guardada
    expect(resolveSet("Patio", [], "triste").timeOfDay).toBe("dusk");                                                    // sin hora, el ánimo decide como antes
  });
});

describe("acciones que se VEN: la narración mueve el cuerpo y el plano pedido no apaga los de diálogo", () => {
  const poses = (s: ReturnType<typeof direct>) => s.cues.filter((c) => c.type === "pose").map((c) => `${(c as { actor: string }).actor}:${(c as { value: string }).value}`);
  it("«KAP se agacha…», «lanza», «retrocede» dan a quien lo hace esa pose (solo si el texto lo dice)", () => {
    const L = (text: string) => ({ text, start: 0.5, end: 3 });
    expect(poses(direct(base({ lines: [L("KAP se agacha para recoger la pelota.")] })))).toEqual(["kap:crouch"]);
    expect(poses(direct(base({ lines: [L("Mira lanza la pelota al aire.")] })))).toEqual(["mira:throw"]);
    expect(poses(direct(base({ lines: [L("KAP retrocede un paso, pero Mira se agacha junto a la maceta.")] }))).sort()).toEqual(["kap:recoil", "mira:crouch"]);
    expect(poses(direct(base({ lines: [L("KAP mira el cielo con una sonrisa.")] })))).toEqual([]);   // nada que mover: no inventa
    expect(poses(direct(base({ lines: [{ speaker: "KAP", text: "Me agacho yo ahora mismo, ya verás.", start: 0.5, end: 3 }] })))).toEqual([]);   // el diálogo no cuenta
  });
  it("las poses nuevas se aplican (el cuerpo se inclina) y vuelven a reposo", () => {
    const s = direct(base({ lines: [{ text: "KAP se agacha para recoger la pelota.", start: 0.5, end: 3 }] }));
    const at = (t: number) => evaluate(s, t).actors.find((a) => a.id === "kap")!;
    expect(at(1.5).pose).toBe("crouch"); expect(at(0.1).pose).toBe("idle"); expect(at(3.5).pose).toBe("idle");
  });
  it("un «plano:» del beat fija el encuadre inicial pero NO desactiva los planos de diálogo; «camara:» sí", () => {
    const lines = [{ speaker: "MIRA", text: "¿Seguimos adelante, KAP?", start: 0.3, end: 2.5 }, { speaker: "KAP", text: "No. ¡Vamos!", start: 2.8, end: 4.2 }];
    const withShot = direct(base({ directions: ["plano: general"], lines })), withCam = direct(base({ directions: ["camara: zoom 1.2"], lines }));
    expect(withShot.cues.filter((c) => c.type === "camera" && (c as { focus?: string }).focus).length).toBeGreaterThan(0);
    expect(withCam.cues.filter((c) => c.type === "camera" && (c as { focus?: string }).focus).length).toBe(0);
  });
  it("«se acerca» / «se aleja» mueven a quien lo hace hacia o lejos del otro, y «esconde/guarda/se quita» dan la pose de alcanzar; si el movimiento ya estaba dirigido a mano, no se duplica", () => {
    const L = (text: string) => ({ text, start: 0.5, end: 3 }), moves = (s: ReturnType<typeof direct>) => s.cues.filter((c) => c.type === "move") as { actor: string; x: number }[];
    const near = direct(base({ lines: [L("KAP se acerca despacio a Mira.")] })), kapSlot = near.actors.find((a) => a.id === "kap")!.slot, miraSlot = near.actors.find((a) => a.id === "mira")!.slot;
    expect(moves(near)).toHaveLength(1); expect(moves(near)[0].actor).toBe("kap"); expect(Math.abs(moves(near)[0].x - miraSlot)).toBeLessThan(Math.abs(kapSlot - miraSlot));   // hacia ella
    const far = direct(base({ lines: [L("KAP se aleja de Mira sin decir nada.")] })); expect(Math.abs(moves(far)[0].x - miraSlot)).toBeGreaterThan(Math.abs(kapSlot - miraSlot));   // lejos de ella
    expect(moves(direct(base({ lines: [L("KAP se acerca despacio a Mira.")], directions: ["camina: KAP a derecha"] }))).length).toBe(1);   // solo el dirigido a mano
    expect(direct(base({ lines: [L("KAP guarda el papel en el bolsillo.")] })).cues.filter((c) => c.type === "pose").map((c) => (c as { value: string }).value)).toEqual(["reach"]);
    expect(direct(base({ lines: [L("KAP mira por la ventana, sin moverse.")] })).cues.filter((c) => c.type === "pose" || c.type === "move").length).toBe(0);   // no inventa acciones
  });
});

describe("acting: la narración dirige el cuerpo, la mirada, la expresión, la cámara y los objetos", () => {
  const L = (text: string, start = 0.5) => ({ text, start, end: start + 1.6 }), cues = (s: ReturnType<typeof direct>, t: string) => s.cues.filter((c) => c.type === t) as unknown as Record<string, unknown>[];
  const at = (s: ReturnType<typeof direct>, id: string, t: number) => evaluate(s, t).actors.find((a) => a.id === id)!;
  it("un sonido: todos reaccionan (sobresalto + expresión, escalonados) y la cámara se acerca; un «camara:» explícito la apaga", () => {
    const s = direct(base({ lines: [L("Se oye un portazo al fondo del pasillo.")] }));
    expect(cues(s, "pose").map((c) => `${c.actor}:${c.value}`).sort()).toEqual(["kap:recoil", "mira:recoil"]); expect(cues(s, "expression").every((c) => c.value === "scared")).toBe(true);
    expect(cues(s, "camera").some((c) => c.focus === "kap" && (c.zoom as number) > 1.2)).toBe(true);
    expect(cues(direct(base({ lines: [L("Se oye un portazo al fondo del pasillo.")], directions: ["camara: zoom 1.1"] })), "camera").every((c) => !c.focus)).toBe(true);
  });
  it("correr: primero se gira, se agacha un instante (anticipación), arranca corriendo, llega, frena y se asienta", () => {
    const s = direct(base({ lines: [L("KAP corre hacia la puerta.")] })), run = cues(s, "move")[0], t0 = cues(s, "face")[0].t as number;
    expect(run.run).toBe(true); expect(cues(s, "pose").map((c) => c.value)).toEqual(["crouch", "idle"]); expect((run.t as number)).toBeGreaterThan(t0 + 0.2);   // la anticipación va antes de arrancar
    expect(cues(s, "pose")[1].t as number).toBeCloseTo((run.t as number) + (run.dur as number), 5);   // al llegar vuelve a reposo
    const k = at(s, "kap", (run.t as number) + (run.dur as number) / 2), start = at(s, "kap", (run.t as number) + 0.05), end = at(s, "kap", (run.t as number) + (run.dur as number) - 0.05);
    expect(k.speed).toBeGreaterThan(0.9); expect(start.speed).toBeLessThan(0.3); expect(end.speed).toBeLessThan(0.3);   // arranca despacio, va rápido en medio y frena
  });
  it("«se acerca a…» camina de verdad hacia el otro, orientado, y al llegar lo mira; «mira hacia la ventana» gira la cabeza hacia ese lado", () => {
    const s = direct(base({ lines: [L("KAP se acerca despacio a Mira.")] })), mv = cues(s, "move")[0]; expect(mv.run).toBe(false);
    const f = cues(s, "face"); expect(f[0].dir).toBe("right"); expect(f.at(-1)!.dir).toBe("right");
    expect(cues(direct(base({ lines: [L("Mira mira hacia la ventana.")] })), "face").at(-1)!.dir).toBe("right");
  });
  it("se queda quieto: detiene el movimiento; expresiones de acting (asustado, confuso, vergüenza…) cambian la cara", () => {
    const s = direct(base({ lines: [L("KAP corre hacia la puerta."), L("KAP se detiene de golpe.", 2.8)] })), stop = cues(s, "move").at(-1)!; expect((stop.dur as number)).toBeLessThan(0.5);
    for (const [txt, v] of [["KAP mira asustado la puerta.", "scared"], ["Mira, confusa, no entiende nada.", "confused"], ["KAP siente vergüenza.", "embarrassed"], ["Mira sonríe aliviada.", "relieved"], ["KAP, aburrido, bosteza.", "bored"]] as const)
      expect(cues(direct(base({ lines: [L(txt)] })), "expression").some((c) => c.value === v), txt).toBe(true);
  });
  it("objetos: lo que se coge va en la mano (mira → alcanza → coge), lo que se deja queda en el suelo; nada se inventa si la narración no lo nombra", () => {
    const s = direct(base({ lines: [L("KAP coge el teléfono con las dos manos."), L("KAP deja el teléfono sobre la cama.", 2.5)] })), ph = s.props.filter((p) => p.kind === "phone");
    expect(ph).toHaveLength(2); expect(ph[0].holder).toBe("kap"); expect(ph[1].holder).toBeUndefined();   // uno en la mano, otro en el suelo
    expect(cues(s, "pose").map((c) => c.value)).toContain("reach"); const shows = cues(s, "prop"); expect(shows.map((c) => `${c.id}:${c.action}`)).toEqual([`${ph[0].id}:show`, `${ph[0].id}:hide`, `${ph[1].id}:show`]);
    const sFloor = direct(base({ lines: [L("Suena el teléfono sobre la mesa.")] })); expect(sFloor.props.map((p) => p.kind)).toEqual(["phone"]); expect(sFloor.props[0].holder).toBeUndefined();
    expect(direct(base({ lines: [L("KAP mira por la ventana, sin moverse.")] })).props).toEqual([]);
  });
  it("no inventa movimiento: sin verbo de acción en la narración no hay poses, desplazamientos ni cámara nueva", () => {
    const s = direct(base({ lines: [L("KAP está en su habitación, sentado en la cama.")] })); expect(cues(s, "pose")).toEqual([]); expect(cues(s, "move")).toEqual([]);
  });
});

describe("espacios: el decorado corresponde al lugar narrativo (nada de «Salón = prado»)", () => {
  it("salón, pasillo, cocina, dormitorio y comedor son habitación con su mobiliario; el patio y la calle siguen siendo exterior", () => {
    const r = (loc: string, mood = "") => { const x = resolveSet(loc, [], mood); return `${x.preset}${x.variant ? `:${x.variant}` : ""}`; };
    expect(r("Salón", "Mañana, interior")).toBe("room:living"); expect(r("Salón")).toBe("room:living"); expect(r("Comedor")).toBe("room:living"); expect(r("Pasillo")).toBe("room:hallway"); expect(r("Cocina")).toBe("room:kitchen");
    expect(r("Habitación de KAP")).toBe("room:bedroom"); expect(r("Dormitorio")).toBe("room:bedroom"); expect(r("Casa de KAP")).toBe("room"); expect(r("Patio de la casa")).toBe("patio"); expect(r("Calle")).toBe("street"); expect(r("Lugar raro")).toBe("abstract");
  });
});
