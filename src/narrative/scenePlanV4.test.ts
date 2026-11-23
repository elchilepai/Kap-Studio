import { describe, expect, it } from "vitest";
import { planIssues, script, totalSeconds, type Plan } from "./scenePlanV4";
import { planOk, relojChain } from "./scenePlanV4.fixture";

const chain = relojChain(), ids = (p: Plan) => planIssues(p, chain).map((i) => i.id);
const edit = (n: number, o: Partial<Plan["escenas"][number]>): Plan => { const p = planOk(); p.escenas[n - 1] = { ...p.escenas[n - 1], ...o }; return p; };

describe("guion y escenas V4: validación estructural", () => {
  it("un plan de 9 escenas con cadena en orden, reloj en el resultado, escenas sin KAP y voz de KAP no tiene avisos", () => { expect(planIssues(planOk(), chain)).toEqual([]); expect(totalSeconds(planOk())).toBe(38); expect(script(planOk())).toMatch(/Mi amigo corrió/); });
  it("exige 8-10 escenas y 30-45 s", () => { const p = planOk(); expect(ids({ ...p, escenas: p.escenas.slice(0, 6) })).toContain("escenas"); expect(ids(edit(2, { duracion: 7, dialogo: "Mi gráfica parecía un electrocardiograma." }))).not.toContain("duracion"); expect(ids({ ...p, escenas: p.escenas.map((e) => ({ ...e, duracion: 2 })) })).toContain("duracion"); });
  it("exige que cada paso de la cadena tenga escena y que sigan su orden", () => {
    expect(planIssues(edit(6, { cubre: ["conflicto"] }), chain).map((i) => i.msg).join()).toMatch(/ningún escena cubre el paso «decision»|orden de la cadena/);
    const p = planOk(); [p.escenas[2], p.escenas[6]] = [p.escenas[6], p.escenas[2]]; p.escenas.forEach((e, k) => (e.n = k + 1)); expect(planIssues(p, chain).map((i) => i.msg).join()).toMatch(/orden de la cadena/);
  });
  it("detecta escenas intercambiables (el mismo acontecimiento repetido)", () => { expect(ids(edit(5, { queOcurre: "Una mano edita en el reloj los kilómetros de la carrera y cambia un dos por un seis otra vez" }))).toContain("repetida"); });
  it("exige 3-5 escenas sin KAP que expliquen su experiencia, y al menos 3 con KAP", () => {
    expect(ids(edit(4, { kapPresente: true }))).not.toContain("kap"); expect(planIssues(edit(1, { experiencia: "" }), chain).map((i) => i.msg).join()).toMatch(/escena 1 \(sin KAP\)/);
    const todo = planOk(); todo.escenas.forEach((e) => (e.kapPresente = true)); expect(ids(todo)).toContain("kap");
  });
  it("exige variedad real (planos, tipos, cámara) y pocas escenas de KAP hablando o de pura reacción", () => {
    const p = planOk(); p.escenas.forEach((e) => { e.plano = "medium"; e.camara = "zoom-in"; e.tipo = "KAP_PRESENTADOR"; }); expect(ids(p)).toEqual(expect.arrayContaining(["variedad"]));
    const r = planOk(); for (const n of [2, 3, 5]) r.escenas[n - 1].queOcurre = `KAP mira el reloj y respira hondo pensando en lo que ocurre ${n}`; expect(ids(r)).toContain("pasiva");
  });
  it("exige que el objeto participe en ≥5 escenas y aparezca en las dos últimas", () => {
    const p = planOk(); p.escenas.forEach((e) => { e.enPantalla = e.enPantalla.map((x) => x.replace(/reloj/g, "cosa")); e.queOcurre = e.queOcurre.replace(/reloj/g, "cosa"); }); expect(ids(p)).toContain("objeto");
    const q = planOk(); for (const n of [8, 9]) { q.escenas[n - 1].enPantalla = ["KAP", "sendero", "árboles"]; q.escenas[n - 1].queOcurre = "KAP corre cinco kilómetros sin parar por el sendero del parque"; } expect(planIssues(q, chain).map((i) => i.msg).join()).toMatch(/dos últimas escenas/);
  });
  it("valida el gancho (sin fórmulas, sin revelar el desenlace) y la voz (primera persona, sin «KAP» ni segunda persona)", () => {
    expect(ids(edit(1, { dialogo: "¿Qué pasó cuando mi amigo corrió su maratón y yo no?" }))).toContain("gancho"); expect(ids(edit(1, { dialogo: "A veces ver correr a otros cuesta bastante más de lo normal." }))).toContain("gancho");
    expect(planIssues(edit(1, { dialogo: "Terminé corriendo cinco kilómetros sin parar tras borrar los registros." }), chain).map((i) => i.msg).join()).toMatch(/revela el desenlace/);
    expect(planIssues(edit(3, { dialogo: "KAP no quería correr más, quería que pareciera que corría más." }), chain).map((i) => i.msg).join()).toMatch(/tercera persona/); expect(planIssues(edit(3, { dialogo: "Tú no quieres correr más, quieres que parezca que corres más y lo sabes." }), chain).map((i) => i.msg).join()).toMatch(/segunda persona/);
  });
  it("limita el texto en pantalla, exige ≥2 elementos en pantalla y bloquea frases de coach", () => {
    expect(ids(edit(4, { textoEnPantalla: "uno dos tres cuatro cinco seis siete" }))).toContain("pantalla"); expect(ids(edit(4, { enPantalla: ["reloj"] }))).toContain("pantalla"); expect(ids(edit(9, { dialogo: "Debes creer en ti y salir de tu zona de confort cada mañana, recuérdalo siempre." }))).toContain("contenido");
  });
});
