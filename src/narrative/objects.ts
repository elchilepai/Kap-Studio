/**
 * OBJETOS DE LOS SHORTS. El objeto central de la historia lo elige Qwen, pero SOLO entre los que el director sabe dibujar y animar (el esquema JSON se lo impone):
 * así nunca se renderiza una historia cuyo objeto principal no existe. Cada objeto tiene su forma, un estado «caído» cuando se vuelca/derrumba, y si se
 * puede montar (bici, monopatín) o sostener en la mano. Un objeto fuera de la lista se detecta ANTES del render (`objectKindFor` → undefined).
 */
export type ShortObjectKind = "cans" | "blocks" | "bike" | "skateboard" | "guitar" | "kite" | "notebook" | "ball" | "paper";
export type ObjectDef = { name: string; kind: ShortObjectKind; /** alias con los que la narración lo nombra (sin tildes) */ re: RegExp; ride?: boolean; fallen?: boolean };
export const OBJECT_LIBRARY: ObjectDef[] = [
  { name: "torre de latas", kind: "cans", re: /\b(?:latas?|torre de latas|torre)\b/, fallen: true },
  { name: "torre de bloques", kind: "blocks", re: /\b(?:bloques?|cubos?|piezas)\b/, fallen: true },
  { name: "bicicleta", kind: "bike", re: /\b(?:bicicleta|bici|ruedines)\b/, ride: true, fallen: true },
  { name: "monopatín", kind: "skateboard", re: /\b(?:monopatin|skate|patineta|tabla)\b/, ride: true, fallen: true },
  { name: "guitarra", kind: "guitar", re: /\b(?:guitarra|acorde|cuerdas?)\b/ },
  { name: "cometa", kind: "kite", re: /\b(?:cometa|papalote)\b/ },
  { name: "cuaderno", kind: "notebook", re: /\b(?:cuaderno|libreta|dibujo)\b/ },
  { name: "pelota", kind: "ball", re: /\b(?:pelota|balon)\b/ },
  { name: "papel", kind: "paper", re: /\b(?:avion de papel|papel|hoja)\b/ },
];
export const SUPPORTED_OBJECTS = OBJECT_LIBRARY.map((o) => o.name) as [string, ...string[]];
const plainName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Objeto declarado → su definición (o undefined si el director no sabe representarlo). Acepta el nombre exacto o un alias. */
export const objectDefFor = (name: string): ObjectDef | undefined => { const n = plainName(name); return OBJECT_LIBRARY.find((o) => plainName(o.name) === n) ?? OBJECT_LIBRARY.find((o) => o.re.test(n)); };
export const objectKindFor = (name: string) => objectDefFor(name)?.kind;
/** Verbos de caída/derrumbe: el objeto pasa a su estado «caído». */
export const FALL = /\b(?:se cae\w*|se caen|cae\w*|se derrumba\w*|se desmorona\w*|se vuelca\w*|vuelca\w*|se tumba\w*|rueda\w* por el suelo|se estrella\w*|derriba\w*|tira\w* (?:la|el|las|los)|choca\w*)\b/;
/** Verbos de montar. */
export const RIDE = /\b(?:se sube\w*|sube a|monta\w*|pedalea\w*|pedaleo|rueda\w* (?:despacio|sin|hasta)|se desliza\w*|avanza\w* (?:con|en|sobre))\b/;
export const DISMOUNT = /\b(?:se baja\w*|baja de|se apea\w*|se detiene\w* (?:junto|al lado)|frena\w*)\b/;
