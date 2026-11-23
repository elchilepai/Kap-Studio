import type { Chain } from "./chainV4";
/** Cadena de ejemplo bien formada (frases cortas y completas, objeto con función narrativa). */
export const chainV4 = (o: Partial<Chain> = {}): Chain => ({
  category: "comparacion", titulo: "La maqueta que cambió de forma", objeto: "maqueta",
  situacion: "KAP construye una maqueta de un barco y publica fotos de su avance cada semana.",
  conflicto: "Un conocido publica una maqueta enorme y perfecta, y KAP deja de disfrutar la suya.",
  motivo: "KAP teme que su maqueta parezca pequeña y poco ambiciosa al lado de la otra.",
  accion: "KAP desmonta la maqueta y copia pieza por pieza el diseño del otro.",
  consecuencia: "La maqueta copiada queda torcida y las piezas sobrantes llenan la mesa de trabajo.",
  decision: "Al ver la maqueta torcida junto a sus planos viejos, KAP debe elegir cuál conservar.",
  nuevaAccion: "KAP rompe la copia, recupera sus planos originales y reconstruye su barco.",
  resultado: "La maqueta original queda terminada, pequeña y recta, y KAP la coloca en la estantería.",
  mentalidad: "KAP descubre que copiar la maqueta del otro le costó semanas y que la suya era mejor.",
  ...o,
});
