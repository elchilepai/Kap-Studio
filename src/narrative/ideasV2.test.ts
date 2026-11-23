import { describe, expect, it } from "vitest";
import { duplicateWhy, evaluateIdeas, hookIssuesV2, hookSetIssuesV2, ideaGates, judgeIdea, rankHooks, selectIdeasV2, type HookV2, type IdeaV2 } from "./ideasV2";

export const ideaV2 = (o: Partial<IdeaV2> = {}): IdeaV2 => ({
  category: "limites-decir-no", titulo: "Los auriculares que nunca volvieron", situacion: "Un compañero le pide los auriculares nuevos a KAP un viernes y KAP acepta sonriendo aunque los necesita para entrenar.", problema: "Acepta prestar algo importante para no quedar mal y luego no sabe pedirlo de vuelta.",
  accionKap: "KAP entrega sus auriculares al compañero y sale de clase sin ellos.", objeto: "auriculares", consecuencia: "El sábado KAP entrena sin música y los auriculares siguen en la mochila del compañero.", momentoDecision: "El lunes KAP tiene el mensaje escrito para pedirlos de vuelta y debe decidir si lo envía.",
  hacerDiferente: "KAP envía el mensaje corto, pide los auriculares y los recoge ese mismo día.", mentalidad: "Decir que no a tiempo cuesta un minuto; no decirlo cuesta la semana entera.",
  imagenes: [{ plano: "general", que: "KAP y un compañero en el pasillo; KAP entrega los auriculares" }, { plano: "detalle", que: "Los auriculares cambian de mano sobre un pupitre" }, { plano: "primer-plano", que: "KAP sonríe forzado mientras abre la mano vacía" }, { plano: "entorno", que: "La mochila del compañero cerrada con el cable asomando" }, { plano: "cenital", que: "KAP en el gimnasio levanta pesas sin música" }, { plano: "metafora", que: "Una cuerda larga une a KAP con la mochila lejana" }, { plano: "pov", que: "El móvil muestra un mensaje escrito y sin enviar" }, { plano: "decision", que: "KAP pulsa enviar con el dedo grande sobre la pantalla" }, { plano: "medio", que: "El compañero devuelve los auriculares y KAP los guarda" }],
  ...o,
});
const hook = (type: HookV2["type"], text: string): HookV2 => ({ type, text });

describe("ideas V2: puertas de calidad", () => {
  it("una idea nacida de una acción, con objeto, consecuencia visible y 9 imágenes distintas pasa todas las puertas", () => { expect(ideaGates(ideaV2())).toEqual([]); });
  it("descarta (crítico) el patrón pasivo: callarse, mirar al suelo, voz baja", () => {
    const g = ideaGates(ideaV2({ accionKap: "KAP se queda callado y mira al suelo sin decir nada.", hacerDiferente: "KAP dice con voz baja que no quiere hacerlo ahora." })).map((x) => x.id); expect(g).toContain("patron-pasivo"); expect(g).toContain("accion-visible");
  });
  it("descarta frases de coach y aforismos como mentalidad", () => {
    expect(ideaGates(ideaV2({ mentalidad: "Cree en ti y sal de tu zona de confort siempre." })).map((x) => x.id)).toContain("frase-coach");
    expect(ideaGates(ideaV2({ mentalidad: "A veces el tiempo vale más que la amabilidad forzada." })).map((x) => x.id)).toContain("mentalidad");
  });
  it("exige objeto visible en varias imágenes, consecuencia visible (no un sentimiento) y 8-14 imágenes distintas", () => {
    const ims = ideaV2().imagenes;
    expect(ideaGates(ideaV2({ objeto: "silla vacía" })).map((x) => x.id)).toContain("objeto");
    expect(ideaGates(ideaV2({ consecuencia: "Se siente mal y piensa que ha cometido un error." })).map((x) => x.id)).toContain("consecuencia");
    const g = ideaGates(ideaV2({ imagenes: ims.slice(0, 6) })); expect(g.find((x) => x.id === "imagenes")?.critical).toBe(true);
    expect(ideaGates(ideaV2({ imagenes: ims.map((m) => ({ ...m, plano: "medio" as const })) })).map((x) => x.id)).toContain("imagenes");
  });
  it("juzga: descarta con un fallo crítico, con ≥2 no críticos o si duplica una anterior; acepta con un solo fallo menor", () => {
    expect(judgeIdea(ideaV2(), []).rejected).toBe(false);
    expect(judgeIdea(ideaV2({ accionKap: "KAP piensa mucho en qué hacer." }), []).rejected).toBe(true);
    expect(judgeIdea(ideaV2({ mentalidad: "A veces la vida enseña cosas distintas." }), []).rejected).toBe(false);
    expect(judgeIdea(ideaV2({ mentalidad: "A veces la vida enseña cosas distintas.", objeto: "silla vacía" }), []).rejected).toBe(true);
    const d = judgeIdea(ideaV2(), [ideaV2()]); expect(d.rejected).toBe(true); expect(d.reasons.join()).toMatch(/duplica una idea anterior/);
  });
});

