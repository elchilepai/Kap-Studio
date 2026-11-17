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
