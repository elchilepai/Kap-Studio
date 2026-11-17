# Arquitectura de animación 2D de KAP Studio

KAP es un canal de **animación 2D narrativa**. KAP Studio es una plataforma de producción automatizada con un **editor de revisión**
(no un editor de vídeo): el usuario describe, el sistema genera, el usuario revisa y aprueba.

## 1. Decisión: ¿basta FFmpeg? No. Capa de escena 2D + FFmpeg
FFmpeg sigue siendo el motor de **composición final, mezcla de audio, subtítulos, codificación y exportación 9:16/16:9**. No sirve para animar:
personajes articulados (pivotes), intercambio de expresiones, labial, cámara con seguimiento, partículas y jerarquías de capas son inviables
como grafos de filtros, y no permiten mostrar la misma animación en el editor del navegador.

| Opción | Veredicto |
|---|---|
| FFmpeg puro (`overlay`+expresiones) | Descartada: sin jerarquías ni expresiones, frágil, sin previsualización web |
| Chromium headless (Playwright) | Viable pero lento (captura por fotograma) y dependiente de un navegador |
| Blender / Godot / Synfig | Potentes pero pesados, orientados a GUI y sin compartir código con el editor web |
| Remotion | Licencia con condiciones comerciales (verificar): se evita por la regla «sin pago» |
| Lottie / Rive / Spine / Live2D | Editores propietarios o de pago |
| **Canvas 2D isomórfico + Skia (`@napi-rs/canvas`, MIT)** | **Elegida** |

**Por qué:** el MISMO `renderFrame(ctx, escena, t)` (`src/animation/`) corre en el **navegador** (diseñador, reproductor, storyboard) y en
**Node con Skia** (exportación determinista). Lo que se revisa es lo que se exporta. Medido: 5,5 ms/fotograma a 720p, 8 ms a 1080p →
≈ 1 min de dibujo por 5 min de vídeo. Se ejecuta en un **proceso hijo** (`scripts/anim-worker.mjs`) y alimenta a FFmpeg por tubería: no bloquea la web,
es cancelable y no carga fotogramas en memoria.

## 2. Pipeline definitivo
```
GUION ─▶ STORYBOARD ─▶ ESCENAS ─▶ PERSONAJES/ESCENARIOS ─▶ NARRACIÓN ─▶ ANIMACIÓN 2D ─▶ MÚSICA+SFX ─▶ SUBTÍTULOS ─▶ COMPOSICIÓN ─▶ EXPORTACIÓN ─▶ SHORTS
reglas     director +     escenas     biblia visual            duraciones   Skia→FFmpeg   mezcla +     ASS           xfade +        (subfase C)   tramos
(script)   fotogramas     + direc.    (diseño versionado)      + envolvente (clip/escena) ducking      quemados      audio                        9:16
```
Orden de ejecución: la **narración va antes del render de animación** porque la duración de cada escena y la apertura de la boca dependen del audio real.

## 3. Capas (`src/`)
| Capa | Contenido | Dependencias |
|---|---|---|
| `animation/` (isomórfica) | tipos, línea de tiempo pura, personaje articulado, escenarios, renderizador, **director por reglas** | ninguna (ni Next ni alias): corre en navegador y Node |
| `domain/animation.ts` | diseño de personaje versionado, guardarropa, escenario, `StyleBible`, reparto | zod |
| `server/animation/` | continuidad de diseño, labial por audio, constructor de escena, clip 2D (worker→FFmpeg), previsualización | Node |
| `server/studio/produce.ts` | pipeline: **estrategia de clip** `2d` \| `still` (la de imágenes fijas se conserva) | — |
| `components/` | `StagePlayer`, `CharacterDesigner`, `SceneEditor`, storyboard | React |

El código de `src/animation/` usa imports relativos `./x.ts`, sin `enum` ni alias, para que Node ≥ 22.18 lo ejecute sin compilar en el worker.

