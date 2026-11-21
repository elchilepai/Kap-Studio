import { describe, expect, it } from "vitest";
import { Change, KAP_FACTS, KAP_MILESTONES, KAP_RULES, KAP_STAGES, applyChange, applyChanges, arcProgress, beforeNext, buildContextPack, continuityChecklist, emptyCanon, evolutionOf, extractChanges, kapCanonChanges, lifeSoFar,
  parseMemoryDirectives, parseScenes, validateContinuity, whereEnded, EPISODE_TARGET_SEC, type CanonState, type EpisodeInput, type EpisodeMemory, type SceneInput } from "./index.ts";

const KAP = (): CanonState => applyChanges(emptyCanon(), kapCanonChanges(), 0);
const sc = (title: string, location: string, lines: [string | undefined, string][], memory: string[] = [], o: Partial<SceneInput> = {}): SceneInput => ({ title, location, lines: lines.map(([speaker, text]) => ({ ...(speaker ? { speaker } : {}), text })), characterNames: [...new Set(lines.map(([s]) => s).filter(Boolean) as string[])], directions: [], memory, ...o });
const ep = (scenes: SceneInput[], o: Partial<EpisodeInput> = {}): EpisodeInput => ({ productionId: "p", season: 1, number: 1, title: "Ep", scenes, characters: [], ...o });
const ACTS = ["acto: inicio | KAP en casa", "acto: conflicto | los padres no están", "acto: desarrollo | cuida a su hermano", "acto: emocional | llora a solas", "acto: resolucion | consigue cenar", "gancho: alguien llama a la puerta"];
const full = (extra: string[] = [], o: Partial<EpisodeInput> = {}) => ep([sc("Casa", "Casa", [["KAP", "Hola"]], [...ACTS, ...extra])], { durationSec: 300, ...o });
const check = (e: EpisodeInput, canon: CanonState, extra: Partial<Parameters<typeof validateContinuity>[0]> = {}) => validateContinuity({ episode: e, canon, perScene: parseScenes(e), changes: extractChanges(e, canon).changes, ...extra });
const ids = (f: ReturnType<typeof check>, sev?: string) => f.filter((x) => !sev || x.severity === sev).map((x) => `${x.severity}:${x.rule}`);

describe("canon inicial de KAP", () => {
  it("todos los cambios cumplen el esquema (el mismo que validará la salida de una IA)", () => { for (const c of kapCanonChanges()) expect(Change.safeParse(c).success, JSON.stringify(c)).toBe(true); });
  it("registra la premisa tal cual la dijo el autor y NO inventa nada (sin nombres, sin edad, sin personalidad)", () => {
    const c = KAP();
    expect(c.series?.protagonist).toBe("KAP"); expect(Object.values(c.characters).map((x) => x.name).sort()).toEqual(["Hermano de KAP", "KAP", "Padres de KAP"]);
    expect(c.facts.map((f) => f.text)).toEqual(KAP_FACTS); expect(c.facts.some((f) => /millonario gracias a su música/.test(f.text))).toBe(true); expect(c.facts.some((f) => /problemas con las drogas/.test(f.text))).toBe(true);
    expect(c.rules.map((r) => r.text)).toEqual(KAP_RULES); expect(c.rules.map((r) => r.text).join()).toMatch(/serializada/); expect(c.rules.map((r) => r.text).join()).toMatch(/no está fijado/);
    const kap = c.characters["kap"]; expect(kap.stage).toBe("nino"); expect(kap.age).toBeUndefined(); expect(kap.profile?.["personalidad"]).toBeUndefined();   // no se inventa
    expect(Object.keys(kap.profile ?? {})).toEqual(expect.arrayContaining(["situacion-economica", "relacion-con-sus-padres", "relacion-con-su-hermano", "situacion-escolar", "suenos", "habilidades-iniciales"]));
    expect(c.relationships["hermano-de-kap~kap"]).toMatchObject({ relation: "hermanos", trust: 2 });
    expect(Object.values(c.threads).filter((t) => t.status === "open")).toHaveLength(4); expect(c.events).toEqual([]);   // ningún episodio ocurrido todavía
  });
  it("el recorrido del autor está completo, en orden, sin episodios ni número de episodios fijados", () => {
    const c = KAP(), ms = Object.values(c.milestones!).sort((a, b) => a.order - b.order);
    expect(ms.map((m) => m.title)).toEqual(KAP_MILESTONES.map((m) => m.title)); expect(ms).toHaveLength(17); expect(ms.every((m) => m.status === "pending" && m.episodes.length === 0)).toBe(true);
    expect(ms[0].title).toBe("Niño con pocos recursos"); expect(ms.at(-1)!.title).toBe("Llegada a la cima"); expect(KAP_STAGES.map((s) => s.title)).toEqual(["Niño", "Adolescente", "Artista emergente", "Artista consolidado", "En la cima"]);
    expect(KAP_STAGES[0].facets).toEqual(["edad aproximada", "situación económica", "relación con sus padres", "relación con su hermano", "situación escolar", "personalidad", "sueños", "habilidades iniciales"]);
    expect(KAP_STAGES[4].facets).toContain("significado de todo lo que consiguió"); expect(JSON.stringify(kapCanonChanges())).not.toMatch(/episodio \d|cincuenta|50 episodios/i);
    const a = arcProgress(c); expect(a).toMatchObject({ total: 17, achieved: 0, finished: false, stage: { title: "Niño" } }); expect(a.next.map((m) => m.title)).toEqual(KAP_MILESTONES.slice(0, 3).map((m) => m.title));
  });
  it("el sistema sabe qué NO sabe de KAP (edad, personalidad…) en lugar de inventarlo", () => {
    const l = continuityChecklist(KAP()), missing = l.filter((x) => !x.value).map((x) => x.label);
    expect(missing).toEqual(expect.arrayContaining(["Edad aproximada", "Apariencia", "Ropa", "Personalidad"])); expect(l.find((x) => x.label === "Relación con su hermano")?.value).toMatch(/protege|hermano/i);
    expect(l.find((x) => x.label === "Situación de sus padres")?.value).toMatch(/drogas|padres/i); expect(l.find((x) => x.label === "Conflictos abiertos")?.value).toMatch(/Bullying/);
  });
});

