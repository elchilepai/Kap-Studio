# Generador narrativo de KAP Studio (arco → escenas)

La IA nunca controla el motor de animación ni se salta el esquema, la IR, la memoria, la continuidad o la aprobación del usuario.
Usuario → IA → **arco dramático** → escenas → IR validada → memoria → continuidad → animación 2D → render.

## Modos de autor (`KAP_AUTHOR_MODE`)
| Modo | Qué hace |
|---|---|
| `arc` (por defecto) | 1) El modelo diseña el arco (problema, escalada, decisión de KAP, consecuencia, resolución, gancho, desenlace) como JSON validado. 2) Cada beat se convierte en UNA escena (una llamada por escena, viendo el arco y lo ya escrito). |
| `json` | Borrador de todas las escenas de una pasada (+ una ampliación si queda corto). Es el generador anterior; sigue disponible. |
| `text` | Guion en texto libre. |

Cambiar de modelo es solo configuración (`KAP_LLM_MODEL`); `LlmClient` es lo único que conoce a Ollama.

## Qué impone el generador por arco
- Cada escena tiene función (avanzar, desarrollar personaje, conflicto, revelar, preparar consecuencia, arco de KAP, preparar gancho).
- Los actos y el gancho de memoria los fija el código desde el arco; las directivas inválidas del modelo se descartan y se cuentan.
- El orden de las etapas se repara en código; solo la falta de una etapa rechaza el arco.
- Reparto por defecto = KAP + lo que pide la petición + último plano si continúa «exactamente». El resto de la memoria no se reutiliza por defecto.
- El desenlace se elige por episodio (victoria parcial, derrota, sin solución, amargo, ambiguo): no hay fórmula de superación.
- Plano, momento del día e interior/exterior por escena (`[plano]`, `[mood]`) y acciones 2D del vocabulario cerrado (validadas con `parseDirection`).
- La duración no se rellena: un episodio corto genera un aviso, nunca una ampliación.

## Revisión narrativa (`src/narrative/review.ts`)
Heurísticas sin IA que **avisan y no bloquean** (se muestran aparte de la continuidad): escena repetida, bucle (crítica), diálogo duplicado, localización estancada, escena sin aporte, escenas fragmentadas, personaje sin función, memoria no pedida, sin conflicto, sin consecuencia, gancho genérico, diálogo motivacional, cierre moralizante, ayuda externa, poca variedad visual. No miden calidad literaria ni comprueban que cada personaje tenga voz propia.

## Resultados medidos (CPU 4 vCPU / 16 GB, Qwen3-14B, contexto 8192; ver `docs/ia-bench/`)
Resumen y comparación: `docs/ia-bench/` (ficheros `*-blind2-*.json`; `arc-v1/` conserva el primer intento del arco, que reutilizaba en exceso la memoria).

## Planificación por secuencias (idea → arco → secuencias → beats visuales → escenas → diálogo)
El arco ya no se planifica como «8 beats»: el modelo declara **`sequences`** (4–12, las que pida la historia). Cada secuencia es un tramo con una función clara y se convierte en **una escena**:
`purpose` (qué aporta), `stage`, `location`, `time`, `characters`, `beats` (acontecimientos VISIBLES en orden, no reflexiones), `change` y, opcionalmente, `shot` y `talk` (`ninguno|poco|normal`: una escena puede contarse sin diálogo).
`sequenceToBeat` las convierte al beat que ya consume el generador de escenas (sin llamadas nuevas al modelo); el encargo de la escena lleva `acontecimientos` y `dialogo`. El formato anterior (`beats`) sigue aceptándose.
Con secuencias solo se exigen las etapas `inicio` y `gancho` (una escena silenciosa o una historia de origen no tiene por qué tener «decisión» ni «consecuencia»). El **piloto** (episodio 1 sin episodios previos, o «piloto» en la petición) usa una planificación de ORIGEN por fases y no exige el coste de una decisión.
La puerta de calidad añade `conversacion-estatica` (la misma conversación que la escena anterior sin que ocurra nada → se regenera dentro del tope general). El director deduce de la narración «se acerca/se aleja», «esconde/guarda/se quita…» además de las poses de acción.

## Narración ≠ diálogo, acting y espacios (render)
- **Narración = dirección, no texto.** Las líneas sin hablante describen lo que se ve y dirigen la animación; **no** se subtitulan ni se pronuncian. Solo el diálogo (un personaje que habla) lleva subtítulo y voz. `src/narrative/lines.ts` normaliza antes de la voz y los subtítulos: una acción a nombre de un personaje, «KAP: KAP:», «VACÍO:», paréntesis y incisos («—murmura—») pasan a narración o se limpian.
- **Línea de tiempo común** (`src/server/studio/timeline.ts`): diálogo + acciones en orden; cada acción reserva su momento (≈1,5 s por cláusula) y la voz deja silencio. La misma línea de tiempo alimenta voz, subtítulos y director.
- **Acting a partir de la narración** (director): fases (se gira → anticipación → acción → llegada/frenado → reacción), sobresalto ante un sonido, expresiones (miedo, vergüenza, confusión, curiosidad, alivio, incomodidad, aburrimiento), objetos en la mano o en el suelo (teléfono, mochila, cuaderno, auriculares, maleta, pelota, papel, silla), cámara con función (empuje al llegar información, corte a la reacción, seguimiento al caminar). Sin verbo de acción en la narración no se inventa movimiento. La IR no cambia (poses, expresiones y objetos son internos de la animación).
- **Decorados**: dormitorio, salón, cocina y pasillo con su mobiliario; patio doméstico; hora del día (mañana/tarde/atardecer/noche) mandada por el guion.

