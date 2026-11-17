# Flujo de producción definitivo — qué existe y qué falta

Objetivo: solicitar un episodio con texto normal y que KAP haga el resto; el usuario solo revisa y aprueba.

| # | Paso | Estado hoy | Qué falta / depende de |
|---|---|---|---|
| 1 | Solicitar un episodio con texto normal | **Parcial**: cuadro «Petición» con pistas reconocidas por reglas (duración, nº de Shorts, tono) | Interpretar lenguaje libre → **LLM** (`IA-LOCAL.md`) |
| 2 | Interpretar la petición con IA | **Falta** | LLM local (decisión pendiente) |
| 3 | Consultar la memoria narrativa | **Falta** (Universo KAP es un archivo manual que el pipeline no lee) | `MEMORIA-NARRATIVA.md` (pasos 1-4 son independientes de la IA) |
| 4 | Crear el guion | **Falta** (el guion lo escribe el usuario) | LLM + memoria |
| 5 | Generar el storyboard | **Existe**: vista de storyboard 2D de la IR | — |
| 6 | Crear las escenas automáticamente | **Existe**: guion → IR → escenas (intérprete por reglas; IR externa admitida) | Con LLM: texto libre → IR |
| 7 | Generar personajes y escenarios | **Existe**: se crean solos desde el guion (diseño paramétrico + escenario congelado) | Imagen generativa no disponible (no se simula) |
| 8 | Animaciones, expresiones, movimientos | **Existe**: director por reglas, poses, gestos, cámara, composición (`COMPOSICION.md`) | Labial por fonemas (hoy por amplitud) |
| 9 | Narración, música y efectos | **Parcial**: voz eSpeak/audio subido, música con ducking, SFX | Voz neuronal local (p. ej. Piper) pendiente de evaluar |
| 10 | Subtítulos | **Existe** (ASS, zona segura, 16:9 y 9:16, .srt/.vtt) | — |
| 11 | Renderizar el episodio completo | **Existe**: montaje por tramos, caché por escena, ≈ 1,1-1,3× tiempo real | — |
| 12 | Generar Shorts derivados | **Existe** (selección por reglas, 9:16 animado) | Selección por IA (opcional) |
| 13 | Vista previa | **Existe** (vídeo en revisión, vista previa de escena, storyboard) | — |
| 14 | Esperar la aprobación | **Existe** (Aprobación manual; cambia el contenido → se reinicia) | — |
| 15 | Exportar los vídeos | **Existe** (`EXPORTACION.md`) | Publicar en YouTube sigue siendo manual |

**Bloque que falta entero = pasos 1-4 (petición libre → memoria → guion)**: depende de (a) la memoria narrativa y (b) un modelo de IA local. La parte de memoria puede construirse sin IA; el modelo requiere la decisión de `IA-LOCAL.md`.
