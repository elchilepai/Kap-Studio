import { describe, expect, it } from "vitest";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import type { Production } from "@/domain/types";
import { validateIR } from "@/domain/screenplay";
import { irToScenes, parsedToIR } from "@/server/studio/interpreter";
import { parseScript } from "@/server/studio/script";
import { KAP_MILESTONES } from "@/memory";
import { answerStory, canonUpTo, commitMemory, createEpisodeFromRequest, kapCanonRegistered, memoryStatus, proposeMemory, registerKapCanon, requestContext, saveDecisions, seriesStatus } from "./service";

/** Episodios de PRUEBA (no son canon ni guion de la serie): solo sirven para comprobar que la memoria sostiene el arco. */
const ACTS = (a: string[]) => `[acto: inicio | ${a[0]}]\n[acto: conflicto | ${a[1]}]\n[acto: desarrollo | ${a[2]}]\n[acto: emocional | ${a[3]}]\n[acto: resolucion | ${a[4]}]\n[gancho: ${a[5]}]\n`;
const E1 = `# Casa
KAP prepara la cena para su hermano pequeño mientras sus padres duermen.
KAP: Come despacio, hay para los dos.
[edad: KAP, 8]
[hito-logrado: Niño con pocos recursos | la casa vacía y la nevera casi vacía]
[hito-logrado: Niño que intenta proteger a su hermano | le prepara la cena y lo acuesta]
[perfil: KAP, personalidad = serio y responsable para su edad]
[perfil: KAP, ropa que usa = prendas viejas y gastadas]
[ropa: KAP, camiseta gris desgastada]
# Calle
KAP baja a la calle de noche y escucha música en la ventana de un vecino.
KAP: Algún día yo también haré canciones.
[evento: KAP escucha rap por primera vez]
${ACTS(["Una casa sin recursos", "Los padres no están", "KAP cuida a su hermano", "KAP se esconde para llorar", "Logra que su hermano duerma", "Alguien llama a la puerta"])}`;
const E2 = `# Colegio
Dani y otros niños se ríen de la camiseta gris desgastada de KAP.
DANI: Mira al pobre, ni zapatos tiene.
KAP: Déjame en paz.
[relacion: KAP, Dani, acoso, -2]
[hito-logrado: Víctima de bullying | se burlan de su ropa y de su situación]
[perfil: KAP, situación escolar = se burlan de él a diario y cada vez le cuesta más ir]
[abre-hilo: Dani acosa a KAP | KAP, Dani]
# Patio
KAP se queda solo en el patio y escribe una frase en su cuaderno.
${ACTS(["Otro día de colegio", "Dani y su grupo lo humillan", "KAP intenta ignorarlos", "KAP llega a casa sin hablar", "Su hermano le da un abrazo", "KAP encuentra un cuaderno nuevo"])}`;
const E3 = `# Habitación
KAP rapea en voz baja para su hermano y le cuenta su sueño de ser millonario con su música.
KAP: Un día esto sonará en todas partes.
[hito-logrado: Niño con un sueño | por primera vez cuenta su sueño en voz alta]
[perfil: KAP, sueños = vivir de su música y sacar a su familia de la pobreza]
[perfil: KAP, habilidades iniciales = escribe rimas y practica con el ritmo de su cuaderno]
[atributo: KAP, esfuerzo = 3]
[edad: KAP, 9]
[evento: KAP cuenta su sueño de ser millonario]
${ACTS(["La noche en la habitación", "Su hermano duda si es posible", "KAP practica sus primeras rimas", "KAP promete no rendirse", "Su hermano le cree", "Dani se entera del sueño de KAP"])}`;
const E4_PREMATURE = `# Escenario
KAP triunfa en un gran estadio.
[hito-logrado: Llegada a la cima | ya es una estrella]
[etapa: KAP, En la cima]
[edad: KAP, 22]
${ACTS(["Estadio lleno", "Nadie esperaba su éxito", "KAP canta", "KAP recuerda su infancia", "Aplausos", "Fin"])}`;

