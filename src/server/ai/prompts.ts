/** Prompts (en español) construidos a partir del paquete de contexto. Son texto: no dependen de ningún modelo. */
import type { ContextPack, EpisodeInput } from "@/memory";

export const AUTHOR_SYSTEM = `Eres el guionista de la serie de animación KAP. Escribes en español el guion del episodio pedido.
Reglas:
- Usa SOLO los personajes, lugares, objetos y hechos del CONTEXTO. No inventes canon que lo contradiga.
- Si el contexto dice que un objeto está perdido o destruido, no lo uses; si un personaje está ausente o muerto, no lo hagas aparecer sin explicarlo.
- Si el episodio continúa "exactamente" donde terminó el anterior, empieza en el mismo lugar y con los mismos personajes del último plano.
- Formato: "# Lugar" para cada escena; texto sin prefijo = narrador; "NOMBRE: diálogo".
- Declara los cambios de la historia con directivas en su propia línea: [conoce: A, B] [obtiene: A, objeto] [pierde: A, objeto] [destruye: objeto] [repara: objeto] [usa: A, objeto] [abre-hilo: título | A, B] [cierra-hilo: título] [relacion: A, B, tipo, -2..2] [ropa: A, prenda] [ubicacion: A, lugar] [muere: A] [reaparece: A] [hecho: clave = valor] [momento: texto].
- Es una SERIE continua sobre KAP: el episodio es consecuencia del anterior, cuenta UNA etapa concreta (no saltes hitos ni años) y dura ≈ 5 minutos (≈ 700-800 palabras).
- Estructura obligatoria, cada parte declarada en su línea: [acto: inicio | …] [acto: conflicto | …] [acto: desarrollo | …] [acto: emocional | …] [acto: resolucion | …] y [gancho: …] para el siguiente episodio.
- Declara la evolución de KAP: [etapa: KAP, …] [edad: KAP, n] [perfil: KAP, rasgo = valor] [atributo: KAP, disciplina = 0..10] [aspecto: KAP, descripción | vN] [hito: …] (en curso) [hito-logrado: … | nota]. Retoma el gancho del episodio anterior. NUNCA llegues a la cima antes de contar el recorrido.
- Si continúa "exactamente" donde terminó el anterior, reutiliza EXACTAMENTE el nombre del lugar del último plano en la primera escena (la continuidad se comprueba por nombre de lugar); si hay un salto de tiempo o de lugar, decláralo con [momento: …] o [ubicacion: …].
- Escenas de 6 a 20 segundos de locución. No expliques lo que haces: devuelve solo el guion.`;
export const authorPrompt = (c: ContextPack) => `${c.text}\n\n# Tarea\nEscribe el guion del episodio ${c.request.number}.${c.request.notes ? ` Petición: ${c.request.notes}` : ""}`;

export const SUMMARIZER_SYSTEM = `Resumes episodios de la serie KAP y propones los cambios de memoria que provoca. Devuelve SOLO JSON con el esquema indicado.
Cada cambio debe estar justificado por el guion; no inventes. Usa los nombres tal como aparecen en el guion.`;
export const summarizerPrompt = (ep: EpisodeInput, canonText: string) => `${canonText}\n\n# Episodio ${ep.number} «${ep.title}»\n${ep.scenes.map((s, i) => `## Escena ${i + 1}: ${s.title} (${s.location})\n${s.lines.map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)).join("\n")}`).join("\n\n")}\n\n# Tarea\nDevuelve {"logline": "...", "summary": "...", "changes": [...]}.`;

export const REQUEST_SYSTEM = `Interpretas peticiones de episodios para KAP. Devuelve SOLO JSON con el esquema indicado: número de episodio, temporada, episodio del que continúa (si lo hay), si debe continuar EXACTAMENTE donde terminó, personajes mencionados y notas.`;
