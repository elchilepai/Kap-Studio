import { describe, expect, it } from "vitest";
import { applyChange, applyChanges, asProposed, buildContextPack, buildProposal, changeId, contentSig, deriveEnding, emptyCanon, estimateTokens, extractChanges, isMemoryKey, markPresent,
  parseEpisodeRequest, parseManual, parseMemoryDirectives, relevantCharacters, validateContinuity, parseScenes, type CanonState, type EpisodeInput, type EpisodeMemory, type SceneInput } from "./index.ts";

const sc = (title: string, location: string, lines: [string | undefined, string][], o: Partial<SceneInput> = {}): SceneInput => ({
  title, location, lines: lines.map(([speaker, text]) => ({ ...(speaker ? { speaker } : {}), text })), characterNames: [...new Set(lines.map(([s]) => s).filter(Boolean) as string[])], directions: [], memory: [], ...o });
const ep = (scenes: SceneInput[], o: Partial<EpisodeInput> = {}): EpisodeInput => ({ productionId: "p", season: 1, number: 2, title: "Ep", scenes, characters: [], ...o });
const run = (e: EpisodeInput, canon: CanonState) => { const per = parseScenes(e); const ex = extractChanges(e, canon); return validateContinuity({ episode: e, canon, perScene: per, changes: ex.changes }); };
const canonWith = (...ch: Parameters<typeof applyChange>[1][]) => applyChanges(emptyCanon(), ch, 1001);
const rules = (f: ReturnType<typeof run>, sev?: string) => f.filter((x) => !sev || x.severity === sev).map((x) => `${x.severity}:${x.rule}`);

describe("directivas de memoria", () => {
  it("reconoce las claves y NO confunde las de dirección 2D", () => {
    for (const k of ["conoce", "obtiene", "abre-hilo", "continúa", "ubicación", "relación"]) expect(isMemoryKey(k)).toBe(true);
    for (const k of ["camara", "entra", "mira", "vfx", "pose"]) expect(isMemoryKey(k)).toBe(false);
  });
  it("cada directiva produce el cambio tipado correcto", () => {
    const p = parseMemoryDirectives(["conoce: Alex, Laura", "obtiene: Alex, bicicleta", "obtiene: llave", "pierde: Alex, bicicleta", "destruye: teléfono", "repara: teléfono", "abre-hilo: deuda con Marcos | Alex, Marcos", "cierra-hilo: deuda con Marcos",
      "relacion: Alex, Marcos, deuda, -1", "hecho: faro.estado = abandonado", "corrige-hecho: faro.estado = encendido", "regla: nadie sale", "sabe: Alex | Marcos tiene la llave", "ropa: Alex, chaqueta roja", "ubicacion: Alex, Faro",
      "muere: X", "ausente: Y", "reaparece: Z", "lugar: Faro | abandonado", "usa: Alex, bicicleta", "momento: Día 3", "flashback: sí", "continua: 6"]);
    const kinds = p.changes.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["relationship.set", "event.add", "object.introduce", "object.update", "thread.open", "thread.close", "fact.add", "rule.add", "character.knows", "character.outfit", "character.location", "character.status", "place.update"]));
    expect(p.changes.find((c) => c.kind === "relationship.set" && c.relation === "deuda")).toMatchObject({ trust: -1 });
    expect(p.changes.find((c) => c.kind === "thread.open")).toMatchObject({ involves: ["Alex", "Marcos"] });
    expect(p.changes.find((c) => c.kind === "fact.add")).toMatchObject({ key: "faro.estado", value: "abandonado" });
    expect(p.uses).toEqual([{ who: "Alex", object: "bicicleta" }]); expect(p.moment).toBe("Día 3"); expect(p.flashback).toBe(true); expect(p.continues).toBe(6); expect(p.errors).toEqual([]);
  });
  it("lo mal formado se informa, no se inventa ni rompe", () => {
    const p = parseMemoryDirectives(["conoce: Alex", "sabe: solo", "inventada: x", "relacion: A, B", "sin dos puntos", "continua: abc"]);
    expect(p.changes).toEqual([]); expect(p.errors).toHaveLength(6);
    expect(parseManual("[regla: no hay coches]\n[obtiene: Alex, llave]").changes).toHaveLength(3);   // regla + objeto + acontecimiento
  });
});

