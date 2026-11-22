import type { ShortBeat } from "./short";

export const B = (phase: ShortBeat["phase"], action: string, o: Partial<ShortBeat> = {}): ShortBeat => ({ phase, goal: `quiere ${action.split(" ").slice(-2).join(" ")}`, action, reaction: "", change: `cambia ${action}`, seconds: 5, shot: "medio", characters: ["KAP"], location: "Salón", time: "tarde", ...o });
/** Short sano de ≈ 56 s: gancho con acción, problema pronto, tres intentos distintos, giro, remate visual. */
export const good = (): ShortBeat[] => [
  B("hook", "KAP tira el vaso y la leche cae sobre el mando de la consola", { seconds: 3, shot: "objeto", sound: "bump", music: "impact", change: "la consola chispea" }),
  B("contexto", "KAP mira el mando mojado y esconde el vaso bajo el sofá", { seconds: 5, reaction: "El hermano entra corriendo por la puerta", change: "el hermano llega y quiere jugar", location: "Salón" }),
  B("escalada", "KAP seca el mando con su camiseta y lo lleva a la cocina", { seconds: 6, location: "Cocina", change: "el mando sigue sin encender", goal: "secar el mando" }),
  B("escalada", "KAP mete el mando en un bol de arroz y cierra la tapa", { seconds: 6, location: "Cocina", reaction: "El hermano abre la tapa y lo saca", change: "el hermano descubre el arroz", goal: "esconder la evidencia en arroz" }),
  B("escalada", "KAP corre al pasillo y coge el mando viejo del armario", { seconds: 6, location: "Pasillo", sound: "steps", change: "aparece un mando antiguo", goal: "buscar un mando de repuesto" }),
  B("escalada", "KAP pega el mando viejo con cinta y lo deja en la mesa", { seconds: 6, location: "Salón", reaction: "El hermano lo coge y aprieta un botón", change: "el mando viejo funciona a medias", goal: "que nadie note el cambio" }),
  B("giro", "El hermano gira la pantalla y KAP ve la mancha de leche en el televisor", { seconds: 6, shot: "primer plano", change: "el televisor también está mojado", music: "change" }),
  B("remate", "El televisor se apaga con un chasquido y el hermano señala el vaso bajo el sofá", { seconds: 6, shot: "general", sound: "bump", dialogue: { speaker: "Hermano de KAP", text: "Eso no era mío." }, change: "todos lo saben", music: "silence" }),
  B("remate", "KAP se sienta en el suelo y le da el mando roto al hermano", { seconds: 6.5, reaction: "El hermano lo guarda en su mochila", change: "KAP paga el castigo", location: "Salón" }),
];