## Ritmo: acciones continuas, aire muerto, repeticiones y sonido
- **Sin «1,5 s por cláusula».** `src/narrative/action.ts` modela la narración como acciones CONTINUAS: cada paso (postura, locomoción, manipular, mirar, reaccionar…) tiene su duración típica y el siguiente arranca ANTES de que acabe el anterior (solape). La duración de una acción y de la escena sale de ahí y de la distancia real, no de contar frases.
- **Aire muerto** (`src/animation/pacing.ts`): un tramo de ≥ 3 s sin diálogo, acción, reacción, cámara ni sonido se detecta. El director lo llena con función (mirada, expresión, asentamiento, cámara que se acerca despacio, ambiente) sin acelerar nada. En el guion, `aire-muerto` señala escenas sin diálogo cuya narración solo describe.
- **Repeticiones**: `mismo-momento` (misma escena en el mismo lugar con los mismos personajes y nada nuevo → se regenera y, si no cambia, se elimina), `accion-repetida` (se quita en código) y fusión de beats repetidos del arco. Prefiere 6 escenas buenas a 10 con relleno.
- **Acting continuo**: escuchar (se queda quieto, levanta la cabeza y la gira hacia la fuente) ≠ asustarse (sobresalto); caminar con aceleración y frenado, anticipación al correr, asentamiento al llegar; cámara por prioridad (reacción > información/fuente > seguimiento > momento emocional).
- **Sonido con función**: puerta, golpe, llamada, pasos y ambiente se sintetizan con FFmpeg (`src/server/studio/sfx.ts`) a partir de lo que cuenta la narración.

## SHORT MODE (Shorts verticales de YouTube/TikTok)

Variante del flujo, no un parche del episodio: `hints.mode = "short"` (registro de IA → `withShortMode`) y `createEpisodeFromRequest(deps, texto, { mode: "short" })`, que crea una producción `kind: "short"` con numeración propia («Short N»). Vertical 1080×1920, 30 fps (`dimensions("9:16","1080p")`).

- **Un solo plan por beats** (`src/server/ai/short.ts`, prompt `SHORT_SYSTEM`): UNA llamada al modelo devuelve la historia entera como 6-16 beats (objetivo, acción visible, reacción, cambio, segundos, plano, sonido, música, diálogo solo si aporta). Fases: hook → contexto → escalada → giro → remate. La duración es la suma de los beats (ideal 50-65 s, rango 45-75).
- **SHORT_RETENTION_CHECK** (`src/narrative/short.ts`, sin modelo): 12 comprobaciones (gancho, problema rápido, acción antes de explicar, cambios, escalada, giro, remate sin moraleja, repetidos, prescindibles, tramos solo diálogo, predecible, duración justa). Reparación en código (fusionar repetidos, quitar prescindibles; nunca hook/giro/remate) y, como mucho, UNA reescritura local de gancho/giro/remate.
- **Beats → guion**: la escena de producción es el decorado (beats vecinos con mismo lugar/hora se agrupan); acción y reacción = narración invisible, diálogo = lo único que se dice; directivas `plano:`, `camara: seguir`, `sonido:`, `musica: inicio|cambio|fin`, `impacto:`, `silencio:` con tiempo. Las cuatro últimas son solo del director (`parseDirection` las ignora sin aviso; la IR no cambia; `StageSpec.music` y `StageSpec.sounds`).
- **Director** (`short: true`, solo Shorts propios): sin relleno de aire muerto ni empuje lento por defecto.
- **Dirección creativa de los Shorts** (`SHORT_SYSTEM`): línea de vida (dudas y problemas cotidianos), pregunta abstracta → situación concreta, reflexión que sale de lo que ocurre (nadie dice la moraleja), cuerpo antes que palabras, reacciones variadas, final corto, ritmo vivo, música marcada por beats.
- **Movimiento continuo** (`StageSpec.flow`, solo Shorts): las poses se funden entre sí (también al volver a reposo), la marcha tiene anticipación, aceleración inclinada y frenada sin salto de zancada; reacciones `shrink`/`droop`/`tense` desde la narración; en los diálogos quien escucha gira, atiende y reacciona a preguntas/exclamaciones, y quien habla largo rato cambia de peso.
