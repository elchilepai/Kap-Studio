# Rendimiento del render 2D (prueba representativa)

Reproducible con `npm run bench:episode` (`scripts/bench-episode.mts`; variables `BENCH_SCENES`, `BENCH_QUALITY`, `BENCH_VERBOSE`, `BENCH_KEEP`).
Trabaja en un directorio temporal, no toca los datos de la aplicación y lo borra al terminar.

## Qué se midió
Un episodio completo por el pipeline real (cola → worker Skia → FFmpeg), **sin simulaciones**:
- **22 escenas** (~5 min), **1920×1080**, 30 fps, H.264 + AAC.
- **4 personajes diseñados** (cuerpos, peinados y ropa distintos) en escenas de 2–4 personajes, **6 escenarios** (habitación, azotea, calle, puente, bosque, ciudad) con elementos y primer plano; **2 con capas de paralaje PNG propias**.
- **Movimiento**: entradas, caminar, gestos, poses, cambio de expresión, paneos y zoom; plano/contraplano en el diálogo; lluvia en parte de las escenas.
- **Narración real** (eSpeak NG, voz sintética básica, varias voces) con **labial por amplitud**, **música con ducking** y **subtítulos quemados** (ASS, Inter).

## Resultados (4 vCPU, 16 GB RAM, Node 22.23, FFmpeg 6.1.1)
| Métrica | Resultado |
|---|---|
| Vídeo generado | 1920×1080 · H.264/AAC · **297,2 s (4,95 min)** · 61,4 MB · 22 escenas · 8.917 fotogramas |
| **Render completo (sin caché)** | **374 s = 6,23 min = 1,26× el tiempo real** (42 ms por fotograma de extremo a extremo) |
| · Análisis y planificación | < 1 s |
| · Narración (voz + duraciones reales) | 5 s |
| · Animación 2D por escena (Skia → FFmpeg) | 262 s (≈ 12 s por escena de ~13,5 s) |
| · Montaje (transiciones + audio + subtítulos) | 107 s |
| Re-render idéntico (todo en caché) | 116 s (solo montaje y mezcla) |
| Editar 1 escena y recomponer | 128 s · **1 clip nuevo de 22** |
| Pico de memoria (proceso de prueba + worker + FFmpeg) | ≈ 2,9 GB |
| Caché de clips | 22 clips · 105 MB |

Referencia a 480p (6 escenas, 82 s de vídeo): 39 s de render completo (0,47× tiempo real), 1 clip nuevo de 6 al editar una escena.

## Lectura
- **A 1080p el episodio de 5 minutos se renderiza en ~6 minutos** en esta máquina (1,26× el tiempo real). Es viable para producción semanal; no es interactivo.
- **El coste se reparte entre la animación (70 %) y el montaje (29 %)**. La animación es secuencial por escena: un worker de Skia dibuja en un solo hilo y FFmpeg codifica en paralelo.
- **La caché funciona**: corregir una escena solo re-renderiza esa escena, pero el **montaje final (~2 min) se paga siempre** porque es una sola pasada de FFmpeg con 22 entradas de 1080p. Es el cuello de botella de la iteración (vista previa de escena sí es rápida).
- **Memoria**: ≈ 2,9 GB de pico (suma de procesos; no se ha desglosado cuánto es del montaje). En una instancia de cloud pequeña (2–4 GB) hay que vigilarlo.

## Cuellos de botella y mejoras posibles (no implementadas)
1. **Paralelizar clips**: 2 workers de Skia a la vez podrían acercar la fase de animación a ~½ en 4 vCPU (hay que medirlo: FFmpeg ya usa varios hilos).
2. **Montaje por tramos**: montar grupos de escenas y concatenar reduciría memoria y permitiría reutilizar tramos sin cambios al editar.
3. **Fondos pre-renderizados**: las capas procedurales (rascacielos, bosque) se redibujan cada fotograma; cachearlas en un lienzo fuera de pantalla reduciría el coste por fotograma.
4. **Resolución de trabajo**: borradores a 480p/720p (0,47×) y 1080p solo en la exportación final.

## Limitaciones de esta medida
- Una sola ejecución por configuración, en una máquina de 4 vCPU sin GPU; no es un benchmark estadístico.
- Arte **vectorial paramétrico sencillo**: personajes por capas PNG de alta resolución o escenarios más complejos costarán más (no medido).
- Voz eSpeak (la duración depende de ella); una voz neuronal cambiaría la duración de las escenas pero no el coste de render por fotograma.
- **No medido todavía**: Shorts 9:16 a 1080p, varios episodios simultáneos, uso de CPU por etapa y el consumo de memoria desglosado.
- La prueba descubrió un fallo real (las direcciones `pose`/`plano` se narraban en vez de interpretarse) que ya está corregido y cubierto con tests.


---

# Optimización de la subfase C: montaje por tramos y clips en paralelo

Misma prueba (`npm run bench:episode`: 22 escenas, 1080p, 4 personajes, 6 escenarios, voz eSpeak, música con ducking, subtítulos), misma máquina (4 vCPU, 16 GB), una ejecución por configuración. Memoria = suma del RSS del proceso, el worker y FFmpeg muestreada cada 100 ms (sobreestima algo: cuenta páginas compartidas). CPU = CPU-segundos de toda la máquina (en reposo) leídos de `/proc/stat`.

