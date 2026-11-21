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
  it("la narración es DIRECCIÓN (no subtítulo ni voz) y el diálogo es corto y funcional", () => {
    expect(SCENE_SYSTEM).toMatch(/LA NARRACIÓN ES DIRECCIÓN, NO TEXTO/); expect(SCENE_SYSTEM).toMatch(/no se muestran ni se dicen en voz alta/); expect(SCENE_SYSTEM).toMatch(/nunca una acción a nombre de un personaje/); expect(SCENE_SYSTEM).toMatch(/una escena puede tener cero líneas habladas/);
  });
  it("una escena es una pequeña secuencia con intención, el silencio tiene función y se prefieren menos escenas buenas", () => {
    expect(SCENE_SYSTEM).toMatch(/UNA ESCENA ES UNA PEQUEÑA SECUENCIA: INTENCIÓN → ACCIÓN → REACCIÓN → CAMBIO/); expect(SCENE_SYSTEM).toMatch(/El silencio tiene función/); expect(SCENE_SYSTEM).toMatch(/KAP no explica lo que hace/); expect(SCENE_SYSTEM).toMatch(/Los objetos sirven para contar/);
    expect(ARC_SYSTEM).toMatch(/6 secuencias buenas a 10 con relleno/); expect(ARC_SYSTEM).toMatch(/nunca se añaden secuencias para alargar/); expect(ARC_SYSTEM).toMatch(/no pueden ser el mismo momento/);
  });
});
