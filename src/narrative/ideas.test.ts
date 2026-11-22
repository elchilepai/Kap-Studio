import { describe, expect, it } from "vitest";
import { CATEGORIES, CRITERIA, HOOK_KINDS, hookIssues, hookSetIssues, ideaIssues, scoreIdeas, selectIdeas, similarity, type Hook, type Idea } from "./ideas";

const sc = (n: number) => Object.fromEntries(CRITERIA.map((c) => [c, n])) as Idea["scores"];
export const idea = (o: Partial<Idea> = {}): Idea => ({ category: "autoestima", titulo: "Esperar una respuesta ya no es interés", problema: "Esperas una respuesta que decide cómo te sientes todo el día.", situacion: "Escribes un mensaje, lo borras tres veces y miras el móvil cada dos minutos esperando que conteste.", kapVive: "KAP deja el móvil boca abajo y a los cinco minutos lo vuelve a coger a comprobar si hay respuesta.", errorInicial: "Comprobar el móvil sin parar y analizar cada palabra.", hacerDiferente: "Dejar el móvil en otra habitación y continuar con su entrenamiento.", aprendizaje: "Cuando la espera te controla, ya no es interés: es ansiedad por validación.", visual: "Un círculo de notificaciones que encierra a KAP y se deshace cuando deja el móvil y sale caminando.", publico: "Hombres jóvenes que esperan respuestas", scores: sc(7), ...o });
const hook = (type: Hook["type"], text: string): Hook => ({ type, text });
const goodHooks = (): Hook[] => [hook("pregunta-incomoda", "¿Cuántas veces cambias lo que dices para gustarle a alguien?"), hook("situacion-reconocible", "Llevas veinte minutos mirando si te ha respondido."), hook("contradiccion", "Quieres gustar, pero cada vez que finges, gustas menos."), hook("afirmacion-inesperada", "Si compruebas el móvil cada minuto, no esperas una respuesta."), hook("mini-historia", "KAP escribió el mismo mensaje cinco veces y no envió ninguno.")];

describe("ideas: categorías, criterios y calidad", () => {
  it("cubre las categorías pedidas (incluye respeto propio, responsabilidad, propósito e independencia emocional) y 6 criterios", () => {
    for (const c of ["mentalidad", "disciplina", "autoestima", "confianza", "relaciones-sanas", "limites", "rechazo", "comunicacion", "habitos", "comparacion", "comportamiento-humano", "dinero", "desarrollo-personal", "respeto-propio", "responsabilidad", "proposito", "independencia-emocional"]) expect(CATEGORIES).toContain(c); expect([...CRITERIA]).toEqual(["originalidad", "identificacion", "claridad", "potencialVisual", "utilidad", "curiosidad"]);
  });
  it("una idea concreta, con KAP viviéndola y algo que se puede ver, no tiene problemas", () => { expect(ideaIssues(idea())).toEqual({ issues: [], flags: [] }); });
  it("detecta campos vacíos o vagos, KAP ausente, nada visible, coach genérico, gurú, manipulación y clickbait", () => {
    expect(ideaIssues(idea({ problema: "Autoestima baja" })).issues.join()).toMatch(/problema: demasiado corto/); expect(ideaIssues(idea({ kapVive: "Una persona se siente mal por lo que pasa en su día a día" })).issues.join()).toMatch(/kapVive no cuenta/);
    expect(ideaIssues(idea({ situacion: "La persona piensa mucho sobre su autoestima y su valor personal.", visual: "Una imagen que representa el concepto de autoestima en abstracto." })).issues.join()).toMatch(/algo que se pueda ver/);
    expect(ideaIssues(idea({ aprendizaje: "Cree en ti y tú puedes con todo lo que te propongas." })).flags).toContain("coach-generico"); expect(ideaIssues(idea({ hacerDiferente: "Usar una técnica para conseguir a una chica sin esfuerzo." })).flags).toContain("manipulacion");
    expect(ideaIssues(idea({ titulo: "El secreto que cambiará tu vida para siempre" })).flags).toContain("clickbait"); expect(ideaIssues(idea({ aprendizaje: "Lo importante es la motivación y la mejor versión de ti." })).flags).toContain("aprendizaje-generico");
  });
  it("puntúa: media del modelo menos penalizaciones del código (genérico, problemas, repetida)", () => {
    const ideas = [idea({ scores: sc(8) }), idea({ category: "disciplina", titulo: "Otra cosa totalmente distinta", problema: "Entrenas tres días y lo dejas cuando se acaba la novedad.", situacion: "Compras zapatillas nuevas, vas al gimnasio tres días y al cuarto te quedas en el sofá con el móvil.", kapVive: "KAP se promete ir cada día y cuando suena la alarma la apaga y sigue durmiendo.", errorInicial: "Depender de la motivación del momento.", hacerDiferente: "Dejar la ropa preparada y entrenar solo diez minutos.", aprendizaje: "La constancia nace de reducir el esfuerzo de empezar, no de esperar ganas.", visual: "Dos relojes de arena: uno que se vacía con la alarma apagada y otro con la ropa de gimnasio preparada.", scores: sc(8) }), idea({ scores: sc(9), aprendizaje: "Cree en ti, tú puedes con todo." })], r = scoreIdeas(ideas);
    expect(r.map((x) => x.id)).toEqual(["idea-01", "idea-02", "idea-03"]); expect(r[0]).toMatchObject({ modelScore: 8, score: 8 }); expect(r[1].score).toBe(8); expect(r[2].repeatedWith).toBe("idea-01"); expect(r[2].flags).toContain("coach-generico"); expect(r[2].score).toBe(4);   // 9 − 3 (coach) − 2 (repetida)
  });
  it("detecta ideas repetidas con otras palabras", () => { expect(similarity("Esperar una respuesta del móvil y analizar cada palabra", "Analizas cada palabra mientras esperas respuesta en el móvil")).toBeGreaterThan(0.4); expect(similarity("Entrenar por la mañana", "Dinero y ahorro mensual")).toBeLessThan(0.2); });
  it("selecciona SIN ideas mediocres: mínimo de puntuación, sin avisos, sin repetidas y una por categoría", () => {
    const base = (id: string, category: Idea["category"], score: number, extra: object = {}) => ({ ...idea({ category }), id, modelScore: score, issues: [], flags: [], score, ...extra }) as ReturnType<typeof scoreIdeas>[number];
    const scored = [base("a", "autoestima", 8.5), base("b", "autoestima", 8), base("c", "disciplina", 6.2), base("d", "habitos", 7.5, { flags: ["coach-generico"] }), base("e", "rechazo", 7.2, { repeatedWith: "a" }), base("f", "dinero", 7), base("g", "limites", 6.5)];
    expect(selectIdeas(scored)).toEqual(["a", "f", "g"]); expect(selectIdeas(scored, { k: 2 })).toEqual(["a", "f"]); expect(selectIdeas(scored, { min: 9 })).toEqual([]);   // mejor no elegir nada que elegir una mediocre
  });
});