describe("canon como libro de cambios", () => {
  it("es determinista, inmutable y tolerante (lo desconocido se crea)", () => {
    const a = emptyCanon(), b = applyChange(a, { kind: "object.update", name: "Teléfono", status: "destroyed" }, 1002);
    expect(Object.keys(a.objects)).toEqual([]); expect(b.objects["telefono"]).toMatchObject({ status: "destroyed", introducedIn: 1002 });
    const x = applyChanges(a, [{ kind: "character.status", name: "Marcos", status: "dead" }, { kind: "relationship.set", a: "Alex", b: "Laura", relation: "amigos", trust: 2 }], 1003);
    expect(applyChanges(a, [{ kind: "character.status", name: "Marcos", status: "dead" }, { kind: "relationship.set", a: "Alex", b: "Laura", relation: "amigos", trust: 2 }], 1003)).toEqual(x);
    expect(x.characters["marcos"]).toMatchObject({ status: "dead", statusSince: 1003 }); expect(x.relationships["alex~laura"].history).toHaveLength(1);
  });
  it("perder o destruir quita el dueño pero recuerda el último; un hecho con clave se sustituye", () => {
    let s = canonWith({ kind: "object.update", name: "bicicleta", owner: "Alex", status: "intact" });
    s = applyChange(s, { kind: "object.update", name: "bicicleta", status: "lost" }, 1002); expect(s.objects["bicicleta"]).toMatchObject({ status: "lost", owner: undefined, lastOwner: "Alex" });
    s = applyChanges(s, [{ kind: "fact.add", text: "faro.estado = abandonado", key: "faro.estado", value: "abandonado" }, { kind: "fact.add", text: "faro.estado = encendido", key: "faro.estado", value: "encendido", supersede: true }], 1003);
    expect(s.facts.filter((f) => f.k === "faro.estado")).toEqual([expect.objectContaining({ v: "encendido" })]);
  });
  it("los ids de cambio son estables (se conservan las decisiones al recalcular)", () => {
    expect(changeId({ kind: "object.introduce", name: "Bicicleta" })).toBe(changeId({ kind: "object.introduce", name: "  bicicleta " }));
    expect(changeId({ kind: "object.introduce", name: "coche" })).not.toBe(changeId({ kind: "object.introduce", name: "bicicleta" }));
  });
});

describe("propuesta de cambios (sin IA)", () => {
  it("deduce presencia, lugar final, ropa del reparto, nuevos personajes y lugares; separa lo declarado de lo deducido", () => {
    const e = ep([sc("Taller", "Taller", [["Alex", "Hola"], ["Laura", "Hola"]], { memory: ["conoce: Alex, Laura"] }), sc("Calle", "Calle", [["Alex", "Adiós"]])], { characters: [{ name: "Alex", castOutfit: "camisa roja" }, { name: "Laura" }] });
    const { proposal } = buildProposal(e, emptyCanon());
    const by = (k: string) => proposal.changes.filter((c) => c.change.kind === k);
    expect(proposal.present).toEqual(["Alex", "Laura"]); expect(by("character.add").map((c) => c.origin)).toEqual(["rules", "rules"]);
    expect(by("character.location").map((c) => (c.change as { name: string; location: string }).name + "@" + (c.change as { location: string }).location).sort()).toEqual(["Alex@Calle", "Laura@Taller"]);
    expect(by("character.outfit")).toHaveLength(1); expect(by("place.update")).toHaveLength(2); expect(by("relationship.set")[0].origin).toBe("declared");
    expect(proposal.changes.every((c) => c.decision === "pending")).toBe(true); expect(proposal.lastShot).toMatchObject({ scene: "Calle", location: "Calle" });
  });
  it("recalcular conserva decisiones, cambios manuales y el resumen editado", () => {
    const e = ep([sc("A", "Taller", [["Alex", "Hola"]], { memory: ["obtiene: Alex, llave"] })]); let { proposal } = buildProposal(e, emptyCanon());
    proposal = { ...proposal, summary: "Mi resumen", summaryEdited: true, changes: [...proposal.changes.map((c, i) => ({ ...c, decision: i % 2 ? ("rejected" as const) : ("accepted" as const) })), { ...asProposed({ kind: "rule.add", text: "R" }, "manual"), decision: "accepted" as const }] };
    const again = buildProposal(e, emptyCanon(), { previous: proposal }).proposal;
    expect(again.summary).toBe("Mi resumen"); expect(again.changes.map((c) => c.decision)).toEqual(proposal.changes.map((c) => c.decision)); expect(again.changes.some((c) => c.origin === "manual")).toBe(true);
  });
  it("la firma de contenido cambia si cambia el texto, la memoria o el reparto", () => {
    const base = ep([sc("A", "L", [["Alex", "Hola"]])]); const s0 = contentSig(base);
    expect(contentSig(ep([sc("A", "L", [["Alex", "Hola"]])]))).toBe(s0);
    expect(contentSig(ep([sc("A", "L", [["Alex", "Hola!"]])]))).not.toBe(s0); expect(contentSig(ep([sc("A", "L", [["Alex", "Hola"]], { memory: ["regla: x"] })]))).not.toBe(s0);
    expect(contentSig({ ...base, characters: [{ name: "Alex", castOutfit: "traje" }] })).not.toBe(s0);
  });
  it("el estado final en texto recoge lugar, ropa, objetos e hilos", () => {
    const s = canonWith({ kind: "character.location", name: "Alex", location: "Faro" }, { kind: "character.outfit", name: "Alex", outfit: "capa" }, { kind: "object.update", name: "linterna", owner: "Alex", status: "intact" }, { kind: "thread.open", title: "La luz" });
    expect(deriveEnding(s, ["Alex"], 1006)).toBe("Al terminar el ep. 6: Alex: en Faro, lleva capa, con linterna. Hilos abiertos: La luz.");
  });
});

