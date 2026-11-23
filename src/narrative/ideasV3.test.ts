import { describe, expect, it } from "vitest";
import { ideaV3, v } from "./ideasV3.fixture";
import { blocks, criticBlocks, duplicateV3, hookIssuesV3, hookSetIssuesV3, persona, pickHooks, scoreV3, type Critic, type HookV3, type IdeaV3, type Vineta } from "./ideasV3";

const critic = (o: Partial<Critic> = {}): Critic => ({ enlaces: (["situacion-motivo", "motivo-accion", "accion-consecuencia", "consecuencia-decision", "decision-nueva-accion", "nueva-accion-resultado", "resultado-mentalidad"] as const).map((enlace) => ({ enlace, coherente: true, motivo: "se sigue claramente del anterior" })), accionCausadaPorMotivo: true, identificacion: 3, fuerzaSituacion: 3, potencialShort: 3, ...o });
const ids = (i: IdeaV3) => blocks(i).map((b) => b.id);

describe("ideas V3: bloqueos (cada fallo descarta)", () => {
  it("una historia con cadena completa, acciones visibles, mentalidad concreta y viñetas-acontecimiento no tiene bloqueos", () => { expect(blocks(ideaV3())).toEqual([]); });
  it("bloquea acciones pasivas o que no empiezan por KAP + verbo de hacer, y una nueva acción igual que la primera", () => {
    expect(ids(ideaV3({ accionKap: "KAP se queda callado y mira al suelo sin decir nada." }))).toContain("accion");
    expect(ids(ideaV3({ nuevaAccion: "KAP entrega sus apuntes al compañero con una sonrisa otra vez." }))).toContain("nueva-accion");
  });
  it("bloquea mentalidades que empiezan por «A veces», «Hay que»… o no dicen qué entendió KAP", () => {
    for (const m of ["A veces decir que sí cuesta más de lo que parece y hay que aprender.", "Hay que aprender a pedir lo que es tuyo para no perder una noche.", "La clave es no decir que sí a todo para mantener tu tiempo libre."]) expect(ids(ideaV3({ mentalidad: m }))).toContain("mentalidad");
    expect(ids(ideaV3({ mentalidad: "Debes creer en ti y salir de tu zona de confort cada día." }))).toEqual(expect.arrayContaining(["mentalidad", "contenido"]));
  });
  it("bloquea viñetas que no siguen la cadena en orden, demasiadas de pura reacción, repetidas o todas con KAP", () => {
    const vs = ideaV3().vinetas, swapped = [...vs]; [swapped[2], swapped[5]] = [swapped[5], swapped[2]];
    expect(ids(ideaV3({ vinetas: swapped }))).toContain("vinetas");
    const react = vs.map((x, n) => (n > 3 ? v(x.funcion, "KAP mira el móvil y suspira mirando hacia el suelo otra vez", "KAP") : x));
    expect(blocks(ideaV3({ vinetas: react })).map((b) => b.msg).join()).toMatch(/solo reacción|repiten/);
    expect(ids(ideaV3({ vinetas: vs.slice(0, 5) }))).toContain("vinetas");
    expect(blocks(ideaV3({ vinetas: vs.map((x) => ({ ...x, sujeto: "KAP" })) })).map((b) => b.msg).join()).toMatch(/sin KAP en pantalla/);
  });
  it("bloquea cadenas incompletas (campos vacíos)", () => { expect(ids(ideaV3({ motivo: "Quiere caer bien" }))).toContain("cadena"); });
  it("el crítico bloquea enlaces rotos y acciones no causadas por el motivo", () => {
    expect(criticBlocks(critic())).toEqual([]);
    const c = critic({ accionCausadaPorMotivo: false }); c.enlaces[1] = { enlace: "motivo-accion", coherente: false, motivo: "destrozar el jardín no se sigue de comparar relojes" };
    expect(criticBlocks(c).map((b) => b.id)).toEqual(["coherencia", "causalidad"]); expect(criticBlocks({ ...critic(), enlaces: critic().enlaces.slice(0, 5) })[0].msg).toMatch(/no evaluó/);
  });
});