describe("hooks", () => {
  it("6 tipos pedidos y un conjunto de 5 distintos y bien formados no tiene problemas", () => { expect([...HOOK_KINDS]).toEqual(["pregunta-incomoda", "situacion-reconocible", "contradiccion", "afirmacion-inesperada", "mini-historia", "curiosidad"]); expect(hookSetIssues(goodHooks())).toEqual([]); });
  it("rechaza muletillas de presentador, clickbait, coach y longitud inadecuada", () => {
    expect(hookIssues(hook("curiosidad", "Hoy vamos a hablar de cómo dejar de buscar aprobación"))).toContain("empieza con una muletilla de presentador"); expect(hookIssues(hook("curiosidad", "Hola chicos, ¿sabéis por qué borráis los mensajes?")).join()).toMatch(/muletilla/); expect(hookIssues(hook("curiosidad", "En este vídeo aprenderás a gustar")).join()).toMatch(/muletilla/);
    expect(hookIssues(hook("curiosidad", "No vas a creer lo que le pasa a tu cerebro con el móvil")).join()).toMatch(/clickbait/); expect(hookIssues(hook("curiosidad", "El secreto que nadie te cuenta sobre las mujeres")).join()).toMatch(/clickbait|contenido/);
    expect(hookIssues(hook("afirmacion-inesperada", "Tú puedes con todo si crees en ti")).join()).toMatch(/coach-generico/); expect(hookIssues(hook("curiosidad", "Eh")).join()).toMatch(/palabras/);
  });
  it("el conjunto debe ser de 5, de tipos variados y sin repetirse", () => {
    expect(hookSetIssues(goodHooks().slice(0, 4)).join()).toMatch(/hay 4 hooks/); expect(hookSetIssues(goodHooks().map((h) => ({ ...h, type: "curiosidad" as const }))).join()).toMatch(/pocos tipos distintos/);
    const dup = goodHooks(); dup[1] = hook("situacion-reconocible", "¿Cuántas veces cambias lo que dices para gustarle a alguien hoy?"); expect(hookSetIssues(dup).join()).toMatch(/el hook 2 repite al 1/);
  });
});
