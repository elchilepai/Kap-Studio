import { describe, expect, it } from "vitest";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import type { Production } from "@/domain/types";
import { validateIR } from "@/domain/screenplay";
import { irToScenes, parsedToIR } from "@/server/studio/interpreter";
import { parseScript } from "@/server/studio/script";
import { addToBase, canonUpTo, commitMemory, createEpisodeFromRequest, memoryStatus, MemoryError, proposeMemory, requestContext, retractMemory, saveDecisions, staleEpisodes, validEpisodes } from "./service";

/** Escenario manual de la fase: Alex conoce a Laura, consigue una bicicleta y queda pendiente una deuda con Marcos. Todo por el pipeline REAL del guion. */
const NAMES = ["Alex", "Laura", "Marcos"];
const EP1 = `
# Taller
[continua: 0]
Alex entra al taller de Marcos con la camisa roja.
ALEX: Necesito una bicicleta para llegar a tiempo.
LAURA: Yo tengo una. Soy Laura.
[conoce: Alex, Laura]
[obtiene: Alex, bicicleta]
[ropa: Alex, camisa roja]
[abre-hilo: deuda con Marcos | Alex, Marcos]
# Calle
Alex pedalea su bicicleta bajo la lluvia.
ALEX: Le pagaré a Marcos, lo prometo.
[usa: Alex, bicicleta]
`.replace("[continua: 0]\n", "");

async function setup() {
  const storage = createSqliteStorage(":memory:");
  for (const [i, n] of NAMES.entries()) await storage.characters.save({ id: `c${i}`, name: n, description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });
  const chars = await storage.characters.list();
  const prod = async (id: string, number: number, script: string, status: Production["status"] = "REVIEW", extra: Partial<Production> = {}) => {
    const r = validateIR(parsedToIR(parseScript(script, chars.map((c, i) => ({ id: String(i), name: c.name })))), { characters: NAMES, places: [] });
    expect(r.errors).toEqual([]);
    const p: Production = { id, kind: "episode", number, season: 1, title: `Episodio ${number}`, status, synopsis: "", script, scenes: irToScenes(r.ir!, chars), assetIds: [], durationSec: 60, cast: [], storyTime: "", generated: true, brief: "", createdAt: "2026-01-01", updatedAt: "2026-01-01", ...extra };
    await storage.productions.save(p); return p;
  };
  const deps = { storage, now: () => "2026-02-01T00:00:00Z" };
  return { storage, deps, prod, set: async (id: string, status: Production["status"]) => { const p = (await storage.productions.get(id))!; await storage.productions.save({ ...p, status }); } };
}
const approveAll = async (d: Awaited<ReturnType<typeof setup>>, id: string) => { await saveDecisions(d.deps, id, { all: "accepted" }); await d.set(id, "APPROVED"); return commitMemory(d.deps, id); };

