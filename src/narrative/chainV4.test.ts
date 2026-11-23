import { describe, expect, it } from "vitest";
import { CATEGORIES_V4, FIELDS_V4, chainIssues, duplicateChain, truncated } from "./chainV4";
import { chainV4 } from "./chainV4.fixture";

const ids = (o: Parameters<typeof chainV4>[0]) => chainIssues(chainV4(o)).map((i) => i.id);

describe("cadena V4: validación estructural (sin modelo como juez)", () => {
  it("tiene los 9 campos pedidos y 5 categorías de conflicto distintas", () => { expect([...FIELDS_V4]).toEqual(["situacion", "conflicto", "motivo", "accion", "consecuencia", "decision", "nuevaAccion", "resultado", "mentalidad"]); expect(CATEGORIES_V4).toHaveLength(5); });
  it("una cadena corta, completa, con acciones de KAP, objeto con función y mentalidad derivada no tiene avisos", () => { expect(chainIssues(chainV4())).toEqual([]); });
  it("detecta campos truncados a mitad de frase (el fallo de V2/V3: «…Ahora, al» / «ver el camino…»)", () => {
    expect(truncated("KAP ha estado hablando durante meses de que va a cambiar su vida. Ahora, al")).toBe(true); expect(truncated("KAP se levanta y empieza a caminar hacia el centro sin decir nada")).toBe(true); expect(truncated("KAP entrega el archivo sin copia y se va de la oficina.")).toBe(false);
    const r = chainIssues(chainV4({ motivo: "KAP teme que su maqueta parezca pequeña y poco ambiciosa al lado de la" })); expect(r.map((i) => i.id)).toContain("truncado"); expect(r.find((i) => i.id === "truncado")!.field).toBe("motivo");
    expect(ids({ conflicto: "Un conocido publica una maqueta enorme y perfecta y KAP deja de disfrutar la suya con" })).toContain("truncado");
  });
  it("detecta campos demasiado cortos o largos y caracteres que no son del español", () => {
    expect(ids({ decision: "KAP elige ahora." })).toContain("campo-corto"); expect(ids({ resultado: "La maqueta original queda terminada, pequeña y recta, y KAP la coloca en la estantería de su cuarto donde antes estaba la copia torcida que había hecho semanas atrás con tanto cuidado y tanta paciencia por las noches." })).toContain("campo-largo");
    expect(ids({ consecuencia: "La maqueta copiada queda torcida y las piezas引 sobrantes llenan la mesa de trabajo." })).toContain("caracteres");
  });
  it("exige que accion y nuevaAccion sean algo que KAP HACE (no callarse/mirar/pensar) y distintas entre sí", () => {
    expect(ids({ accion: "KAP se queda callado y mira al suelo sin saber qué hacer." })).toContain("accion-kap"); expect(ids({ nuevaAccion: "KAP piensa en lo que ha pasado durante un rato." })).toContain("accion-kap");
    expect(ids({ nuevaAccion: "KAP desmonta la maqueta y copia pieza por pieza el diseño del otro." })).toContain("nueva-accion");
  });
  it("rechaza objetos decorativos o que no participan en la historia (≥3 pasos)", () => {
    expect(ids({ objeto: "mesa" })).toContain("objeto"); expect(ids({ objeto: "el sofá" })).toContain("objeto"); expect(ids({ objeto: "calendario" })).toContain("objeto");
  });
  it("rechaza mentalidades genéricas («A veces», «Debes», «La clave es») y las que no salen de la historia", () => {
    for (const m of ["A veces copiar al otro cuesta semanas de trabajo y mucha energía.", "Debes confiar en tu propio camino y dejar de compararte con otros.", "La clave es no compararse con nadie para avanzar con tu proyecto."]) expect(ids({ mentalidad: m })).toContain("mentalidad");
    expect(ids({ mentalidad: "KAP descubre que la vida es un viaje lleno de aprendizajes sorprendentes." })).toContain("mentalidad");
  });
  it("exige potencial visual (≥3 de los 4 pasos clave son algo que ocurre) y pasos que no se repitan", () => {
    expect(ids({ consecuencia: "KAP se siente mal y mira el suelo con tristeza.", resultado: "KAP respira y se tranquiliza por fin.", nuevaAccion: "KAP piensa en volver a su proyecto original." })).toContain("visual");
    expect(ids({ resultado: "KAP rompe la copia, recupera sus planos originales y reconstruye su barco otra vez." })).toContain("repetida");
  });
  it("bloquea coach genérico y clickbait", () => { expect(ids({ mentalidad: "KAP descubre que debe creer en ti y salir de su zona de confort cada mañana." })).toContain("contenido"); });
  it("detecta cadenas duplicadas (título, objeto, acción, situación, conclusión)", () => {
    expect(duplicateChain(chainV4(), chainV4())).toBeDefined(); expect(duplicateChain(chainV4(), chainV4({ titulo: "Otra historia distinta", objeto: "teléfono", accion: "KAP borra el mensaje que había escrito para su jefe.", situacion: "En la oficina KAP recibe un correo urgente de su jefe un viernes por la tarde.", conflicto: "El correo pide algo imposible y KAP no sabe cómo responder sin quedar mal.", mentalidad: "KAP entiende que contestar rápido no era lo mismo que contestar bien." }))).toBeUndefined();
    expect(duplicateChain(chainV4(), chainV4({ titulo: "Distinta", objeto: "la maqueta", accion: "KAP borra el mensaje que había escrito para su jefe.", situacion: "En la oficina KAP recibe un correo urgente de su jefe un viernes por la tarde." }))).toBe("mismo objeto central");
  });
});