describe("directivas de la serie", () => {
  it("evolución, arco y estructura se declaran con directivas y se validan", () => {
    const p = parseMemoryDirectives(["etapa: KAP, adolescente", "edad: KAP, 13", "perfil: KAP, personalidad = reservado pero tenaz", "atributo: KAP, disciplina = 4", "aspecto: KAP, más alto, pelo corto | v2", "hito: se toma la música en serio", "hito-logrado: primeras dificultades musicales | su primer concierto sale mal", "acto: emocional | el abrazo", "gancho: llega una carta"]);
    expect(p.errors).toEqual([]); expect(p.changes.map((c) => c.kind)).toEqual(["character.stage", "character.age", "character.profile", "character.trait", "character.appearance", "milestone.progress", "milestone.progress"]);
    expect(p.changes[3]).toMatchObject({ trait: "disciplina", level: 4 }); expect(p.changes[4]).toMatchObject({ designVersion: 2 }); expect(p.acts).toEqual([{ kind: "emocional", text: "el abrazo" }, { kind: "gancho", text: "llega una carta" }]); expect(p.hook).toBe("llega una carta");
    expect(parseMemoryDirectives(["edad: KAP", "atributo: KAP, x = y", "acto: nada | x", "perfil: sin igual"]).errors).toHaveLength(4);
  });
  it("el progreso de un hito se resuelve por clave o por título", () => {
    let c = applyChange(KAP(), { kind: "milestone.progress", key: "Niño con pocos recursos", status: "achieved" }, 1001); c = applyChange(c, { kind: "milestone.progress", key: "protege-a-su-hermano", status: "in_progress", note: "empieza" }, 1001);
    expect(c.milestones!["nino-con-pocos-recursos"]).toMatchObject({ status: "achieved", achievedIn: 1001, episodes: [1001] }); expect(c.milestones!["protege-a-su-hermano"]).toMatchObject({ status: "in_progress" });
  });
  it("la evolución nace del estado anterior: cada valor recuerda el previo", () => {
    let c = applyChange(KAP(), { kind: "character.profile", name: "KAP", facet: "situación escolar", value: "Se defiende con ayuda de un amigo" }, 1004); c = applyChange(c, { kind: "character.age", name: "KAP", age: 9 }, 1001); c = applyChange(c, { kind: "character.age", name: "KAP", age: 10 }, 1004);
    const e = evolutionOf(c, "KAP")!; expect(e.profile.find((p) => p.facet === "situacion-escolar")).toMatchObject({ value: "Se defiende con ayuda de un amigo", previous: expect.stringMatching(/bullying/), since: 1004 }); expect(e.ageTimeline).toEqual(["9 años (ep. 1)", "10 años (ep. 4)"]);
  });
});