describe("ideas V2: duplicados entre lotes, puntuación propia y selección", () => {
  const other = (o: Partial<IdeaV2>) => ideaV2({ category: "disciplina", titulo: "El escritorio perfecto antes de empezar", situacion: "KAP tiene el informe abierto y se pone a ordenar los cables, el escritorio y los cuadernos antes de escribir.", problema: "Ordena todo menos lo único importante que tiene pendiente.", accionKap: "KAP ordena los lápices por colores mientras el informe sigue en blanco.", objeto: "informe en blanco", consecuencia: "A medianoche el escritorio brilla y el informe sigue vacío con el reloj marcando las doce.", momentoDecision: "A las doce KAP aparta los lápices y debe decidir si escribe una sola línea.", hacerDiferente: "KAP escribe la primera frase del informe antes de tocar nada más.", mentalidad: "Ordenar es una forma elegante de no empezar lo difícil.", imagenes: [{ plano: "general", que: "KAP ordena su escritorio con el informe en blanco al fondo" }, { plano: "detalle", que: "Lápices alineados por colores junto al informe en blanco" }, { plano: "cenital", que: "Escritorio impecable visto desde arriba con el informe en blanco" }, { plano: "entorno", que: "Reloj de pared marcando las doce y el informe en blanco" }, { plano: "primer-plano", que: "KAP mira el informe en blanco con un lápiz en la mano" }, { plano: "metafora", que: "Una montaña de lápices tapa el informe en blanco" }, { plano: "pov", que: "KAP ve la hoja en blanco y la primera frase escrita aparece" }, { plano: "silueta", que: "KAP de espaldas teclea la primera línea del informe" }], ...o });
  it("detecta duplicados con otras palabras: mismo título, misma acción, misma situación", () => {
    expect(duplicateWhy(ideaV2(), ideaV2({ titulo: "Los auriculares que nunca volvieron" }))).toBeDefined();
    expect(duplicateWhy(ideaV2(), other({}))).toBeUndefined();
    expect(duplicateWhy(ideaV2(), ideaV2({ titulo: "Prestar sin saber pedir", accionKap: "KAP entrega los auriculares al compañero y sale de clase sin ellos puestos.", situacion: "Otra cosa completamente distinta con teclado y monitor." }))).toBe("misma acción");
  });
  it("marca como duplicada la peor de cada pareja aunque estén en lotes distintos, y no se elige", () => {
    const ev = evaluateIdeas([ideaV2(), other({}), ideaV2({ category: "habitos", imagenes: ideaV2().imagenes.slice(0, 8) })]);
    expect(ev[2].duplicateOf).toBeDefined(); expect(ev[2].rejected).toBe(true); expect(selectIdeasV2(ev)).toEqual(expect.arrayContaining([ev[0].id, ev[1].id])); expect(selectIdeasV2(ev)).not.toContain(ev[2].id);
  });
  it("puntúa por criterios del código (no por el modelo) y no rellena con mediocres: devuelve menos de k si no hay más", () => {
    const ev = evaluateIdeas([ideaV2(), other({}), ideaV2({ category: "caracter", titulo: "Algo sin acción", accionKap: "KAP piensa en lo que pasó.", titulo2: "x" } as Partial<IdeaV2>)]);
    expect(ev[0].score).toBeGreaterThan(6); expect(ev[0].subs).toHaveProperty("fuerzaVisual"); expect(ev[2].rejected).toBe(true); expect(selectIdeasV2(ev, 10)).toHaveLength(2); expect(selectIdeasV2(ev, 1)).toHaveLength(1);
  });
});

describe("hooks V2", () => {
  const idea = ideaV2(), good = (): HookV2[] => [hook("situacion", "Prestó los auriculares un viernes y el sábado entrenó sin música."), hook("conflicto", "KAP sabía que necesitaba los auriculares; lo difícil era decir que no."), hook("curiosidad", "¿Qué hizo KAP el lunes con el mensaje de los auriculares sin enviar?"), hook("contradiccion", "Quería caer bien y terminó entrenando sin auriculares."), hook("mini-historia", "KAP entregó sus auriculares nuevos sin pestañear. El compañero nunca los devolvió.")];
  it("un conjunto con un hook de cada tipo, anclado en la situación, es válido", () => { expect(hookSetIssuesV2(good(), idea)).toEqual([]); });
  it("rechaza muletillas, aforismos, hooks que no nacen de la situación y conjuntos sin los 5 tipos", () => {
    expect(hookIssuesV2(hook("curiosidad", "A veces, lo mejor es decir las cosas con calma."), idea).join()).toMatch(/muletilla/);
    expect(hookIssuesV2(hook("curiosidad", "El «mañana» no es un plan, es una excusa disfrazada de esperanza."), idea).join()).toMatch(/aforismo/);
    expect(hookIssuesV2(hook("situacion", "Hay personas que nunca saben decir lo que quieren."), idea).join()).toMatch(/no nace de la situación/);
    expect(hookSetIssuesV2(good().map((h) => ({ ...h, type: "situacion" as const })), idea).join()).toMatch(/faltan los tipos/);
  });
  it("ordena primero los hooks con objeto concreto y hueco de curiosidad", () => { const r = rankHooks([hook("curiosidad", "Hay gente que nunca sabe qué hacer con su vida."), ...good()], idea); expect(r[0].hook.text).not.toMatch(/gente/); expect(r.at(-1)!.hook.text).toMatch(/gente/); });
});