describe("validación de continuidad — una prueba por regla", () => {
  const world = canonWith(
    { kind: "character.add", name: "Alex" }, { kind: "character.add", name: "Laura" }, { kind: "character.status", name: "Marcos", status: "dead" }, { kind: "character.status", name: "Vega", status: "absent" },
    { kind: "character.location", name: "Alex", location: "Faro" }, { kind: "character.outfit", name: "Alex", outfit: "camisa roja" },
    { kind: "object.update", name: "teléfono", status: "destroyed" }, { kind: "object.update", name: "llave", owner: "Laura", status: "intact" }, { kind: "relationship.set", a: "Alex", b: "Laura", relation: "amigos", trust: 2 },
    { kind: "thread.open", title: "deuda" }, { kind: "thread.open", title: "viejo" }, { kind: "thread.close", title: "viejo" }, { kind: "fact.add", text: "faro.estado = abandonado", key: "faro.estado", value: "abandonado" });
  it("personaje muerto que aparece → error crítico; ausente → advertencia; explicado (reaparece/flashback/entra) → nada", () => {
    expect(rules(run(ep([sc("A", "Faro", [["Marcos", "Hola"]])]), world), "error")).toContain("error:personaje-muerto");
    expect(rules(run(ep([sc("A", "Faro", [["Vega", "Hola"]])]), world))).toContain("warning:personaje-ausente");
    expect(rules(run(ep([sc("A", "Faro", [["Marcos", "Hola"]], { memory: ["reaparece: Marcos"] })]), world), "error")).not.toContain("error:personaje-muerto");
    expect(rules(run(ep([sc("A", "Faro", [["Marcos", "Hola"]], { memory: ["flashback: sí"] })]), world), "error")).toEqual([]);
    expect(rules(run(ep([sc("A", "Faro", [["Vega", "Hola"]], { directions: ["entra: Vega izquierda"] })]), world))).not.toContain("warning:personaje-ausente");
  });
  it("cambia de ropa sin razón → advertencia; con [ropa:] → nada", () => {
    const e = (mem: string[]) => ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: mem })], { characters: [{ name: "Alex", castOutfit: "traje azul" }] });
    expect(rules(run(e([]), world))).toContain("warning:cambio-ropa"); expect(rules(run(e(["ropa: Alex, traje azul"]), world))).not.toContain("warning:cambio-ropa");
  });
  it("objeto destruido que reaparece (uso declarado, verbo de uso o mención) con distinta gravedad; hablar de él destruido no es fallo", () => {
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: ["usa: Alex, teléfono"] })]), world), "error")).toContain("error:objeto-destruido");
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Alex coge el teléfono y llama"]])]), world), "error")).toContain("error:objeto-destruido");
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "El teléfono está sobre la mesa"]])]), world))).toContain("warning:objeto-destruido");
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Mi teléfono quedó destruido, lo rompí"]])]), world)).filter((x) => !x.startsWith("info"))).toEqual([]);
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Alex usa el teléfono"]], { memory: ["repara: teléfono"] })]), world), "error")).toEqual([]);
  });
  it("objeto sin introducir y objeto ajeno", () => {
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: ["usa: Alex, coche"] })]), world))).toContain("warning:objeto-sin-introducir");
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: ["usa: Alex, coche", "obtiene: Alex, coche"] })]), world))).not.toContain("warning:objeto-sin-introducir");
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: ["usa: Alex, llave"] })]), world))).toContain("warning:objeto-ajeno");
  });
  it("un personaje en dos lugares incompatibles a la vez → error; lugar declarado distinto del de la escena → advertencia", () => {
    const e = ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: ["momento: Noche 3"] }), sc("B", "Puente", [["Alex", "Hola"]], { memory: ["momento: noche 3"] })]);
    expect(rules(run(e, world), "error")).toContain("error:dos-lugares");
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: ["momento: Noche 3"] }), sc("B", "Puente", [["Laura", "Hola"]], { memory: ["momento: Noche 3"] })]), world), "error")).toEqual([]);
    expect(rules(run(ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: ["ubicacion: Alex, Puente"] })]), world))).toContain("warning:ubicacion-incoherente");
  });
  it("relaciones: «se conocen» cuando ya se conocían, «desconocidos» contra el canon y cambios bruscos de confianza", () => {
    const e = (m: string) => ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: [m] })]);
    expect(rules(run(e("conoce: Alex, Laura"), world))).toContain("warning:relacion-contradice");
    expect(rules(run(e("relacion: Alex, Laura, desconocidos"), world), "error")).toContain("error:relacion-contradice");
    expect(rules(run(e("relacion: Alex, Laura, enemigos, -2"), world))).toContain("warning:relacion-contradice");
    expect(rules(run(e("relacion: Alex, Laura, amigos, 1"), world)).filter((x) => x.startsWith("warning") || x.startsWith("error"))).toEqual([]);
  });
  it("acontecimientos que contradicen episodios anteriores: morir dos veces, destruir lo destruido, perder lo destruido, hechos con clave", () => {
    const e = (m: string) => ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: [m] })]);
    expect(rules(run(e("muere: Marcos"), world), "error")).toContain("error:evento-contradice");
    expect(rules(run(e("destruye: teléfono"), world), "error")).toContain("error:evento-contradice");
    expect(rules(run(e("pierde: Alex, teléfono"), world), "error")).toContain("error:evento-contradice");
    expect(rules(run(e("hecho: faro.estado = encendido"), world), "error")).toContain("error:hecho-contradice");
    expect(rules(run(e("corrige-hecho: faro.estado = encendido"), world), "error")).toEqual([]);
  });
  it("hilos: cerrar uno que no está abierto, cerrar uno ya cerrado, reabrir, abrir uno abierto", () => {
    const e = (m: string) => ep([sc("A", "Faro", [["Alex", "Hola"]], { memory: [m] })]);
    expect(rules(run(e("cierra-hilo: inexistente"), world))).toContain("warning:hilo"); expect(rules(run(e("cierra-hilo: viejo"), world))).toContain("warning:hilo");
    expect(rules(run(e("abre-hilo: viejo"), world))).toContain("warning:hilo"); expect(rules(run(e("abre-hilo: deuda"), world))).toContain("info:hilo"); expect(rules(run(e("cierra-hilo: deuda"), world))).not.toContain("warning:hilo");
  });
  it("arranque discontinuo solo para quien salía en el último plano; lo nuevo se marca como información pendiente", () => {
    const e = ep([sc("A", "Puente", [["Alex", "Hola"], ["Laura", "Hola"]])], { continuesFrom: 1001 });
    const f = validateContinuity({ episode: e, canon: world, perScene: parseScenes(e), changes: extractChanges(e, world).changes, previousLastShot: { characters: ["Alex"], location: "Faro" } });
    expect(f.find((x) => x.rule === "arranque-discontinuo" && x.subject === "Alex")?.severity).toBe("warning");
    expect(f.filter((x) => x.rule === "arranque-discontinuo" && x.subject === "Laura").every((x) => x.severity === "info")).toBe(true);
    expect(rules(run(ep([sc("A", "Faro", [["Zoe", "Hola"]])]), world)).join()).toMatch(/info:nuevo/);
  });
  it("no bloquea: error, advertencia e información son informes ordenados por gravedad", () => {
    const f = run(ep([sc("A", "Faro", [["Marcos", "Hola"], ["Vega", "Hola"], ["Zoe", "Hola"]])]), world);
    expect(f.map((x) => x.severity)).toEqual([...f.map((x) => x.severity)].sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a] - { error: 0, warning: 1, info: 2 }[b])));
    expect(new Set(f.map((x) => x.severity))).toEqual(new Set(["error", "warning", "info"]));
  });
});