describe("memoria narrativa — escenario manual (episodio 1 → aprobar → episodio 2)", () => {
  it("las directivas de memoria no se narran ni van al director; quedan en la escena", async () => {
    const d = await setup(); const p = await d.prod("e1", 1, EP1);
    expect(p.scenes).toHaveLength(2);
    expect(p.scenes[0].memory).toEqual(expect.arrayContaining(["conoce: Alex, Laura", "obtiene: Alex, bicicleta", "abre-hilo: deuda con Marcos | Alex, Marcos"]));
    for (const s of p.scenes) { expect(s.narration + s.dialogue).not.toMatch(/conoce:|obtiene:|abre-hilo|usa:/); expect(s.directions.join(" ")).not.toMatch(/conoce|obtiene|abre-hilo/); }
  });

  it("un BORRADOR genera una propuesta pero NO toca el canon", async () => {
    const d = await setup(); await d.prod("e1", 1, EP1);
    const prop = await proposeMemory(d.deps, "e1");
    expect(prop.status).toBe("pending"); expect(prop.changes.length).toBeGreaterThan(5);
    const texts = prop.changes.map((c) => c.text).join("\n");
    expect(texts).toMatch(/Alex y Laura: conocidos/); expect(texts).toMatch(/«bicicleta».*Alex lo obtiene/); expect(texts).toMatch(/Se abre el hilo «deuda con Marcos»/);
    const canon = await canonUpTo(d.storage); expect(Object.keys(canon.characters)).toEqual([]); expect(Object.keys(canon.objects)).toEqual([]); expect(Object.keys(canon.threads)).toEqual([]);
  });

  it("no se puede confirmar sin aprobar, ni con cambios sin decidir, ni con una propuesta desfasada", async () => {
    const d = await setup(); await d.prod("e1", 1, EP1); await proposeMemory(d.deps, "e1");
    await saveDecisions(d.deps, "e1", { all: "accepted" });
    await expect(commitMemory(d.deps, "e1")).rejects.toThrow(/aprobado/);                    // en revisión: no es canon
    await d.set("e1", "APPROVED");
    const p = (await d.storage.memoryProposals.get("e1"))!; await d.storage.memoryProposals.save({ ...p, changes: p.changes.map((c, i) => (i === 0 ? { ...c, decision: "pending" as const } : c)) });
    await expect(commitMemory(d.deps, "e1")).rejects.toThrow(/sin decidir/);
    await d.storage.memoryProposals.save({ ...p, contentSig: "otra" });
    await expect(commitMemory(d.deps, "e1")).rejects.toThrow(/desfasada/);
    expect(Object.keys((await canonUpTo(d.storage)).objects)).toEqual([]);                    // nada entró
  });

  it("aprobar y confirmar → canon actualizado; el episodio guarda estado inicial/final, último plano e hilos", async () => {
    const d = await setup(); await d.prod("e1", 1, EP1); await proposeMemory(d.deps, "e1");
    const em = await approveAll(d, "e1");
    const canon = await canonUpTo(d.storage);
    expect(canon.relationships["alex~laura"]).toMatchObject({ relation: "conocidos" });
    expect(canon.objects["bicicleta"]).toMatchObject({ owner: "Alex", status: "intact", introducedIn: 1001 });
    expect(canon.threads["deuda-con-marcos"]).toMatchObject({ status: "open", involves: ["Alex", "Marcos"] });
    expect(canon.characters["alex"]).toMatchObject({ location: "Calle", outfit: "camisa roja" });
    expect(em.present).toEqual(expect.arrayContaining(["Alex", "Laura", "Marcos"]));
    expect(em.introducedObjects).toEqual(["bicicleta"]); expect(em.threadsOpened).toEqual(["deuda con Marcos"]); expect(em.relationshipChanges.join()).toMatch(/Alex y Laura/);
    expect(em.startState.asOf).toBe(1001); expect(Object.keys(em.startState.objects)).toEqual([]); expect(em.endState.objects["bicicleta"].owner).toBe("Alex");
    expect(em.lastShot).toMatchObject({ scene: "Calle", location: "Calle" }); expect(em.lastShot.text).toMatch(/Le pagaré a Marcos/);
    expect(em.endingSituation).toMatch(/Alex: en Calle.*con bicicleta/); expect(em.endingSituation).toMatch(/Hilos abiertos: deuda con Marcos/);
  });

  it("aceptar algunos / rechazar otros: lo rechazado no entra en el canon", async () => {
    const d = await setup(); await d.prod("e1", 1, EP1); const prop = await proposeMemory(d.deps, "e1");
    const dec: Record<string, "accepted" | "rejected"> = {}; for (const c of prop.changes) dec[c.id] = c.change.kind === "thread.open" || c.change.kind === "object.update" ? "rejected" : "accepted";
    await saveDecisions(d.deps, "e1", { decisions: dec }); await d.set("e1", "APPROVED"); const em = await commitMemory(d.deps, "e1");
    const canon = await canonUpTo(d.storage);
    expect(canon.relationships["alex~laura"]).toBeDefined(); expect(canon.threads["deuda-con-marcos"]).toBeUndefined();
    expect(em.rejected.length).toBeGreaterThan(0); expect(em.accepted.length + em.rejected.length).toBe(prop.changes.length);
  });

  it("episodio 2 continúa del 1: «Crea el episodio 2 continuando exactamente donde terminó el episodio 1» → contexto con lo aprobado", async () => {
    const d = await setup(); await d.prod("e1", 1, EP1); await proposeMemory(d.deps, "e1"); await approveAll(d, "e1");
    const { production, request, pack } = await createEpisodeFromRequest(d.deps, "Crea el episodio 2 continuando exactamente donde terminó el episodio 1, con Laura");
    expect(request).toMatchObject({ number: 2, season: 1, continuesFrom: 1001, exact: true }); expect(request.cast).toEqual(["Laura"]);
    expect(production).toMatchObject({ number: 2, status: "SCRIPTING", continuesFrom: 1001 });
    const t = pack.text;
    expect(t).toMatch(/EXACTAMENTE donde terminó/); expect(t).toMatch(/Último plano del ep\. 1/); expect(t).toMatch(/Le pagaré a Marcos/);
    expect(t).toMatch(/Alex y Laura|Alex ↔ Laura|Laura ↔ Alex/); expect(t).toMatch(/«bicicleta».*Alex/); expect(t).toMatch(/«deuda con Marcos»/); expect(t).toMatch(/camisa roja/);
    expect(pack.relevantCharacters).toEqual(expect.arrayContaining(["Alex", "Laura", "Marcos"])); expect(pack.usedTokens).toBeLessThanOrEqual(pack.budgetTokens);
    await expect(createEpisodeFromRequest(d.deps, "Crea el episodio 2")).rejects.toThrow(/ya existe/);
  });

  it("episodio 2 coherente: Alex sigue con la bicicleta, él y Laura ya se conocen, la deuda sigue abierta → sin errores", async () => {
    const d = await setup(); await d.prod("e1", 1, EP1); await proposeMemory(d.deps, "e1"); await approveAll(d, "e1");
    await d.prod("e2", 2, `
# Calle
ALEX: Laura, gracias por la bicicleta.
LAURA: Marcos sigue esperando su dinero.
[usa: Alex, bicicleta]
[abre-hilo: deuda con Marcos]
`, "REVIEW", { continuesFrom: 1001 });
    await proposeMemory(d.deps, "e2"); const st = (await memoryStatus(d.storage, "e2"))!;
    expect(st.findings.filter((f) => f.severity === "error")).toEqual([]); expect(st.findings.filter((f) => f.severity === "warning")).toEqual([]);
    const canon = await canonUpTo(d.storage); expect(canon.objects["bicicleta"].owner).toBe("Alex"); expect(canon.threads["deuda-con-marcos"].status).toBe("open");
    await approveAll(d, "e2"); const after = await canonUpTo(d.storage);
    expect(after.objects["bicicleta"].owner).toBe("Alex"); expect(after.threads["deuda-con-marcos"].status).toBe("open"); expect(after.relationships["alex~laura"].relation).toBe("conocidos");
  });

  it("CONTRADICCIÓN deliberada: Alex perdió la bicicleta en el episodio anterior y aparece utilizándola → el sistema lo detecta", async () => {
    const d = await setup();
    await d.prod("e1", 1, EP1 + "\n# Puente\nAlex tropieza y la bicicleta cae al río.\n[pierde: Alex, bicicleta]\n"); await proposeMemory(d.deps, "e1"); await approveAll(d, "e1");
    expect((await canonUpTo(d.storage)).objects["bicicleta"]).toMatchObject({ status: "lost" });
    // a) uso declarado
    await d.prod("e2", 2, "# Calle\nALEX: Vamos.\n[usa: Alex, bicicleta]\n", "REVIEW", { continuesFrom: 1001 }); await proposeMemory(d.deps, "e2");
    let st = (await memoryStatus(d.storage, "e2"))!; const f = st.findings.find((x) => x.rule === "objeto-perdido")!;
    expect(f.severity).toBe("error"); expect(f.text).toMatch(/«bicicleta» está perdido desde ep\. 1/);
    // b) sin directiva: se detecta por el texto («pedalea su bicicleta»)
    await d.prod("e3", 3, "# Calle\nAlex pedalea su bicicleta hacia el taller.\nALEX: Qué bien rueda.\n", "REVIEW", { continuesFrom: 1001 }); await proposeMemory(d.deps, "e3");
    st = (await memoryStatus(d.storage, "e3"))!; expect(st.findings.find((x) => x.rule === "objeto-perdido")?.severity).toBe("error");
    // c) mencionarla para decir que se perdió NO es un fallo
    await d.prod("e4", 4, "# Puente\nALEX: Perdí la bicicleta en el río, ya no la tengo.\n", "REVIEW", { continuesFrom: 1001 }); await proposeMemory(d.deps, "e4");
    expect((await memoryStatus(d.storage, "e4"))!.findings.filter((x) => x.severity !== "info")).toEqual([]);
    // d) recuperarla declarándolo lo explica
    await d.prod("e5", 5, "# Río\nAlex encuentra la bicicleta.\n[obtiene: Alex, bicicleta]\n# Calle\nAlex monta en la bicicleta.\n", "REVIEW", { continuesFrom: 1001 }); await proposeMemory(d.deps, "e5");
    expect((await memoryStatus(d.storage, "e5"))!.findings.filter((x) => x.severity === "error")).toEqual([]);
  });

  it("si el episodio aprobado cambia (o vuelve a revisión) deja de ser canon hasta reconfirmarlo; retirar lo saca del canon", async () => {
    const d = await setup(); const p = await d.prod("e1", 1, EP1); await proposeMemory(d.deps, "e1"); await approveAll(d, "e1");
    expect((await validEpisodes(d.storage)).map((e) => e.id)).toEqual(["e1"]);
    await d.set("e1", "REVIEW"); expect(await validEpisodes(d.storage)).toEqual([]); expect(Object.keys((await canonUpTo(d.storage)).objects)).toEqual([]);   // vuelve a revisión → ya no es canon
    await d.set("e1", "APPROVED"); expect(await validEpisodes(d.storage)).toHaveLength(1);
    await d.storage.productions.save({ ...(await d.storage.productions.get("e1"))!, scenes: p.scenes.map((s, i) => (i === 0 ? { ...s, location: "Otro sitio" } : s)) });   // contenido distinto
    expect(await validEpisodes(d.storage)).toEqual([]); expect((await staleEpisodes(d.storage)).map((e) => e.id)).toEqual(["e1"]);
    expect((await memoryStatus(d.storage, "e1"))!.stale).toBe(true);
    await d.storage.productions.save(p); await retractMemory(d.deps, "e1"); expect(await d.storage.memoryEpisodes.list()).toEqual([]);
    expect((await d.storage.memoryProposals.get("e1"))!.status).toBe("pending");
  });

  it("canon base: reglas del universo y hechos que escribe el usuario entran al contexto; un hecho clave contradictorio se detecta", async () => {
    const d = await setup(); await addToBase(d.deps, "regla: nadie puede salir de la ciudad\nhecho: faro.estado = abandonado");
    await d.prod("e1", 1, EP1); await proposeMemory(d.deps, "e1"); await approveAll(d, "e1");
    const { pack } = await requestContext(d.storage, "Crea el episodio 2 continuando el episodio 1");
    expect(pack.text).toMatch(/Reglas del universo/); expect(pack.text).toMatch(/nadie puede salir de la ciudad/); expect(pack.text).toMatch(/faro\.estado = abandonado/);
    await d.prod("e2", 2, "# Faro\nALEX: Mira, el faro funciona.\n[hecho: faro.estado = encendido]\n", "REVIEW", { continuesFrom: 1001 }); await proposeMemory(d.deps, "e2");
    const f = (await memoryStatus(d.storage, "e2"))!.findings.find((x) => x.rule === "hecho-contradice");
    expect(f?.severity).toBe("error"); expect(f?.text).toMatch(/faro\.estado = abandonado/);
    await expect(addToBase(d.deps, "esto no es una directiva")).rejects.toBeInstanceOf(MemoryError);
  });

  it("una generación fallida no crea propuesta ni canon; solo los episodios (no los Shorts) tienen memoria", async () => {
    const d = await setup(); await d.storage.productions.save({ id: "s1", kind: "short", number: 1, season: 1, title: "Short", status: "REVIEW", synopsis: "", script: "", scenes: [], assetIds: [], durationSec: 30, cast: [], storyTime: "", generated: true, brief: "", createdAt: "x", updatedAt: "x" } as Production);
    await expect(proposeMemory(d.deps, "s1")).rejects.toThrow(/solo para episodios/); await expect(proposeMemory(d.deps, "no-existe")).rejects.toThrow(/no encontrada/);
    expect(await d.storage.memoryProposals.list()).toEqual([]); expect(Object.keys((await canonUpTo(d.storage)).characters)).toEqual([]);
  });
});
