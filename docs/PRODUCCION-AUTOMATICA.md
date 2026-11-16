# Producción automática (Fase C · subfase B)

**Principio:** KAP Studio es un sistema de producción automatizado. El usuario escribe una petición, elige un episodio y pulsa
**«Generar episodio»**. El editor de escenas es una herramienta **secundaria** para corregir lo generado. La aprobación final es siempre manual.

## Pipeline (cola persistente, progreso real por pasos)
1. **Analizar** el guion con un analizador **por reglas** (`studio/script.ts`) → escenas, personajes, directivas.
2. **Planificar** y **asignar visuales** (`studio/visuals.ts`): directiva `[imagen:]` → memoria del lugar → biblioteca por etiquetas → imagen de referencia del personaje → tarjeta KAP. Sin recurso no se inventa ninguna imagen.
3. **Narración**: audio subido → voz local (eSpeak NG, si está instalado) → sin voz. Las duraciones de escena se ajustan al audio real.
4. **Clips por escena** (`studio/clip.ts`): Ken Burns, subtítulos ASS quemados (Inter, estilo KAP). **Caché por contenido**: solo se renderiza lo que cambió.
5. **Montaje** (`studio/compose.ts`): `xfade` entre escenas, narración, efectos y música con **ducking** (`sidechaincompress`), limitador y `loudnorm`.
6. **Verificación** con `ffprobe` (H.264, AAC, dimensiones, duración) + subtítulos `.srt`/`.vtt`.
7. **Shorts 9:16**: tramos de 20-58 s elegidos por reglas explicables (apertura, cliffhanger, diálogo) y encolados como trabajos propios.
8. El episodio y los Shorts pasan a **«En revisión»**. Nunca se aprueba ni se publica automáticamente; regenerar un contenido aprobado reinicia la aprobación.

## Formato de guion (analizador por reglas)
```
# Refugio                         ← escena (también «ESCENA 2: Azotea», «INT. Lugar»)
[imagen: ciudad vacía de noche]   ← directivas, cada una en su línea: imagen, música, mood, transición, duración, sfx
[transición: fadeblack]
El viento golpea las ventanas.    ← sin prefijo = narrador
MIRA: ¿Lo oyes?                   ← «NOMBRE: texto» (MAYÚSCULAS o personaje conocido) = diálogo
```
Sin encabezados, cada párrafo es una escena candidata (se fusionan/dividen para un ritmo de 6-20 s).

## Qué es real y qué no (no se simula IA)
| Capacidad | Hoy | Futuro (puerto en `src/ports/studio.ts`) |
|---|---|---|
| Interpretar guion | Reglas con formato documentado | `ScriptAnalyzer` con LLM |
| Escribir guion | **No disponible** (la interfaz lo dice) | `ScriptAuthor` |
| Petición libre | Solo reconoce duración, nº de Shorts y ánimo; el resto se guarda sin interpretar | LLM |
| Imágenes | Biblioteca + memoria visual + tarjetas | `ImageProvider` |
| Voz | Audio subido; eSpeak NG local (calidad básica) | `VoiceProvider` neuronal |
| Sincronía de subtítulos | **Proporcional** a la longitud del texto dentro de la ventana de voz | Alineación forzada con reconocedor de voz |

`/render → «Capacidades»` muestra en vivo qué está conectado. Para conectar un proveedor gratuito basta con implementar el puerto y registrarlo; ningún otro código cambia.

## Editor de escenas (secundario) — `/episodios/[id]/escenas`
Editar texto/lugar/duración/transición/movimiento/fondo/narración/efecto, reordenar, añadir, eliminar, vista previa de una escena, estilo de subtítulos, «Volver a componer». Guardar una escena la **bloquea** (el pipeline no la sobrescribe).

## Biblioteca
Cada recurso tiene rol (fondo, personaje, narración, música, efecto), etiquetas y licencia. La música exige licencia indicada.

## Configuración (`.env.local`)
`KAP_CLIP_CACHE_MB` (2048) además de las variables del motor (ver `docs/RENDER.md`). `KAP_ESPEAK_PATH` para una ruta personalizada de eSpeak.
