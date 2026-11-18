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