describe("petición de episodio", () => {
  const ctx = { knownCharacters: ["Alex", "Laura", "Marcos"], defaultSeason: 1, nextNumber: 7, latestBefore: () => 1006 };
  it.each([
    ["Crea el episodio 7 continuando exactamente donde terminó el episodio 6", { number: 7, continuesFrom: 1006, exact: true }],
    ["Crear episodio 7 continuando el episodio 6", { number: 7, continuesFrom: 1006, exact: false }],
    ["haz el episodio 3 a partir del episodio 2 con Laura", { number: 3, continuesFrom: 1002, exact: false, cast: ["Laura"] }],
    ["Continúa el episodio 6", { number: 7, continuesFrom: 1006 }],
    ["Nuevo episodio continuando donde lo dejamos", { number: 7, continuesFrom: 1006, exact: true }],
    ["Crea el episodio 4 de la temporada 2 continuando el episodio 3", { number: 4, season: 2, continuesFrom: 2003 }],
    ["Un episodio de misterio con Alex y Marcos", { number: 7, cast: ["Alex", "Marcos"] }],
  ])("%s", (text, want) => { const r = parseEpisodeRequest(text as string, ctx); expect(r).toMatchObject(want as object); if (!("continuesFrom" in (want as object))) expect(r.continuesFrom).toBeUndefined(); });
});

