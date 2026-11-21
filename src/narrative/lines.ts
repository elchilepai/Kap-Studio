/**
 * NARRACIÓN ≠ DIÁLOGO (módulo puro). Una línea de guion es o bien DIÁLOGO (un personaje habla: voz y subtítulo) o bien NARRACIÓN/DIRECCIÓN
 * (describe lo que se VE y dirige la animación: ni subtítulo ni voz). El modelo a veces mezcla ambas: pone una acción a nombre de un
 * personaje («KAP: KAP cierra los ojos…»), repite el nombre («KAP: KAP: hola») o inventa un hablante («VACÍO:»). Aquí se normaliza ANTES de
 * llegar a la voz y a los subtítulos: lo que no es una frase hablada pasa a narración (sin hablante).
 */
export type RawLine = { speaker?: string; text: string };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Etiquetas que NO son personajes (narrador, acción, vacío…): la línea es narración. */
export const NON_CHARACTER = /^(?:vac[ií]o|narrador[a]?|narraci[oó]n|acci[oó]n|escena|fin|nota|sonido|sfx|m[uú]sica|c[aá]mara|descripci[oó]n|silencio|nadie|texto|subt[ií]tulo|voz en off|ambiente|todos|ninguno|n\/a|\.+|-+)$/i;
const ROLES = "hermano|hermana|padre|madre|padres|vecino|vecina|profesor|profesora|ni[nñ]o|ni[nñ]a|chico|chica|abuelo|abuela|tendero|tendera|amigo|amiga";
/** Marcas de acción descrita en tercera persona (no de algo que se dice en voz alta). */
const ACTION_MARK = /\b(?:con (?:la|una|los|las) (?:mirada|expresi[oó]n|voz|manos?)|se (?:queda|levanta|acerca|aleja|detiene|gira|vuelve|sienta|agacha|inclina|marcha)\b|mira (?:a su|hacia|al suelo|fijamente|por la)|sin (?:decir|hacer) (?:nada|ruido|una palabra))/i;
const FIRST_PERSON = /\b(?:yo|me|mi|mis|m[ií]o|m[ií]a|estoy|soy|tengo|quiero|voy|vamos|nos|conmigo|t[uú]|te|tu|tus|contigo)\b/i;

/** Quita el nombre del hablante repetido al principio del texto («KAP: KAP: hola» → «hola»). */
export function stripSpeakerEcho(speaker: string, text: string): string {
  const re = new RegExp(`^(?:${esc(speaker)}\\s*:\\s*)+`, "i"); return text.replace(re, "").trim() || text.trim();
}

/** ¿El texto describe una acción en tercera persona (narración) en vez de algo que dice el personaje? */
export function looksLikeNarration(text: string, known: string[] = []): boolean {
  const t = text.trim(); if (!t) return false;
  if (/^[(\[].*[)\]][.\s]*$/.test(t) || (/^[(\[]/.test(t) && /[)\]]/.test(t) && !/[?!¿¡]/.test(t.replace(/^[(\[][^)\]]*[)\]]/, "")))) return true;   // (acotación entre paréntesis)
  if (/[¿¡]/.test(t) || /["«“]/.test(t)) return false;   // pregunta, exclamación o cita: se dice en voz alta
  const names = [...known.map((k) => esc(k.trim())).filter(Boolean), `(?:el|la|los|las|su|sus)\\s+(?:${ROLES})(?:\\s+(?:peque[ñn]o|peque[ñn]a|mayor))?(?:\\s+de\\s+kap)?`, "kap"].join("|");
  const subject = new RegExp(`^(?:${names})\\s+(?![,:;])(?:(?:se|lo|la|le|los|las)\\s+)?([a-záéíóúñ]{3,})`, "i").exec(t);
  if (subject && /^[a-záéíóúñ]/.test(subject[1]) && t.length >= 28) return true;   // «KAP cierra los ojos…», «El hermano se acerca…» (no «KAP, ¿me oyes?»)
  return ACTION_MARK.test(t) && !FIRST_PERSON.test(t);                              // «Solo observa, con la mirada fija…»
}

/** Normaliza UNA línea: devuelve diálogo (con hablante) o narración (sin hablante); descarta las vacías. */
export function normalizeLine(l: RawLine, known: string[] = []): RawLine | undefined {
  let text = (l.text ?? "").replace(/\s+/g, " ").trim(); let speaker = (l.speaker ?? "").replace(/:\s*$/, "").trim();
  if (speaker) { text = stripSpeakerEcho(speaker, text); if (NON_CHARACTER.test(speaker) || speaker.split(/\s+/).length > 4 || /[()\[\]]/.test(speaker)) speaker = ""; }
  if (speaker) text = text.replace(/\s*—\s*(?=[^—]{2,90}—)([^—]*(?:murmur\w*|susurr\w*|\bdice\b|\bgrit\w*|responde|pregunta|exclama|agarr\w*|\bmir\w*|\bcoge\w*|\w+(?:ando|iendo)\b)[^—]*)—\s*/gi, " ").replace(/\s+([.,!?…])/g, "$1").replace(/\s{2,}/g, " ").trim() || text;   // incisos de narración dentro de la frase («Vamos —murmura, agarrándolo—.»)
  if (speaker && looksLikeNarration(text, known)) speaker = "";
  if (!speaker) text = text.replace(/^[(\[]\s*/, "").replace(/\s*[)\]]\s*(?=[.!?]?$)/, "").replace(/^[)\]]\s*/, "").replace(/\s+[)\]]\s*$/, "").trim();
  if (!text) return undefined;
  return speaker ? { speaker, text } : { text };
}
export const normalizeLines = (lines: RawLine[], known: string[] = []): RawLine[] => lines.flatMap((l) => { const n = normalizeLine(l, known); return n ? [n] : []; });
export { plain as _plain };
