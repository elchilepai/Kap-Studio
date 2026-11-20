import { describe, expect, it } from "vitest";
import { brokenLinks, causalLink, causalProblem, explainsCause } from "./causal.ts";
import { checkScene } from "./gate.ts";
import { kapRealismCheck, type RealismScene } from "./realism.ts";

const prev = [{ text: "KAP esconde el teléfono en la mochila. Dani lo ve guardarlo desde la esquina.", change: "KAP esconde el teléfono encontrado y Dani lo ha visto", lines: ["KAP esconde el teléfono en la mochila. Dani lo ve guardarlo desde la esquina."], speakers: ["", "KAP", "Dani"], does: "esconde el teléfono en la mochila" }];
const L = (...x: [string, string][]) => x.map(([speaker, text]) => ({ speaker, text }));

describe("cadena causal: lo nuevo sale de lo que acaba de pasar", () => {
  it("teletransporte: un rumor aparece sin que la escena anterior lo provoque → problema en la primera línea (narración)", () => {
    const p = causalProblem({ lines: L(["", "En la escuela todos murmuran un rumor sobre el patio vacío."], ["Estudiante", "Dicen que alguien robó algo del comedor"]), previous: prev, locationChanged: true });
    expect(p?.line).toBe(0); expect(p?.reason).toMatch(/escena anterior terminó con/);
  });
  it("con causa visible (Dani cuenta que KAP guardó el teléfono) no hay problema", () => {
    expect(causalProblem({ lines: L(["", "Dani cuenta en la escuela que KAP guardó un teléfono en la mochila."], ["Estudiante", "¿Qué teléfono? Enséñanoslo"]), previous: prev, locationChanged: true })).toBeUndefined();
  });
  it("personaje nuevo sin antecedente se detecta; si ya había hablado, no", () => {
    expect(causalProblem({ lines: L(["", "Un policía cruza la plaza vacía despacio."], ["Policía", "Tú, el del barrio, ven un momento"]), previous: prev })).toBeDefined();
    expect(causalProblem({ lines: L(["", "El cielo se oscurece sobre la plaza vacía."], ["Dani", "Mira lo que tienes ahí guardado"]), previous: prev })).toBeUndefined();
  });
  it("una escena que continúa sin introducir nada nuevo no se señala (no es una checklist)", () => {
    expect(causalProblem({ lines: L(["", "KAP aprieta la mochila contra el pecho y camina más rápido."], ["KAP", "Tú no viste nada, ¿vale?"]), previous: prev })).toBeUndefined();
  });
  it("consecuencia desconectada de la decisión se señala; la conectada, no", () => {
    expect(causalProblem({ lines: L(["", "Llueve fuerte sobre los columpios del parque."], ["Niño", "Mi pelota es azul y rueda lejos"]), previous: prev, isConsequence: true })).toBeDefined();
    expect(causalProblem({ lines: L(["", "El teléfono vibra dentro de la mochila y Dani levanta las cejas."], ["Dani", "Contéstalo, anda"]), previous: prev, isConsequence: true })).toBeUndefined();
  });
  it("la consecuencia pendiente del arco cuenta como herencia", () => {
    const lines = L(["", "La madre del niño perdido espera junto al portal con cara seria."], ["Madre", "¿Dónde estaba la guardería?"]);
    expect(causalProblem({ lines, previous: prev, locationChanged: true })).toBeDefined();
    expect(causalProblem({ lines, previous: prev, locationChanged: true, pending: "la madre del niño perdido espera enfadada" })).toBeUndefined();
  });
  it("sin escena anterior (primera escena) no hay nada que heredar", () => { expect(causalProblem({ lines: L(["", "Un rumor corre por la calle."]), previous: [] })).toBeUndefined(); });
  it("el secundario que explica la causalidad se detecta", () => {
    expect(explainsCause("Como hiciste eso, ahora todos lo saben")).toBe(true); expect(explainsCause("Por tu culpa me castigan")).toBe(true); expect(explainsCause("Dámelo, que se lo enseño a todos")).toBe(false);
  });
  it("causalLink cuenta raíces compartidas", () => { expect(causalLink("el teléfono sonó", "KAP esconde el teléfono")).toBeGreaterThanOrEqual(1); expect(causalLink("llueve", "teléfono mochila")).toBe(0); });
});