describe("ideas V3: duplicados y puntuación", () => {
  it("detecta duplicados por título, acción o situación", () => { expect(duplicateV3(ideaV3(), ideaV3({ titulo: "Los apuntes que nadie devolvió" }))).toBeDefined(); expect(duplicateV3(ideaV3(), ideaV3({ titulo: "Otra cosa", situacion: "Un corredor en el parque sube una cuesta con un reloj deportivo marcando el ritmo.", accionKap: "KAP corre colina arriba dejando atrás el parque.", objeto: "reloj deportivo", motivo: "Quiere llegar antes que todos", consecuencia: "Se agota a mitad de camino", mentalidad: "KAP entiende que el ritmo propio dura más que el ajeno" }))).toBeUndefined(); });
  it("puntúa con discriminación: una historia normal queda en el rango medio y una con viñetas de reacción baja claramente", () => {
    const normal = scoreV3(ideaV3(), [], critic()), peor = scoreV3(ideaV3({ vinetas: ideaV3().vinetas.map((x, n) => (n % 2 ? v(x.funcion, "KAP mira hacia el suelo con calma pensando en otra cosa distinta " + n, "KAP") : x)) }), [], critic({ identificacion: 2, fuerzaSituacion: 2, potencialShort: 2 }));
    expect(normal.score).toBeGreaterThan(4); expect(normal.score).toBeLessThan(8); expect(peor.score).toBeLessThan(normal.score - 1); expect(normal.subs).toHaveProperty("variedadAcontecimientos");
  });
});

describe("hooks V3", () => {
  const i = ideaV3(), h = (type: HookV3["type"], text: string): HookV3 => ({ type, text });
  const good = (): HookV3[] => [h("situacion", "KAP tenía los apuntes justo para la noche. Se los dio a un compañero sin pestañear."), h("conflicto", "Los apuntes eran suyos y el compañero no los devolvía. KAP sonreía igual."), h("curiosidad", "Hasta las tres de la madrugada KAP no entendió qué le había costado aquella sonrisa."), h("contradiccion", "KAP quería caer bien y se quedó estudiando con una libreta en blanco."), h("mini-historia", "Pidieron sus apuntes en la biblioteca. KAP dijo que sí. La noche empezó a ir mal.")];
  it("detecta la persona gramatical", () => { expect(persona("KAP entregó sus apuntes sin dudar")).toBe("tercera"); expect(persona("Entregué mis apuntes sin dudar")).toBe("primera"); expect(persona("Sabes que no quieres, pero dices que sí")).toBe("segunda"); });
  it("un conjunto de 5 tipos, en tercera persona, sin fórmulas y anclado en la situación es válido", () => { expect(hookSetIssuesV3(good(), i)).toEqual([]); });
  it("rechaza mezclar personas, empezar con «¿Qué pasó cuando…» / «Sabía que…» / «A veces…» y los hooks sin anclaje", () => {
    const g = good(); g[1] = h("conflicto", "Sé que mis apuntes eran míos, pero no los pedí de vuelta."); expect(hookSetIssuesV3(g, i).join()).toMatch(/mezcla personas/);
    for (const t of ["¿Qué pasó cuando los apuntes quedaron en otra mochila distinta?", "Sabía que necesitaba los apuntes pero los entregó igualmente.", "A veces los apuntes valen más que una sonrisa en la biblioteca."]) expect(hookIssuesV3(h("curiosidad", t), i).join()).toMatch(/fórmula prohibida/);
    expect(hookIssuesV3(h("curiosidad", "Hay personas que nunca saben cuándo decir lo que quieren."), i).join()).toMatch(/no nace de la situación/);
  });
  it("elige 3 finales de tipos distintos y que no empiezan igual", () => { const f = pickHooks(good(), i, 3); expect(f).toHaveLength(3); expect(new Set(f.map((x) => x.type)).size).toBe(3); });
});