describe("paquete de contexto con presupuesto de tokens", () => {
  const mem = (n: number, extra: Partial<EpisodeMemory> = {}): EpisodeMemory => ({ id: `e${n}`, productionId: `e${n}`, season: 1, number: n, order: 1000 + n, title: `Título ${n}`, contentSig: "s", summary: `Resumen largo del episodio ${n}. `.repeat(8), logline: `Logline ${n}`, present: ["Alex"],
    accepted: [], rejected: [], startState: emptyCanon(), endState: emptyCanon(), introducedObjects: [], modifiedObjects: [], relationshipChanges: [], eventsText: [], threadsOpened: [], threadsClosed: [],
    lastShot: { scene: "Faro", location: "Faro", characters: ["Alex", "Laura"], text: "ALEX: ¿Quién encendió la luz?", directions: ["camara: zoom"] }, endingSituation: `Al terminar el ep. ${n}: Alex en Faro.`, committedAt: "x", committedBy: "u", ...extra });
  const big = () => { let s = emptyCanon(); for (let i = 0; i < 40; i++) s = applyChanges(s, [{ kind: "character.add", name: `Pers${i}` }, { kind: "object.update", name: `objeto${i}`, owner: `Pers${i}`, status: "intact" }, { kind: "thread.open", title: `hilo ${i}`, involves: [`Pers${i}`] }, { kind: "fact.add", text: `Hecho número ${i} de la historia` }, { kind: "relationship.set", a: `Pers${i}`, b: "Pers0", relation: "amigos", trust: 1 }], 1000 + (i % 6) + 1);
    return applyChanges(s, [{ kind: "rule.add", text: "Nadie sale de la ciudad" }, { kind: "character.add", name: "Alex" }, { kind: "character.add", name: "Laura" }, { kind: "object.update", name: "bicicleta", owner: "Alex", status: "intact" }, { kind: "character.outfit", name: "Alex", outfit: "camisa roja" }], 1006); };
  const req = { text: "x", number: 7, season: 1, continuesFrom: 1006, exact: true, cast: ["Laura"], notes: "continúa" };
  const eps = Array.from({ length: 6 }, (_, i) => mem(i + 1));
  it("lo imprescindible siempre entra y el total respeta el presupuesto; lo menos importante se descarta primero", () => {
    for (const budget of [900, 1500, 3500, 8000]) {
      const p = buildContextPack({ request: req, canon: big(), episodes: eps, budgetTokens: budget }); expect(p.usedTokens, `presupuesto ${budget}`).toBeLessThanOrEqual(budget);
      for (const id of ["request", "final", "lastshot", "characters", "rules"]) expect(p.sections.find((s) => s.id === id)?.itemsIncluded, `${id} @${budget}`).toBeGreaterThan(0);
      expect(p.text).toMatch(/Nadie sale de la ciudad/); expect(p.text).toMatch(/Último plano del ep\. 6/);
    }
    const small = buildContextPack({ request: req, canon: big(), episodes: eps, budgetTokens: 900 }), large = buildContextPack({ request: req, canon: big(), episodes: eps, budgetTokens: 8000 });
    expect(small.dropped.length).toBeGreaterThan(0); expect(small.usedTokens).toBeLessThan(large.usedTokens);
    const droppedIds = small.dropped.map((d) => d.section); expect(droppedIds).toContain("history");   // lo último en prioridad se pierde antes
    expect(large.text.length).toBeLessThan(JSON.stringify(big()).length);           // no se vuelca la historia entera
  });
  it("selecciona personajes relevantes (petición, último plano, hilos) y no carga a todos", () => {
    const p = buildContextPack({ request: req, canon: big(), episodes: eps, budgetTokens: 1500, maxCharacters: 6 });
    expect(p.relevantCharacters).toHaveLength(6); expect(p.relevantCharacters.slice(0, 2)).toEqual(["Laura", "Alex"]); expect(relevantCharacters({ request: req, canon: big(), episodes: eps })).toHaveLength(8);
    const other = p.sections.find((s) => s.id === "threads-other")!; expect(other.itemsIncluded).toBeLessThan(other.itemsTotal);   // los hilos ajenos a los relevantes se recortan primero
    expect(p.sections.find((s) => s.id === "characters")!.itemsIncluded).toBeGreaterThanOrEqual(2); expect(p.usedTokens).toBeLessThanOrEqual(1500);
  });
  it("incluye relaciones, objetos, hilos y continuidad visual de los relevantes; marca lo destruido/perdido", () => {
    const c = applyChanges(big(), [{ kind: "relationship.set", a: "Alex", b: "Laura", relation: "aliados", trust: 2 }, { kind: "object.update", name: "teléfono", status: "destroyed" }, { kind: "thread.open", title: "La luz del faro", involves: ["Alex"] }], 1006);
    const t = buildContextPack({ request: req, canon: c, episodes: eps, characters: [{ name: "Alex", designVersion: 3, look: "pelo spiky" }], places: [{ name: "Faro", look: "city (night)" }], budgetTokens: 8000 }).text;
    expect(t).toMatch(/Alex ↔ Laura: aliados/); expect(t).toMatch(/«teléfono» — DESTRUIDO/); expect(t).toMatch(/«La luz del faro»/); expect(t).toMatch(/Alex: ropa «camisa roja»; aspecto pelo spiky; diseño v3/); expect(t).toMatch(/Lugar del último plano «Faro»: city \(night\)/);
  });
  it("sin episodio anterior (primer episodio) el paquete funciona; el texto es estable (mismo input → mismo texto)", () => {
    const r = { ...req, continuesFrom: undefined, exact: false, number: 1 }; const a = buildContextPack({ request: r, canon: emptyCanon(), episodes: [], budgetTokens: 2000 });
    expect(a.sections.map((s) => s.id)).toEqual(["request"]); expect(buildContextPack({ request: r, canon: emptyCanon(), episodes: [], budgetTokens: 2000 }).text).toBe(a.text);
    expect(estimateTokens("hola mundo")).toBe(3); void markPresent;
  });
  it("presupuesto absurdamente pequeño: se avisa en lugar de fingir", () => { expect(buildContextPack({ request: req, canon: big(), episodes: eps, budgetTokens: 30 }).overBudget).toBe(true); });
});
