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

---

# Formato vertical 9:16 (Shorts) — prueba y medición

Mismo benchmark (`BENCH_FORMAT=9:16`, `BENCH_SHORTS=3`, `BENCH_SHORTS_ONLY=1`, `BENCH_ONLY=1`; ver `scripts/bench-episode.mts`), configuración por defecto (1 worker, montaje por tramos), 4 vCPU / 16 GB, una ejecución por configuración.

## Cómo se compone el vertical (no es un recorte del 16:9)
El estudio se dibuja **de nuevo** a 9:16 con su propia dirección (`src/animation/director.ts`, `render.ts`):
- Los personajes se **agrupan en el centro** (la ventana vertical solo abarca ≈ 5 de las 16 unidades del escenario): 2 personajes a ±1,3, 3 a ±1,4.
- Planos de narración: la cámara se centra en el grupo con un empuje lento; **si alguien camina o entra, lo sigue** (re-enfoca cada 0,8 s). Diálogo: plano cerrado sobre quien habla con contraplano.
- La escena **sube en el encuadre** (los pies quedan hacia el 60-65 % de la altura, no el 84 %): el subtítulo cae bajo los pies y la franja inferior (la que tapa la interfaz de Shorts) queda libre. Con una imagen de fondo no se baja la cámara (no hay más imagen debajo).
- Subtítulos: las frases largas se **parten en varios subtítulos** que caben (≈ 22 caracteres por línea). Antes se cortaban por los dos bordes.
- El 16:9 **no cambia** (tests `vertical.test.ts`).

## Resultados (1080 × 1920, H.264 High + AAC 48 kHz)
| Prueba | Resultado |
|---|---|
| Episodio de 22 escenas en vertical | 290,1 s · 8.704 fotogramas · 62,7 MB · render completo **405 s (1,40× tiempo real)** · **pico 1.003 MB** · CPU 966 s |
| · animación / montaje | 283 s / 117 s (en 16:9: 264 s / 106 s) |
| 3 Shorts derivados (≈ 53 s cada uno) | **223 s en total** (≈ 74 s por Short, 1,4× tiempo real) · **pico 926 MB** · 10,1 / 11,3 / 12,5 MB |
| Referencia 16:9 (mismo episodio) | 375 s · 991 MB |

El vertical cuesta ≈ 8 % más que el 16:9 (más píxeles por fotograma: 1080 × 1920 frente a 1920 × 1080 no cambia el recuento, pero hay más subtítulos y la cámara cierra más) y usa la misma memoria.

## Calidad y sincronización
- Episodio y 3 Shorts: 1080 × 1920, H.264 High / yuv420p / 30 fps, AAC 48 kHz estéreo; decodificación completa **sin errores**.
- Audio ↔ vídeo: duración de vídeo y de audio iguales al centisegundo (290,133 s vs 290,121 s; la diferencia es el relleno de AAC, la misma que en 16:9). La banda sonora es la misma que la del 16:9: mismas muestras, relación señal/diferencia 30,6 dB (AAC + `loudnorm`), sonoridad idéntica (−16,4 LUFS; Shorts −16,2…−16,4 LUFS, pico −1,3 dBFS).
- Revisión visual de fotogramas de los 3 Shorts y del episodio: personajes enteros y sin deformar, subtítulos dentro de la pantalla y bajo los pies.
- **No medido**: sincronización labial con una referencia independiente (solo se comprobó que la pista de audio y su duración son las del 16:9 y que el labial usa la misma envolvente de audio).

## Fallos que encontró esta prueba (y ya están corregidos)
1. **Los Shorts derivados se renderizaban como tarjetas fijas «KAP · ESCENA»**, no como animación: `deriveShorts` no heredaba el modo de animación del episodio. (La primera medición de Shorts —2,1 MB por Short— era inválida por eso.) Corregido y cubierto por `after.test.ts`.
2. Subtítulos de narración cortados por ambos bordes en vertical.
3. Personajes cortados por el borde en planos de narración y subtítulo sobre el cuerpo.
4. Error de hidratación de React (#418) en `/render` si se abría con un trabajo en marcha (la cola calculaba el tiempo con `Date.now()` en el primer pintado).

## Limitaciones del vertical
- En contraplano a veces asoma medio personaje por el borde (plano «sobre el hombro»).
- Con 3 personajes y un paseo dirigido pueden solaparse; con 4 personajes en vertical la escena queda muy apretada (los planos cerrados de diálogo lo mitigan).
- Los escenarios con imagen de fondo no bajan la cámara: el subtítulo puede tapar los pies.
- Los clips del 16:9 y del 9:16 no se comparten en la caché (distinto tamaño de fotograma y distinta composición).