describe("puerta de calidad: sin-antecedente y secundario que explica", () => {
  const scene = (lines: ReturnType<typeof L>, change = "Alguien se entera del teléfono escondido y lo comenta") => ({ lines, change });
  const text = "Dani cuenta a una compañera lo del teléfono guardado en la mochila de KAP durante el recreo largo";
  const mk = (lines: ReturnType<typeof L>, o = {}) => ({ scene: scene(lines), previous: prev, speakers: ["KAP", "Dani", "Estudiante"], memoryOutside: [] as string[], ...o });
  it("rumor de golpe → sin-antecedente (ámbito local, línea 0, no bloquea)", () => {
    const x = checkScene(mk(L(["", "Un rumor recorre toda la escuela sobre algo que pasó en la pizarra."], ["Estudiante", "Dicen que alguien rompió la pizarra"], ["KAP", "Yo no fui a la pizarra, ni siquiera estaba ahí"]), { locationChanged: true })).find((i) => i.kind === "sin-antecedente");
    expect(x).toMatchObject({ scope: "local", blocking: false, lines: [0] });
  });
  it("con antecedente (el teléfono) no se señala", () => { expect(checkScene(mk(L(["", text], ["Estudiante", "¿Un teléfono en la mochila? Enséñamelo ya"], ["KAP", "No es mío, solo lo guardo un rato"]), { locationChanged: true })).map((i) => i.kind)).not.toContain("sin-antecedente"); });
  it("un secundario que explica «como hiciste X, ahora Y» se repara en su línea", () => {
    const i = checkScene(mk(L(["", "Dani se cruza de brazos delante de KAP en el pasillo."], ["Dani", "Como hiciste eso con el teléfono, ahora todos te miran mal"], ["KAP", "Pues que miren, yo me llevo la mochila"]))).find((x) => x.kind === "validacion-moraleja");
    expect(i?.lines).toEqual([1]);
  });
});

describe("KAP_REALISM_CHECK: cadena causal entre escenas", () => {
  const s = (stage: string, text: string, change: string): RealismScene => ({ location: "Calle", stage, lines: [{ speaker: "", text }, { speaker: "KAP", text: stage === "inicio" ? "Vale, vamos allá" : stage === "problema" ? "Qué frío hace aquí" : stage === "escalada" ? "No veo bien nada" : stage === "decision" ? "Me duele un poco" : "Ya me quedo quieto" }], kapDoes: "camina", kapState: stage, change });
  it("una cadena conectada pasa", () => {
    const sc = [s("inicio", "KAP recoge un teléfono en la acera", "KAP tiene el teléfono"), s("problema", "El teléfono suena y Dani lo mira", "Dani quiere el teléfono"), s("escalada", "Dani intenta quitar el teléfono a KAP", "forcejeo por el teléfono"), s("decision", "KAP esconde el teléfono en la mochila", "teléfono escondido"), s("gancho", "Dani cuenta que el teléfono está en la mochila", "alguien lo sabe")];
    expect(kapRealismCheck({ scenes: sc }).checks.find((c) => c.id === "cadena-causal")?.ok).toBe(true);
  });
  it("escenas que aparecen sin apoyo en la anterior fallan", () => {
    const sc = [s("inicio", "KAP recoge un teléfono en la acera", "KAP tiene el teléfono"), s("problema", "Llueve sobre los columpios del parque", "cambia el clima"), s("escalada", "Una vaca cruza la autopista lejana", "animal nuevo"), s("decision", "Los helados se derriten en el mostrador", "helados"), s("gancho", "Suena una campana en la torre", "campana")];
    const r = kapRealismCheck({ scenes: sc }); expect(r.failed).toContain("cadena-causal"); expect(brokenLinks(sc.map((x) => ({ text: x.lines.map((l) => l.text).join(" "), change: x.change, does: x.kapDoes }))).length).toBeGreaterThanOrEqual(2);
  });
  it("sin cambios declarados la comprobación no se hace (total sigue siendo el de antes)", () => { const sc = [s("inicio", "a", ""), s("problema", "b", ""), s("escalada", "c", ""), s("decision", "d", ""), s("gancho", "e", "")].map(({ change: _c, ...x }) => x as RealismScene); expect(kapRealismCheck({ scenes: sc }).checks.some((c) => c.id === "cadena-causal")).toBe(false); });
});
