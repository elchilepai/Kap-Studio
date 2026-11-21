import { describe, expect, it } from "vitest";
import { looksLikeNarration, normalizeLine, normalizeLines, stripSpeakerEcho } from "./lines.ts";
import { parseScript } from "../server/studio/script.ts";

const known = ["KAP", "Hermano de KAP", "Dani"];
const dlg = (speaker: string, text: string) => normalizeLine({ speaker, text }, known);

describe("narración ≠ diálogo", () => {
  it("«KAP: KAP: hola» se presenta como «KAP: hola»", () => {
    expect(dlg("KAP", "KAP: hola, ¿me oyes?")).toEqual({ speaker: "KAP", text: "hola, ¿me oyes?" }); expect(dlg("HERMANO DE KAP", "HERMANO DE KAP: ¿Qué fue eso?")).toEqual({ speaker: "HERMANO DE KAP", text: "¿Qué fue eso?" });
    expect(stripSpeakerEcho("KAP", "KAP: KAP: KAP: vale")).toBe("vale");
  });
  it("nada de «VACÍO:», «NARRADOR:» ni etiquetas que no son personajes: la línea es narración sin hablante", () => {
    expect(dlg("VACÍO", "La luz del amanecer entra por la ventana.")).toEqual({ text: "La luz del amanecer entra por la ventana." });
    for (const x of ["NARRADOR", "ACCIÓN", "SONIDO", "Silencio", "NADIE", "MÚSICA"]) expect(dlg(x, "Se oye un portazo al fondo del pasillo.")?.speaker, x).toBeUndefined();
    expect(dlg("EL HERMANO DE KAP SE ACERCA A LA VENTANA", "Mira por ella.")?.speaker).toBeUndefined();   // un «nombre» que es una frase
  });
  it("una acción a nombre de un personaje es narración (no subtítulo ni voz)", () => {
    expect(dlg("KAP", "KAP cierra los ojos con fuerza y se queda inmóvil, mirando al suelo.")).toEqual({ text: "KAP cierra los ojos con fuerza y se queda inmóvil, mirando al suelo." });
    expect(dlg("KAP", "El hermano se acerca a la ventana y mira también hacia el pasillo.")?.speaker).toBeUndefined();
    expect(dlg("KAP", "Solo observa, con la mirada fija en el lugar donde estuvieron sus padres.")?.speaker).toBeUndefined();
    expect(dlg("KAP", "(Mira a su hermano con seriedad y coge el teléfono con las dos manos.)")).toEqual({ text: "Mira a su hermano con seriedad y coge el teléfono con las dos manos." });
    expect(dlg("HERMANO DE KAP", "Su hermano lo observa, expectante.")?.speaker).toBeUndefined();
  });
  it("el diálogo real NO se toca (preguntas, exclamaciones, primera persona, vocativos, frases cortas)", () => {
    for (const [s, t] of [["KAP", "¿Qué fue eso?"], ["KAP", "¡Espera!"], ["KAP", "No sé… quédate aquí conmigo."], ["KAP", "KAP, ¿me oyes?"], ["KAP", "Me quedo aquí."], ["KAP", "Ven aquí."], ["HERMANO DE KAP", "¿Dónde está papá?"], ["KAP", "Dani se fue ya, ¿no?"], ["KAP", "Mira, es el de la tele."], ["DANI", "Tú no te mueves de aquí."]] as const)
      expect(dlg(s, t), `${s}: ${t}`).toEqual({ speaker: s, text: t });
    expect(looksLikeNarration("KAP, ¿me oyes? Dime algo, por favor.", known)).toBe(false);
  });
  it("las líneas vacías se descartan y la narración sin hablante se conserva", () => {
    expect(normalizeLines([{ speaker: "KAP", text: "   " }, { text: "Se oye un portazo." }, { speaker: "KAP", text: "¿Qué fue eso?" }], known)).toEqual([{ text: "Se oye un portazo." }, { speaker: "KAP", text: "¿Qué fue eso?" }]);
  });
  it("al leer un guion, ningún hablante es «VACÍO» ni una acción, y no hay «KAP: KAP:» (en ninguno de los dos analizadores)", () => {
    const script = "# Habitación\nKAP: KAP: ¿Qué fue eso?\nVACÍO: El hermano se acerca a la ventana y mira hacia el pasillo.\nKAP: KAP cierra los ojos con fuerza y se queda inmóvil, mirando al suelo.\nHERMANO DE KAP: No sé… ¿vamos a ver?\nKAP: (Se levanta despacio.)";
    const lines = parseScript(script, [{ id: "1", name: "KAP" }, { id: "2", name: "Hermano de KAP" }])[0].lines;
    expect(lines.map((l) => l.speaker ?? "")).toEqual(["KAP", "", "", "Hermano de KAP", ""]);   // solo dos frases habladas
    expect(lines.map((l) => l.text).join(" ")).not.toMatch(/KAP: KAP|VACÍO|\(|\)/); expect(lines[0].text).toBe("¿Qué fue eso?");
  });
});
