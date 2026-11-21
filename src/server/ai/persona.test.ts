import { describe, expect, it } from "vitest";
import { ARC_SYSTEM, KAP_PERSONALITY, PATCH_SYSTEM, SCENE_SYSTEM } from "./prompts";

describe("capa de personalidad de KAP en los prompts", () => {
  it("entra en el arco y en las escenas (y en los parches de línea), no se pega entera en cada llamada auxiliar", () => {
    expect(ARC_SYSTEM).toContain(KAP_PERSONALITY); expect(SCENE_SYSTEM).toContain(KAP_PERSONALITY); expect(PATCH_SYSTEM).toMatch(/introvertido y observador/);
    expect(PATCH_SYSTEM).not.toContain(KAP_PERSONALITY);
  });
  it("recoge los rasgos pedidos: introvertido, observador, calla, reacciona con el cuerpo, solo, oculta, se deja influir, humor seco, hermano, consecuencias", () => {
    for (const re of [/introvertido/, /observador/, /quedarse callado/, /primero con el cuerpo/, /SOLO/, /oculta/, /se deja influir/, /absurdo y seco/, /NO bromea/, /no es filósofo, coach ni narrador/, /hermano pequeño es lo más importante/, /protector|protegiéndolo/, /consecuencias de lo que hace, nunca por una moraleja/, /2Pac/, /MUESTRAN con acciones, silencios/]) expect(KAP_PERSONALITY, String(re)).toMatch(re);
  });
  it("son rasgos, no un checklist: lo dice expresamente y no obliga a nada «en cada episodio»", () => {
    expect(KAP_PERSONALITY).toMatch(/no beats obligatorios/); expect(KAP_PERSONALITY).toMatch(/no exigen un silencio, un error o una broma en cada episodio/); expect(KAP_PERSONALITY).not.toMatch(/(?:siempre|debe|tiene que) (?:haber|incluir|meter)/i);
  });
  it("no contradice lo que ya funciona: conserva acción → reacción → consecuencia → nuevo intento y la prioridad de la personalidad sobre las conductas sueltas", () => {
    expect(KAP_PERSONALITY).toMatch(/acción → reacción → consecuencia → nuevo intento/); expect(KAP_PERSONALITY).toMatch(/manda esta personalidad/);
    expect(SCENE_SYSTEM).toMatch(/Reacciona primero con el cuerpo|REACCIONA PRIMERO CON EL CUERPO/); expect(SCENE_SYSTEM).toMatch(/CADENA CAUSAL/);
  });
  it("es compacta (no es la biblia entera)", () => { expect(KAP_PERSONALITY.length).toBeLessThan(2400); });
});