describe("reglas de continuidad de la serie (sin IA)", () => {
  it("un episodio completo y que aporta algo no genera avisos de serie", () => {
    const f = check(full(["conoce: KAP, Marcos"]), KAP()); expect(ids(f).filter((x) => !x.startsWith("info"))).toEqual([]);
  });
  it("estructura: falta de inicio/conflicto/desarrollo/emocional/resolución/gancho → aviso que lista lo que falta", () => {
    const f = check(ep([sc("Casa", "Casa", [["KAP", "Hola"]], ["acto: inicio | x", "evento: algo"])], { durationSec: 300 }), KAP()); const w = f.find((x) => x.rule === "estructura")!;
    expect(w.severity).toBe("warning"); expect(w.text).toMatch(/Conflicto/); expect(w.text).toMatch(/Gancho para el siguiente episodio/); expect(w.text).not.toMatch(/Falta[n]?: Inicio/);
    expect(ids(check(ep([sc("Casa", "Casa", [["KAP", "Hola"]])]), emptyCanon()))).not.toContain("warning:estructura");   // sin serie registrada no se exige
  });
  it("cada episodio debe aportar algo nuevo; el protagonista debe salir; la duración debe rondar los 5 minutos", () => {
    expect(ids(check(full(), KAP()))).toContain("warning:sin-aporte");
    expect(ids(check(ep([sc("Calle", "Calle", [["Marcos", "Hola"]], [...ACTS, "evento: x"])], { durationSec: 300 }), KAP()))).toContain("warning:protagonista");
    for (const [sec, warn] of [[100, true], [239, true], [240, false], [300, false], [360, false], [361, true], [700, true]] as const) expect(ids(check(full(["evento: x"], { durationSec: sec }), KAP()).filter((x) => x.rule === "duracion")).length > 0, `${sec} s`).toBe(warn);
    expect(EPISODE_TARGET_SEC).toBe(300);
  });
  it("etapas: saltarse una es error crítico; retroceder, aviso; dejar una con hitos sin contar, aviso; con flashback no molesta", () => {
    const c = KAP(), st = (to: string, m: string[] = []) => check(full(["evento: x", `etapa: KAP, ${to}`, ...m]), c);
    expect(ids(st("Artista emergente"), "error")).toContain("error:etapa-saltada"); expect(st("Artista emergente").find((f) => f.rule === "etapa-saltada")!.text).toMatch(/«Adolescente»/);
    expect(ids(st("Adolescente"))).toContain("warning:etapa-hitos-pendientes");
    const done = applyChanges(c, KAP_MILESTONES.filter((m) => m.stage === "nino").map((m) => ({ kind: "milestone.progress" as const, key: m.key, status: "achieved" as const })), 1004);
    expect(ids(check(full(["evento: x", "etapa: KAP, Adolescente"]), done)).filter((x) => /etapa/.test(x))).toEqual([]);   // con los hitos de niño contados, pasar a adolescente es correcto
    const teen = applyChange(done, { kind: "character.stage", name: "KAP", stage: "adolescente" }, 1005); expect(ids(check(full(["evento: x", "etapa: KAP, Niño"]), teen))).toContain("warning:etapa-retrocede");
    expect(ids(check(full(["evento: x", "flashback: sí", "etapa: KAP, Niño"]), teen))).not.toContain("warning:etapa-retrocede");
    expect(ids(st("Inventada"))).toContain("warning:etapa");
  });
  it("la cima no puede llegar de golpe: «Llegada a la cima» con hitos pendientes es error crítico; avanzar hacia ella, aviso", () => {
    const c = KAP();
    const f = check(full(["evento: x", "hito-logrado: Llegada a la cima"]), c); const err = f.find((x) => x.rule === "cima-prematura")!;
    expect(err.severity).toBe("error"); expect(err.text).toMatch(/Llegada a la cima prematura/); expect(err.text).toMatch(/Niño con pocos recursos/);
    expect(ids(check(full(["evento: x", "hito-logrado: Éxito"]), c), "error")).toContain("error:cima-prematura");
    expect(ids(check(full(["evento: x", "hito: Éxito"]), c))).toContain("warning:cima-prematura");
    const almost = applyChanges(c, KAP_MILESTONES.slice(0, 15).map((m) => ({ kind: "milestone.progress" as const, key: m.key, status: "achieved" as const })), 1030);
    expect(ids(check(full(["evento: x", "hito-logrado: Éxito"]), almost), "error")).toEqual([]);                     // con todo el recorrido contado, el éxito es legítimo
  });
  it("hitos fuera de orden → aviso; repetir un hito logrado → aviso; hito desconocido → aviso", () => {
    const c = KAP(); expect(ids(check(full(["evento: x", "hito-logrado: Primeros fracasos"]), c))).toContain("warning:hito-saltado");
    const one = applyChange(c, { kind: "milestone.progress", key: "nino-con-pocos-recursos", status: "achieved" }, 1001); expect(check(full(["evento: x", "hito-logrado: Niño con pocos recursos"]), one).some((f) => f.rule === "hito")).toBe(true);
    expect(check(full(["evento: x", "hito: inventado"]), c).some((f) => f.rule === "hito" && /desconocido/.test(f.text))).toBe(true);
  });
  it("sin saltos de años: rejuvenecer es error; +2 años aviso; +4 error crítico; el flashback queda exento", () => {
    const c = applyChange(KAP(), { kind: "character.age", name: "KAP", age: 9 }, 1001), age = (n: number, extra: string[] = []) => check(full(["evento: x", ...extra, `edad: KAP, ${n}`]), c);
    expect(ids(age(8), "error")).toContain("error:edad"); expect(ids(age(10))).not.toContain("warning:salto-de-años"); expect(ids(age(11))).toContain("warning:salto-de-años"); expect(ids(age(13), "error")).toContain("error:salto-de-años");
    expect(age(11).find((f) => f.rule === "salto-de-años")!.text).toMatch(/Quedan hitos de «Niño»/); expect(ids(age(5, ["flashback: sí"]))).not.toContain("error:edad");
  });
  it("evolución física normal por edad: si pasan años y el diseño sigue igual → aviso; con nueva versión de diseño → nada", () => {
    let c = applyChanges(KAP(), [{ kind: "character.age", name: "KAP", age: 8 }, { kind: "character.appearance", name: "KAP", description: "diseño v1", designVersion: 1 }], 1001);
    const old = (n: number, design: number, extra: string[] = []) => check(full(["evento: x", `edad: KAP, ${n}`, ...extra], { characters: [{ name: "KAP", designVersion: design }] }), c);
    expect(ids(old(11, 1))).toContain("warning:evolucion-fisica"); expect(ids(old(10, 1))).not.toContain("warning:evolucion-fisica"); expect(ids(old(11, 2))).not.toContain("warning:evolucion-fisica"); expect(ids(old(11, 1, ["aspecto: KAP, más alto | v2"]))).not.toContain("warning:evolucion-fisica");
    void c; c = emptyCanon();
  });
  it("el gancho del episodio anterior se recuerda al siguiente", () => {
    const f = check(full(["evento: x"], { continuesFrom: 1001 }), KAP(), { previousHook: "alguien llama a la puerta" }); expect(f.find((x) => x.rule === "gancho-previo")).toMatchObject({ severity: "info" }); expect(f.find((x) => x.rule === "gancho-previo")!.text).toMatch(/alguien llama a la puerta/);
  });
});