## Qué cambió
1. **Montaje por tramos** (`composeSegmented`, `KAP_COMPOSE_MODE=segmentos`, por defecto). Antes: UN FFmpeg con las 22 escenas como entradas y un `xfade` encadenado. Ahora: tramos de 4 escenas (`KAP_COMPOSE_SEGMENT`), cada uno un FFmpeg independiente que termina y **libera su memoria**; el audio se mezcla en su propia pasada (mismo grafo que antes) y todo se une **sin recodificar** (`-c copy`). Cada tramo se cachea por contenido (`cache/segments/`): editar una escena solo rehace su tramo.
   - Las transiciones se fijan a un fotograma entero (antes el redondeo en coma flotante podía mover su inicio ±1 fotograma). Es la única diferencia observable con la pasada única, y también se aplica a ella.
   - `KAP_COMPOSE_MODE=unico` conserva la pasada única anterior.
2. **Clips en paralelo y controlados** (`KAP_CLIP_WORKERS`, por defecto 1 = secuencial). Con N>1, cada FFmpeg de clip recibe `núcleos/N` hilos; el orden de los clips y de los subtítulos no cambia; ante un fallo no se lanzan más tareas y se espera a las que están en marcha (sin procesos huérfanos). Los temporales de cada clip se borran en cuanto está en caché.

## Resultados (antes → después)
| Métrica | Antes (pasada única, secuencial) | Tramos + 1 worker (por defecto) | Tramos + 2 workers |
|---|---|---|---|
| **Pico de memoria** | **2.933 MB** | **991 MB (−66 %)** | 1.291 MB (−56 %) |
| · pico en el montaje | 2.933 MB | 991 MB | 993 MB |
| · pico en la animación | 1.394 MB | 796 MB | 1.291 MB |
| Render completo (sin caché) | 391 s (1,35× tiempo real) | 375 s (1,29×) | **316 s (1,09×)** |
| · animación 2D | 280 s | 264 s | 205 s |
| · montaje + audio + subtítulos | 106 s | 106 s | 108 s |
| CPU total / media | 941 s · 2,4 núcleos | 859 s · 2,3 núcleos | 885 s · 2,8 núcleos |
| Re-render idéntico (todo en caché) | 113 s | **31 s** | 31 s |
| Editar 1 escena y recomponer | 124 s | **60 s** | 63 s |
| Tamaño del MP4 | 60,2 MB (63,1 MB en disco) | 60,3 MB | 60,3 MB |

(Los 106 s del montaje completo no cambian: el coste es la codificación x264 de 8.700 fotogramas 1080p, no la memoria. La ganancia de tiempo está en las repeticiones y ediciones, porque los tramos sin cambios no se rehacen.)

## Equivalencia con el resultado anterior (vídeo de 22 escenas, antes vs. después)
- 8.704 fotogramas en ambos; duración 290,133 s; mismo códec/perfil (H.264 High, yuv420p, AAC 48 kHz estéreo); 1920×1080.
- Vídeo, fotograma a fotograma (PSNR/SSIM de `ffmpeg`): media **52,4 dB**, mínimo **37,7 dB** (ningún fotograma bajo 35 dB), SSIM 0,9989. Con 2 workers: media 52,3 dB, mínimo 37,7 dB.
- Audio: mismas muestras (4.640.768), desfase 0, sonoridad idéntica (−16,4 LUFS, LRA 3,9 LU, pico −1,2 dBFS). La relación señal/diferencia entre los PCM decodificados es de 30,5 dB (la codificación AAC y `loudnorm` no son bit a bit idénticas).
- Decodificación completa de ambos MP4 sin errores.
- Tests con FFmpeg real (`compose.real.test.ts`): tramos de 2 y 3 escenas contra la pasada única con transiciones variadas: mismos fotogramas, PSNR medio > 38 dB, mínimo > 30 dB, audio equivalente; y la caché de tramos solo rehace los afectados.

## Recomendación de uso
- Por defecto (1 worker): menor memoria (≈ 1 GB), apto para instancias pequeñas.
- `KAP_CLIP_WORKERS=2` si hay ≥ 4 vCPU y ≥ 2 GB libres: −16 % de tiempo con +300 MB.
- 3–4 workers no se han medido: con 4 vCPU el límite pasa a ser la CPU, no la memoria.

## Limitaciones de esta medida
- Una sola ejecución por configuración, sin repeticiones: la diferencia de 375 s → 391 s (1 worker vs. antes) está dentro del ruido; las diferencias de memoria y de re-render sí son grandes y consistentes entre las tres corridas.
- Tamaño de tramo (4) elegido por criterio, **no** barrido en el benchmark (solo 2 y 3 en los tests con clips sintéticos).
- Shorts 9:16 a 1080p, varios renders simultáneos y escenas con personajes PNG por capas siguen sin medirse.
- La memoria mide el árbol de procesos por RSS; no es un pico de cgroup.
