import { describe, expect, it } from "vitest";
import { FEELING_TELL, THEME_LINES, VALIDATION, explainsTheme, isThoughtOnly, isValidation } from "./show.ts";

describe("KAP muestra más y explica menos", () => {
  it("detecta las frases con las que KAP explica el tema del episodio", () => {
    for (const t of ["No voy a rendirme.", "Este es mi sueño.", "No me importa lo que piensen.", "Alguien tiene que creer en mí... y ese alguien seré yo.", "Mi hermano es más importante que cualquier sueño.", "Tengo que elegir.", "Tengo que elegir entre lo que quiero y mi hermano.", "No sé si sirvo para esto.", "Esto lo hago por mi sueño"]) expect(THEME_LINES.test(t), t).toBe(true);
  });
  it("una frase concreta que podría usar un niño no se marca (ni siquiera «tengo que elegir» cuando elige algo real)", () => {
    for (const t of ["¿Dónde dejaste mi cuaderno, Dani?", "Me comí tu pan, perdón, pensé que era mío", "Tengo que elegir cuál zapato me queda menos roto", "¡Mira, se me rompió la cuerda otra vez!", "Ya sé, le digo a la profe que se me perdió el cuaderno"]) expect(explainsTheme(t), t).toBe(false);
  });
  it("detecta cuando KAP dice lo que siente en vez de hacerlo visible", () => {
    for (const t of ["Estoy nervioso", "Me siento solo", "Estoy muy asustado", "Tengo miedo", "Me da vergüenza"]) { expect(FEELING_TELL.test(t), t).toBe(true); expect(explainsTheme(t)).toBe(true); }
    for (const t of ["Me tiembla la mano, mira", "Dime que no se nota", "Prefiero comer solo, gracias"]) expect(FEELING_TELL.test(t), t).toBe(false);
  });
  it("detecta al secundario que solo valida o enseña", () => {
    for (const t of ["KAP, tienes algo especial.", "Tu música no es solo un sueño, KAP. Es una realidad que puedes construir.", "No permitas que te hagan sentir inferior.", "Yo te apoyo, KAP.", "Voy a ayudarte, KAP.", "Confío en ti.", "No te rindas."]) expect(isValidation(t), t).toBe(true);
    for (const t of ["¿Y esa camiseta, Kap? Es de mi primo.", "Dame el cuaderno o se lo cuento a todos", "No sé qué hacer con esto, de verdad", "Yo quería jugar a las canicas, no a esto"]) expect(VALIDATION.test(t), t).toBe(false);
  });
  it("KAP no es un filósofo pequeño: sentencias de manual se marcan como explicación del tema", () => {
    for (const t of ["A veces, el corazón nos guía mejor que el talento.", "El futuro está en nuestras manos.", "Solo tenemos que creer.", "Todo sueño requiere esfuerzo.", "Hoy aprendí que la familia es lo primero."]) expect(explainsTheme(t), t).toBe(true);
    for (const t of ["Mañana vuelvo a por el cuaderno, que se me quedó en el banco", "A veces me da por rimar cuando tengo hambre, pasa"]) expect(explainsTheme(t), t).toBe(false);
  });
  it("lo que KAP «hace» puede ser solo pensar: pensar, recordar o dudar no es una acción visible", () => {
    for (const d of ["Piensa en su hermano", "Recuerda lo que dijo el rapero", "Duda sin saber qué hacer", "Suspira y mira al cielo", ""]) expect(isThoughtOnly(d), d).toBe(true);
    for (const d of ["Esconde el cuaderno bajo la mochila", "Interrumpe al tendero a mitad de frase", "Prueba a arreglar la cuerda con un chicle y se le pega en el dedo"]) expect(isThoughtOnly(d), d).toBe(false);
  });
});