describe("preguntas a la memoria (solo con episodios aprobados)", () => {
  const mem = (n: number, o: Partial<EpisodeMemory>): EpisodeMemory => ({ id: `e${n}`, productionId: `e${n}`, season: 1, number: n, order: 1000 + n, title: `T${n}`, contentSig: "s", summary: "", logline: `Logline ${n}`, present: ["KAP"], accepted: [], rejected: [], startState: emptyCanon(), endState: emptyCanon(), introducedObjects: [], modifiedObjects: [], relationshipChanges: [], eventsText: [], threadsOpened: [], threadsClosed: [], lastShot: { scene: "Casa", location: "Casa", characters: ["KAP"], text: "KAP: mañana será otro día.", directions: [] }, endingSituation: `Al terminar el ep. ${n}: KAP en Casa.`, committedAt: "x", committedBy: "u", ...o });
  const asProp = (c: Parameters<typeof applyChange>[1], text: string) => ({ id: text, change: c, origin: "manual" as const, decision: "accepted" as const, text });
  const ep1 = mem(1, { logline: "KAP cuida de su hermano en una casa sin recursos.", eventsText: ["KAP prepara la cena a su hermano"], hook: "Alguien llama a la puerta", accepted: [asProp({ kind: "milestone.progress", key: "nino-con-pocos-recursos", status: "achieved" }, "Hito logrado: Niño con pocos recursos")] });
  const world = applyChanges(KAP(), [{ kind: "milestone.progress", key: "nino-con-pocos-recursos", status: "achieved" }, { kind: "event.add", title: "KAP prepara la cena a su hermano" }, { kind: "character.age", name: "KAP", age: 8 }], 1001);
  it("«¿Qué ha vivido KAP hasta este momento?»: canon inicial + episodios aprobados + arco + evolución + conflictos abiertos", () => {
    const a = lifeSoFar({ canon: world, episodes: [ep1] });
    expect(a.question).toBe("¿Qué ha vivido KAP hasta este momento?"); expect(a.basedOn).toEqual(["ep. 1"]); expect(a.text).toMatch(/Punto de partida/); expect(a.text).toMatch(/ep\. 1 «T1»: KAP cuida de su hermano/); expect(a.text).toMatch(/Hito logrado: Niño con pocos recursos/);
    expect(a.text).toMatch(/1\/17 hitos logrados; etapa actual «Niño»/); expect(a.text).toMatch(/Pendiente: Niño que intenta proteger a su hermano/); expect(a.text).toMatch(/Evolución de KAP/); expect(a.text).toMatch(/≈ 8 años/); expect(a.text).toMatch(/Conflictos abiertos[\s\S]*Bullying hacia KAP/);
  });
  it("sin episodios aprobados no se inventa nada: solo el canon inicial", () => {
    const a = lifeSoFar({ canon: KAP(), episodes: [] }); expect(a.basedOn).toEqual([]); expect(a.text).toMatch(/ninguno|Todavía no hay episodios aprobados/i); expect(a.text).toMatch(/Punto de partida/); expect(a.text).not.toMatch(/ep\. 1 «/);
    expect(whereEnded({ canon: KAP(), episodes: [] }).text).toMatch(/punto de partida del canon inicial/);
  });
  it("«¿Dónde terminó KAP?»: estado final, último plano, gancho e hilos abiertos", () => {
    const a = whereEnded({ canon: world, episodes: [ep1] }); expect(a.text).toMatch(/Al terminar el ep\. 1: KAP en Casa/); expect(a.text).toMatch(/mañana será otro día/); expect(a.text).toMatch(/Alguien llama a la puerta/); expect(a.text).toMatch(/Hilos abiertos/); expect(a.basedOn).toEqual(["ep. 1"]);
  });
  it("«¿Qué debería saber el sistema antes del siguiente episodio?»: dónde terminó, gancho, siguiente hito, lo que sabe y lo que NO sabe", () => {
    const a = beforeNext({ canon: world, episodes: [ep1] });
    expect(a.text).toMatch(/Gancho que hay que retomar: «Alguien llama a la puerta»/); expect(a.text).toMatch(/Siguiente hito: Niño que intenta proteger a su hermano/); expect(a.text).toMatch(/Edad aproximada: ≈ 8 años/); expect(a.text).toMatch(/Sin datos todavía[\s\S]*Personalidad/);
    expect(a.text).toMatch(/Reglas de la serie[\s\S]*no llega a la cima|la cima/); expect(a.text).toMatch(/Un episodio = una etapa concreta/);
  });
});

