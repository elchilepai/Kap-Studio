/**
 * MOSTRAR MÁS Y EXPLICAR MENOS (módulo puro). Detecta cuándo un personaje EXPLICA el tema del episodio o lo que siente en lugar de
 * mostrarlo con una acción, y cuándo un secundario solo VALIDA o enseña a KAP. Son heurísticas léxicas: una frase de estas puede ser
 * natural en una situación concreta, por eso solo se penalizan (reparación local de la línea) y nunca se prohíben a ciegas.
 * Prioridad: ACCIÓN de KAP > REACCIÓN de KAP > DIÁLOGO natural > EXPLICACIÓN.
 */
/** KAP verbaliza el tema o el principio del episodio («no voy a rendirme», «este es mi sueño», «tengo que elegir»…). */
export const THEME_LINES = /no voy a rendirme|no pienso rendirme|no me rendir[eé]|nunca me rendir[eé]|\b(?:este|esto) es mi (?:sue[ñn]o|camino|m[uú]sica|voz)\b|no me importa (?:lo que|qu[eé]) (?:piensen|digan|hagan|crean)|alguien tiene que creer en m[ií]|(?:es|eres|son) m[aá]s importante(?:s)? que cualquier|\btengo que elegir(?=\s*(?:[.…!,;]|$|entre\b))|\bno s[eé] si (?:sirvo|valgo|soy capaz|sirve para)|(?:lo|esto lo) hago por mi sue[ñn]o|no (?:voy a )?dejar[eé]? que nadie me quite mi sue[ñn]o|mi sue[ñn]o no est[aá] tan lejos|solo (?:necesito|quiero) que me escuchen|ese alguien ser[eé] yo|\ba veces,? el coraz[oó]n(?![a-záéíóú])|el futuro (?:no es solo|est[aá] en (?:nuestras|mis) manos)|solo (?:tenemos|tengo) que creer|todo sue[ñn]o requiere|\bhoy aprend[ií](?![a-záéíóú])/i;
/** KAP dice lo que siente en vez de hacerlo visible («estoy nervioso», «me siento solo», «tengo miedo»). */
export const FEELING_TELL = /\b(?:estoy|me siento|siento) (?:muy |tan |un poco |medio )?(?:nervios[oa]|asustad[oa]|triste|feliz|solo|sola|confundid[oa]|perdid[oa]|frustrad[oa]|emocionad[oa]|enfadad[oa]|con miedo|con rabia|mal)\b|\bten[gi]o (?:miedo|rabia|nervios|verg[uü]enza)\b|\bme da (?:miedo|verg[uü]enza|rabia|pena)\b/i;
/** Un secundario solo valida, anima o enseña («tienes algo especial», «no permitas que…», «yo te apoyo», «voy a ayudarte»). */
export const VALIDATION = /tienes algo especial|\b(?:tu|su) m[uú]sica no es solo|es una realidad que puedes|\bno permitas que\b|\bno dejes que (?:te|nadie)\b|conf[ií]o en ti|creo en ti|yo te apoyo|(?:voy|vamos) a ayudarte|\b(?:puedes|podr[aá]s) lograrlo\b|tienes (?:mucho )?(?:talento|potencial)|est[aá] orgullos[oa]|\blo siento,? kap\b|\bsiempre (?:estar[eé]|estar[aá]) (?:a tu lado|contigo)|(?:la )?m[uú]sica es (?:tu|su) (?:salida|camino|futuro)|no te rindas/i;
export const explainsTheme = (t: string) => THEME_LINES.test(t) || FEELING_TELL.test(t);
export const isValidation = (t: string) => VALIDATION.test(t);
/** Lo que KAP «hace» en una escena es solo pensar, recordar o dudar (no es una acción visible). */
export const THOUGHT_ONLY = /\b(?:piensa|pensando|pensar|reflexiona|reflexionar|se pregunta|preguntarse|recuerda|recordando|medita|duda|dudando|suspira|se siente|siente que|no sabe qu[eé] hacer|mira (?:al|el|hacia el) (?:cielo|horizonte))\b/i;
export const isThoughtOnly = (does: string) => !does.trim() || THOUGHT_ONLY.test(does);
