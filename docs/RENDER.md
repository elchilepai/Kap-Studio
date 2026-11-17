# Motor de renderizado (Fase C)

Todo local con FFmpeg, sin servicios de pago. Estado: **subfases A y B completadas**. La producción automática (episodio → vídeo + Shorts) está en `docs/PRODUCCION-AUTOMATICA.md`.

## Arquitectura
```
UI /render ──server actions──▶ render_jobs (SQLite) ◀──claim atómico── RenderQueue (worker, instrumentation.ts)
                                                                         │ concurrencia N, latido, reintentos, cancelación
                                                                         ▼
                                                              Executor ──▶ runFfmpeg (spawn sin shell, progreso real)
                                                                         ▼
                                                        data/tmp/render-<id>/  ──validación ffprobe──▶ data/media/<asset>.mp4
```
| Pieza | Archivo | Responsabilidad |
|---|---|---|
| Ejecutor FFmpeg | `src/server/render/ffmpeg.ts` | `spawn` con argumentos en array (sin inyección), prioridad baja, progreso real (`-progress pipe:1`), cancelación SIGTERM→SIGKILL, errores reintentables vs deterministas, `ffprobe` con `-protocol_whitelist file`, detección de capacidades |
| Presets | `presets.ts` | 16:9 y 9:16 en 480p/720p/1080p; H.264 High + AAC 192k 48 kHz + `+faststart`, `yuv420p` |
| Tarjeta | `slate.ts` | Render real de una tarjeta de título KAP (textos vía `textfile`, nunca interpolados). Será la escena de relleno en la subfase B |
| Cola | `queue.ts` | Worker con concurrencia limitada, latido, tiempo máximo, reintentos con espera creciente, cancelación, apagado limpio |
| Recursos | `resources.ts` | Comprobación de espacio libre, limpieza de temporales huérfanos, movimiento atómico |
| Almacén | `src/adapters/local/sqlite-render.ts` | Tabla `render_jobs` (migración 004, solo crea); `claimNext` atómico |
| Validación | `executor.ts` | Tras cada render, `ffprobe` confirma códec, píxel, dimensiones y duración; si no coincide, falla |

## Garantías (todas verificadas con FFmpeg real, ver pruebas)
- **Estados reales**: `running` solo mientras hay un proceso FFmpeg; `done` solo si la salida pasa la validación.
- **Cancelar** mata el proceso, borra el temporal y no deja salida ni asset.
- **Tiempo máximo** (`KAP_RENDER_TIMEOUT_MIN`): aborta FFmpeg y reintenta o falla; se distingue de una cancelación del usuario.
- **Reintentos** (`KAP_RENDER_MAX_ATTEMPTS`): solo fallos transitorios; entrada/filtro inválido no se reintenta. Se conserva el motivo del intento anterior.
- **Recuperación**: al arrancar el servidor, los trabajos huérfanos (sin latido 30 s) vuelven a la cola; si agotaron intentos, fallan.
- **Sin bloqueo de la web**: FFmpeg corre en procesos hijos con prioridad baja; la cola persiste en SQLite.
- **Seguridad de entrada**: subidas verificadas con ffprobe (archivos corruptos rechazados); ffprobe no puede seguir URLs ni listas de reproducción.

## Configuración (`.env.local`, ver `.env.example`)
`KAP_FFMPEG_PATH`, `KAP_FFPROBE_PATH`, `KAP_FONT_FILE`, `KAP_RENDER_CONCURRENCY` (1), `KAP_FFMPEG_THREADS` (0=auto), `KAP_RENDER_TIMEOUT_MIN` (90), `KAP_RENDER_MAX_ATTEMPTS` (2), `KAP_MIN_FREE_MB` (1024), `KAP_CLIP_WORKERS` (1), `KAP_COMPOSE_MODE` (`segmentos`|`unico`), `KAP_COMPOSE_SEGMENT` (4). Detalle del montaje por tramos y de los workers en `docs/RENDIMIENTO.md`.

## Requisitos del sistema
FFmpeg ≥ 6 con `libx264`, `aac`, `libass`, `drawtext` (libfreetype) y `ffprobe`; una fuente (Inter o DejaVu). En contenedores: `apt-get install ffmpeg fonts-inter`.
La pantalla **Renderizador** muestra qué falta si algo no está disponible.

## Limitaciones conocidas de la subfase A
- Un único proceso web ejecuta el worker. Varios procesos compartiendo la misma base son seguros (claim atómico) pero no se ha probado con carga real.
- Los renders se guardan en `data/media` (disco local). Almacenamiento de objetos para cloud queda para la Fase D.

## Pruebas
`npm test` (66): presets, parser de progreso, clasificación de errores, cola (concurrencia, cancelación, reintentos, recuperación de huérfanos, apagado, espacio en disco, limpieza) y **FFmpeg real** (render 16:9/9:16, cancelación sin procesos huérfanos, tiempo máximo, ffprobe contra archivos corruptos y listas maliciosas, cola de principio a fin).