describe("contexto de la serie para el modelo", () => {
  const req = { text: "x", number: 2, season: 1, continuesFrom: 1001, exact: true, cast: [], notes: "continúa" };
  const e1: EpisodeMemory = { id: "e1", productionId: "e1", season: 1, number: 1, order: 1001, title: "Casa", contentSig: "s", summary: "Resumen", logline: "KAP cuida de su hermano.", present: ["KAP"], accepted: [], rejected: [], startState: emptyCanon(), endState: emptyCanon(), introducedObjects: [], modifiedObjects: [], relationshipChanges: [], eventsText: [], threadsOpened: [], threadsClosed: [], hook: "Alguien llama a la puerta", lastShot: { scene: "Casa", location: "Casa", characters: ["KAP"], text: "KAP: ya vuelvo.", directions: [] }, endingSituation: "Al terminar el ep. 1: KAP en Casa.", committedAt: "x", committedBy: "u" };
  it("incluye formato de la serie, arco, evolución de KAP y el gancho a retomar; respeta el presupuesto y la cima nunca se da por llegada", () => {
    let c = applyChanges(KAP(), [{ kind: "character.age", name: "KAP", age: 8 }, { kind: "milestone.progress", key: "nino-con-pocos-recursos", status: "achieved" }], 1001); c = applyChange(c, { kind: "character.profile", name: "KAP", facet: "sueños", value: "Escribe sus primeras rimas" }, 1001);
    const p = buildContextPack({ request: req, canon: c, episodes: [e1], budgetTokens: 3500 });
    expect(p.text).toMatch(/Formato de la serie[\s\S]*≈ 5 minutos/); expect(p.text).toMatch(/\[gancho: texto\]/); expect(p.text).toMatch(/Gancho que dejó el ep\. 1[\s\S]*Alguien llama a la puerta/); expect(p.text).toMatch(/Arco de la serie[\s\S]*Etapa actual: «Niño»[\s\S]*1\/17/);
    expect(p.text).toMatch(/Siguiente hito: Niño que intenta proteger a su hermano/); expect(p.text).toMatch(/No saltes hitos ni años/); expect(p.text).toMatch(/Evolución de KAP hasta ahora[\s\S]*≈ 8 años/); expect(p.text).toMatch(/sueños: Escribe sus primeras rimas \(antes: Quiere ser millonario/);
    for (const budget of [900, 1500, 3500]) { const q = buildContextPack({ request: req, canon: c, episodes: [e1], budgetTokens: budget }); expect(q.usedTokens).toBeLessThanOrEqual(budget); for (const id of ["format", "arc", "evolution", "hook", "lastshot"]) expect(q.sections.find((s) => s.id === id)?.itemsIncluded, `${id}@${budget}`).toBeGreaterThan(0); }
  });
});

describe("propuesta de la serie", () => {
  it("la estructura declarada y el gancho viajan con la propuesta", () => {
    const e = full(["evento: algo"]); const ex = extractChanges(e, KAP()); expect(ex.acts.map((a) => a.kind)).toEqual(["inicio", "conflicto", "desarrollo", "emocional", "resolucion", "gancho"]); expect(ex.hook).toBe("alguien llama a la puerta");
  });
  it("se propone registrar la versión de diseño visual usada (base de la evolución física)", () => {
    const e = full(["evento: x"], { characters: [{ name: "KAP", designVersion: 1 }] }); const ch = extractChanges(e, KAP()).changes.find((c) => c.change.kind === "character.appearance"); expect(ch?.change).toMatchObject({ name: "KAP", designVersion: 1 });
  });
  it("canon: los hechos confirmados sobre la familia, 2Pac, la banda y su humor están registrados, y NO se añade lo no confirmado", () => {
    const c = KAP(), t = c.facts.map((f) => f.text).join(" | ");
    expect(t).toMatch(/gran sueño de KAP/); expect(t).toMatch(/2Pac.*referentes musicales.*estética de niño/); expect(t).toMatch(/padres terminan separándose.*conflicto familiar grave relacionado con las drogas/);
    expect(t).toMatch(/etapa posterior de su vida \(no en su infancia\).*banda/); expect(t).toMatch(/robos y peleas.*no es lo que quiere/); expect(t).toMatch(/humor más oscuro y su personalidad posterior/);
    expect(t).not.toMatch(/agred|violen|maltrat|golpe|pega|cárcel|prisión|pandilla|entren|gimnasio|físic/i);   // el entrenamiento es evolución futura y la agresión del piloto no se ha confirmado como canon
    for (const f of KAP_FACTS) expect(Change.safeParse({ kind: "fact.add", text: f }).success, f).toBe(true);
  });
});