async function setup() {
  const storage = createSqliteStorage(":memory:"); for (const [i, n] of ["KAP", "Dani"].entries()) await storage.characters.save({ id: `c${i}`, name: n, description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });
  const chars = await storage.characters.list(), deps = { storage, now: () => "2026-03-01T00:00:00Z" };
  const mk = async (id: string, number: number, script: string, status: Production["status"] = "REVIEW", extra: Partial<Production> = {}) => {
    const r = validateIR(parsedToIR(parseScript(script, chars.map((c, i) => ({ id: String(i), name: c.name })))), { characters: ["KAP", "Dani"], places: [] }); expect(r.errors).toEqual([]);
    const sc = irToScenes(r.ir!, chars).map((s) => ({ ...s, durationSec: 300 / r.ir!.scenes.length }));   // ≈ 5 min por episodio
    const p: Production = { id, kind: "episode", number, season: 1, title: `Episodio ${number}`, status, synopsis: "", script, scenes: sc, assetIds: [], durationSec: 300, cast: [], storyTime: "", generated: true, brief: "", createdAt: "x", updatedAt: "x", ...extra }; await storage.productions.save(p); return p;
  };
  const approve = async (id: string) => { await proposeMemory(deps, id); await saveDecisions(deps, id, { all: "accepted" }); const p = (await storage.productions.get(id))!; await storage.productions.save({ ...p, status: "APPROVED" }); return commitMemory(deps, id); };
  return { storage, deps, mk, approve };
}