## 4. Descripción estructurada de escena → animación (sin que el usuario anime)
La escena se describe con su texto, personajes, lugar, ánimo y **direcciones** `clave: valor` (en el guion `[clave: valor]`, o en el editor):

| Dirección | Ejemplos |
|---|---|
| `camara` | `zoom 1.4 durante 2s` · `acercar` · `alejar` · `paneo izquierda` · `seguir KAP` · `temblor` |
| `entra` / `sale` | `KAP izquierda en 0.5s` · `Mira fundido` |
| `camina` | `KAP a derecha` · `Mira a 11` · `KAP a centro corre` |
| `expresion` | `Mira triste en 1s` (feliz, enfadado, sorprendido, preocupado, pensativo…) |
| `gesto` | `KAP saluda` · `Mira señala` · `encoge` · `asiente` · `niega` · `piensa` · `levanta` |
| `mira` | `KAP derecha` |
| `vfx` | `lluvia` · `nieve` · `niebla` · `flash` · `oscurecer` · `polvo` |
| `aparece` / `desaparece` | `linterna en 1s` (caja, puerta, cartel, estrella, luna, árbol, farola) |

Sin direcciones, el **director** aplica reglas deterministas: huecos y miradas, boca por la envolvente del audio, gestos y reacciones en el diálogo,
cámara que sigue a quien habla (en 9:16 recorta una columna y lo sigue), acciones sugeridas por la narración («camina», «lluvia», «trueno»), y una
cámara que nunca queda estática. Lo que no entiende se **avisa** en el editor; no se inventa.

## 5. Continuidad entre episodios
- **Diseño de personaje versionado** (`Character.design`): rasgos base + guardarropa + historial. Un personaje del episodio 1 se dibuja igual en el 10 porque el aspecto sale SIEMPRE de la biblia.
- **Regla de continuidad**: cambiar el aspecto base o editar/quitar una prenda **exige justificación narrativa** y sube la versión; añadir una prenda nueva es libre.
- **Reparto por episodio** (`Production.cast`): qué prenda lleva cada personaje, sin alterar sus rasgos. **Posición temporal** (`Production.storyTime`).
- **Escenarios** (`Place.set`): preset, hora del día y fondo; la memoria visual del lugar se reutiliza.
- **Estilo** (`StyleBible`): contorno, línea, gradación, viñeta, modo por defecto y **notas del canal de referencia**.
- **Caché sensible al diseño**: el clip incluye el diseño en su clave; cambiar la ropa de KAP re-renderiza solo las escenas donde sale (verificado).

## 6. Límites declarados
- **No hay en este proyecto una definición del canal de referencia**: el estilo inicial (vectorial plano de recortes) es provisional. Se ajusta en la biblia de estilo.
- **El arte**: sin un generador de imágenes conectado, los personajes son **vectoriales paramétricos** (coherentes y editables) o rigs que aporte el usuario (importación de capas PNG/SVG con rig JSON: fase posterior). La calidad artística depende de ese diseño.
- **Labial**: por amplitud del audio (la boca se abre donde hay sonido), no por fonemas.
- **Movimiento de personajes**: ciclo de caminar, gestos y expresiones predefinidos; no hay animación libre cuadro a cuadro.
- **Escenarios**: presets procedurales (habitación, calle, ciudad, bosque, azotea, abstracto) o una imagen de fondo de la biblioteca con paralaje.
- **Exportación final / Shorts de la subfase C**: no se ha avanzado en ello.

## 7. Futuro (puertos ya definidos en `src/ports/studio.ts`)
`ImageProvider` (generar fondos/personajes), `VoiceProvider` neuronal, `ScriptAuthor`/`ScriptAnalyzer` con LLM (leer lenguaje libre y producir direcciones),
alineación forzada para el labial. Todos como adaptadores gratuitos/locales intercambiables; nada de esto está simulado hoy.
