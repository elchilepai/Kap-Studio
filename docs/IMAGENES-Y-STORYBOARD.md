# KAP Studio = historia + guion + escenas + una imagen por escena

El producto ya no es un vídeo animado: es el **storyboard** (guion, narración, lista de escenas y la imagen de cada escena). El montaje (voz con ElevenLabs, música, zoom, paneo, transiciones, subtítulos, efectos) se hace fuera, en CapCut.

## Flujo
`petición → historia (Qwen3-14B) → 5+ escenas {narración, visual, personajes, lugar, plano, emoción, propósito} → prompt de imagen por escena (style bible + fichas de KAP y del hermano) → imágenes (generador externo) → CapCut`

- `src/narrative/storyboard.ts` (puro): tipos, `storyboardReasons` (comprueba el **contenido** de las descripciones visuales: comparación visible, intento de KAP con el objeto, fallo visible, estrategia distinta, resultado concreto, narración ≠ visual, sin coach/moraleja), `imagePrompt`, `storyboardMarkdown`, `narrationScript` (solo lo que se locuta).
- `src/narrative/styleBible.ts`: lenguaje visual extraído de `assets/style/refs/*` (no se copian sus escenas), paleta compartida, prompt negativo y **fichas de personaje** (KAP = `assets/kap/reference.jpg`; hermano con diseño propio fijo; personajes nuevos se describen una vez y se mantienen).
- `src/server/ai/storyboard.ts`: una llamada a Qwen (+ una reescritura con los motivos si el contenido no cumple; nunca se fabrica nada).
- `src/server/images/pack.ts`: escribe el paquete (`storyboard.md`, `storyboard.json`, `narracion-elevenlabs.txt`, `prompts/scene-NN.txt`, `referencias/`, `LEEME.md`) y detecta qué imágenes faltan (`imagenes/scene-NN.png`).
- `scripts/storyboard.mts`: ejecuta todo con Qwen sin generar vídeo.

## Generación de imágenes: qué hay de verdad
Comprobado en el entorno del proyecto: **no hay GPU**, no hay `torch` ni `diffusers`, Ollama solo tiene `qwen3:14b` y `qwen3:8b` (texto), y **no hay acceso** a `huggingface.co`, `civitai.com`, `replicate.com` ni `api.openai.com` (solo PyPI). Por tanto el proyecto **no puede generar imágenes por sí mismo** y no finge que puede: el puerto `ImageProvider` existe (`ports/studio.ts`) pero solo hay un adaptador «manual» que lo declara no disponible. El flujo real es **guion → prompts visuales → imágenes** con el generador que uses fuera; cuando exista uno local, se enchufa como `ImageProvider` sin tocar el resto.

## Lo que deja de ser prioridad (se conserva, no se amplía)
El motor de animación procedural (`src/animation`, render de vídeo, lip-sync, poses, cámara, fondos vectoriales) y SHORT MODE como generador de vídeo. Siguen en el repositorio y con sus tests, pero ya no se trabajan. Se mantienen: canon y memoria de KAP, personalidad, presentador, estructura narrativa, la validación por contenido (`causalReasons`, `introReasons`…) y la consistencia visual de KAP.