describe("serie de KAP — canon inicial y arco sobre la memoria real", () => {
  it("el canon inicial se registra con una acción explícita e idempotente", async () => {
    const d = await setup(); expect(await kapCanonRegistered(d.storage)).toBe(false);
    const r1 = await registerKapCanon(d.deps); expect(r1.added).toBeGreaterThan(40); expect(await kapCanonRegistered(d.storage)).toBe(true);
    const r2 = await registerKapCanon(d.deps); expect(r2).toEqual({ added: 0, already: true });
    const s = await seriesStatus(d.storage); expect(s.arc).toMatchObject({ total: 17, achieved: 0, stage: { title: "Niño" } }); expect(s.canon.series?.protagonist).toBe("KAP"); expect(s.episodes).toEqual([]);
  });

  it("antes de aprobar nada, la memoria responde con el punto de partida y declara que KAP aún no ha vivido nada en pantalla", async () => {
    const d = await setup(); await registerKapCanon(d.deps);
    const a = await answerStory(d.storage, "vivido"); expect(a.text).toMatch(/Todavía no hay episodios aprobados/); expect(a.text).toMatch(/millonario gracias a su música/); expect(a.basedOn).toEqual([]);
    expect((await answerStory(d.storage, "terminado")).text).toMatch(/punto de partida del canon inicial/); const b = await answerStory(d.storage, "antes"); expect(b.text).toMatch(/Siguiente hito: Niño con pocos recursos/); expect(b.text).toMatch(/Sin datos todavía[\s\S]*Edad aproximada/);
  });

  it("tres episodios consecutivos: el arco avanza hito a hito y cada estado sale del anterior", async () => {
    const d = await setup(); await registerKapCanon(d.deps);
    await d.mk("e1", 1, E1); await d.approve("e1");
    // ---- contexto para el episodio 2, construido SOLO con el ep. 1 aprobado
    const c2 = await requestContext(d.storage, "Crea el episodio 2 continuando exactamente donde terminó el episodio 1");
    expect(c2.request).toMatchObject({ number: 2, continuesFrom: 1001, exact: true }); const t2 = c2.pack.text;
    expect(t2).toMatch(/Formato de la serie/); expect(t2).toMatch(/Gancho que dejó el ep\. 1[\s\S]*Alguien llama a la puerta/); expect(t2).toMatch(/Etapa actual: «Niño»[\s\S]*2\/17/); expect(t2).toMatch(/Siguiente hito: Víctima de bullying/);
    expect(t2).toMatch(/≈ 8 años/); expect(t2).toMatch(/camiseta gris desgastada/); expect(t2).toMatch(/serio y responsable/); expect(t2).toMatch(/Algún día yo también haré canciones/); expect(t2).toMatch(/KAP ↔ Hermano de KAP: hermanos/); expect(t2).toMatch(/Bullying hacia KAP/);
    await d.mk("e2", 2, E2, "REVIEW", { continuesFrom: 1001 }); const st2 = (await memoryStatus(d.storage, "e2"))!; await proposeMemory(d.deps, "e2");
    expect((await memoryStatus(d.storage, "e2"))!.findings.filter((f) => f.severity === "error")).toEqual([]);
    await d.approve("e2");
    await d.mk("e3", 3, E3, "REVIEW", { continuesFrom: 1002 }); await proposeMemory(d.deps, "e3");
    const s3 = (await memoryStatus(d.storage, "e3"))!; expect(s3.findings.filter((f) => f.severity === "error" || f.severity === "warning").map((f) => f.rule)).toEqual([]);   // coherente: estructura, aportes, duración ≈ 5 min, retoma el gancho
    expect(s3.findings.some((f) => f.rule === "gancho-previo")).toBe(true); void st2;
    await d.approve("e3");

    const canon = await canonUpTo(d.storage), kap = canon.characters["kap"], ms = canon.milestones!;
    expect(ms["nino-con-pocos-recursos"]).toMatchObject({ status: "achieved", achievedIn: 1001 }); expect(ms["victima-de-bullying"]).toMatchObject({ status: "achieved", achievedIn: 1002 }); expect(ms["nino-con-un-sueno"]).toMatchObject({ status: "achieved", achievedIn: 1003 });
    expect(Object.values(ms).filter((m) => m.status === "achieved")).toHaveLength(4); expect(ms["llegada-a-la-cima"].status).toBe("pending"); expect(kap.stage).toBe("nino");
    // evolución a partir de lo anterior: edad, perfil con historial, atributo
    expect(kap.ageHistory!.map((h) => h.value)).toEqual([8, 9]); expect(kap.profile!["suenos"].history.map((h) => h.value)).toEqual(["Quiere ser millonario gracias a su música; los demás no creen en él", "vivir de su música y sacar a su familia de la pobreza"]);
    expect(kap.profile!["situacion-escolar"].history).toHaveLength(2); expect(kap.traits!["esfuerzo"].level).toBe(3); expect(canon.relationships["dani~kap"]).toMatchObject({ relation: "acoso", trust: -2 }); expect(canon.threads["dani-acosa-a-kap"].status).toBe("open");

    // ---- las tres preguntas
    const v = await answerStory(d.storage, "vivido");
    expect(v.basedOn).toEqual(["ep. 1", "ep. 2", "ep. 3"]); for (const t of [/ep\. 1 «Episodio 1»/, /ep\. 2 «Episodio 2»/, /ep\. 3 «Episodio 3»/, /4\/17 hitos logrados; etapa actual «Niño»/, /Pendiente: Adolescente que empieza a tomarse la música en serio/, /≈ 9 años/, /8 años \(ep\. 1\) → 9 años \(ep\. 3\)/, /Dani acosa a KAP/]) expect(v.text).toMatch(t);
    expect(v.text.indexOf("ep. 1 «")).toBeLessThan(v.text.indexOf("ep. 2 «")); expect(v.text.indexOf("ep. 2 «")).toBeLessThan(v.text.indexOf("ep. 3 «"));
    const w = await answerStory(d.storage, "terminado"); expect(w.basedOn).toEqual(["ep. 3"]); expect(w.text).toMatch(/Al terminar el ep\. 3/); expect(w.text).toMatch(/Dani se entera del sueño de KAP/); expect(w.text).toMatch(/Habitación|Un día esto sonará/);
    const b = await answerStory(d.storage, "antes"); expect(b.text).toMatch(/Gancho que hay que retomar: «Dani se entera del sueño de KAP»/); expect(b.text).toMatch(/Siguiente hito: Adolescente que empieza a tomarse la música en serio/); expect(b.text).toMatch(/Edad aproximada: ≈ 9 años/); expect(b.text).toMatch(/Ropa: camiseta gris desgastada/);
    expect(b.text).toMatch(/Sin datos todavía[\s\S]*Apariencia/);
  });

  it("los borradores y lo no aprobado NUNCA aparecen en las respuestas ni en el contexto", async () => {
    const d = await setup(); await registerKapCanon(d.deps); await d.mk("e1", 1, E1); await d.approve("e1");
    await d.mk("e2", 2, E2, "REVIEW", { continuesFrom: 1001 }); await proposeMemory(d.deps, "e2");   // borrador con propuesta, sin aprobar
    const all = [(await answerStory(d.storage, "vivido")).text, (await answerStory(d.storage, "terminado")).text, (await answerStory(d.storage, "antes")).text, (await requestContext(d.storage, "Crea el episodio 3 continuando el episodio 1")).pack.text].join("\n");
    expect(all).not.toMatch(/Dani|bullying a diario|Víctima de bullying.*logrado|ep\. 2 «/); expect((await seriesStatus(d.storage)).arc.achieved).toBe(2);
    const p = (await d.storage.productions.get("e2"))!; await d.storage.productions.save({ ...p, status: "APPROVED" });   // aprobado pero SIN confirmar los cambios de memoria: tampoco es canon
    expect((await answerStory(d.storage, "vivido")).basedOn).toEqual(["ep. 1"]); expect((await canonUpTo(d.storage)).milestones!["victima-de-bullying"].status).toBe("pending");
  });

  it("la cima no se puede alcanzar de golpe: error crítico, salto de años detectado y la etapa «saltada» también", async () => {
    const d = await setup(); await registerKapCanon(d.deps); await d.mk("e1", 1, E1); await d.approve("e1");
    await d.mk("e2", 2, E4_PREMATURE, "REVIEW", { continuesFrom: 1001 }); await proposeMemory(d.deps, "e2"); const f = (await memoryStatus(d.storage, "e2"))!.findings; const rule = (r: string) => f.find((x) => x.rule === r);
    expect(rule("cima-prematura")).toMatchObject({ severity: "error" }); expect(rule("cima-prematura")!.text).toMatch(/Llegada a la cima prematura/); expect(rule("etapa-saltada")).toMatchObject({ severity: "error" }); expect(rule("etapa-saltada")!.text).toMatch(/Adolescente/); expect(rule("salto-de-años")).toMatchObject({ severity: "error" });
    expect((await canonUpTo(d.storage)).milestones!["llegada-a-la-cima"].status).toBe("pending");                // detectado, no aplicado
  });

  it("el arco completo es representable: se pueden contar los 17 hitos de uno en uno y solo entonces el éxito es legítimo", async () => {
    const d = await setup(); await registerKapCanon(d.deps); let n = 0;
    for (const m of KAP_MILESTONES) {
      n++; const stageSwitch = KAP_MILESTONES.findIndex((x) => x.key === m.key) > 0 && KAP_MILESTONES[KAP_MILESTONES.findIndex((x) => x.key === m.key) - 1].stage !== m.stage ? `[etapa: KAP, ${m.stage}]\n` : "";
      const script = `# Escena\nKAP sigue su camino.\nKAP: Seguimos.\n${stageSwitch}[hito-logrado: ${m.title}]\n[evento: ${m.title}]\n${ACTS(["a", "b", "c", "d", "e", "f"])}`;
      await d.mk(`e${n}`, n, script, "REVIEW", n > 1 ? { continuesFrom: 1000 + n - 1 } : {}); await proposeMemory(d.deps, `e${n}`);
      const errs = (await memoryStatus(d.storage, `e${n}`))!.findings.filter((f) => f.severity === "error"); expect(errs, `episodio ${n} (${m.title})`).toEqual([]); await d.approve(`e${n}`);
    }
    const s = await seriesStatus(d.storage); expect(s.arc).toMatchObject({ total: 17, achieved: 17, finished: true, stage: { title: "En la cima" } }); expect((await answerStory(d.storage, "vivido")).text).toMatch(/Arco completo: la serie ha llegado a la cima/);
    expect(n).toBe(17);   // 17 episodios de prueba solo para el test: la serie real NO fija el número de episodios
  });

  it("crear OTROS personajes en el estudio no invalida episodios ya confirmados (regresión del fallo hallado con el pipeline real)", async () => {
    const d = await setup(); await registerKapCanon(d.deps); await d.mk("e1", 1, E1); await d.approve("e1");
    for (const n of ["Ramiro", "Profesora", "Dani2"]) await d.storage.characters.save({ id: `x-${n}`, name: n, description: "", traits: [], voiceNotes: "", referenceAssetIds: [] });   // el pipeline crea personajes al generar el episodio siguiente
    expect((await answerStory(d.storage, "vivido")).basedOn).toEqual(["ep. 1"]); expect((await seriesStatus(d.storage)).arc.achieved).toBe(2);
    const p = (await d.storage.productions.get("e1"))!; await d.storage.productions.save({ ...p, scenes: p.scenes.map((s, i) => (i === 0 ? { ...s, lines: [...s.lines, { text: "Una línea nueva." }] } : s)) });   // cambiar el CONTENIDO sí lo invalida
    expect((await answerStory(d.storage, "vivido")).basedOn).toEqual([]);
  });

  it("«Crea el episodio 7 continuando el 6» se resuelve contra la serie registrada", async () => {
    const d = await setup(); await registerKapCanon(d.deps); await d.mk("e1", 1, E1); await d.approve("e1");
    const r = await createEpisodeFromRequest(d.deps, "Crea el episodio 2 continuando exactamente donde terminó el episodio 1"); expect(r.production.continuesFrom).toBe(1001); expect(r.pack.text).toMatch(/Evolución de KAP hasta ahora/);
  });
});
