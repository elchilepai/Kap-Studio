# Exportación final

Solo se exporta lo **aprobado** por el administrador (modo APPROVAL): `APPROVED`, `SCHEDULED` o `PUBLISHED`. La exportación nunca aprueba, publica ni cambia el estado.

## Flujo
`Generar` (revisión, a la resolución elegida) → **Aprobación** (manual) → **Exportar** en la ficha del episodio/Short.

- **Exportar** encola un trabajo `export`: vuelve a renderizar con las escenas aprobadas y la **misma voz, música y estilo** de la última generación terminada (`lastGenerationParams`). Resoluciones: 720p o 1080p (por defecto 1080p). Episodio → 16:9; Short → 9:16.
- En un episodio, el botón incluye **sus Shorts aprobados**.
- **Reutiliza la caché** de clips y de tramos de montaje: si ya se generó a esa resolución, apenas cuesta (≈ 30 s en la prueba de 22 escenas); a otra resolución se re-renderizan los clips (distinto tamaño de fotograma).
- Modificar una escena no obliga a regenerar todo: se re-renderiza esa escena y su tramo. Tras editar, la aprobación se reinicia (regla existente) y hay que aprobar de nuevo antes de exportar.
- Se conserva **una exportación por producción, formato y resolución** (la nueva sustituye a la anterior; no se acumulan archivos grandes). No se toca el vídeo revisado/aprobado.

## Descarga (`/api/download/[id]`)
Solo administrador, solo producciones aprobadas (si no, 409). Siempre como adjunto, con nombre limpio y sin rutas:
`kap-t1e3-la-noche-larga-16x9-1080p.mp4` · `kap-t1-short-2-gancho-9x16-1080p.mp4`.
- `?f=video` vídeo revisado · `?f=export&job=<id>` exportación terminada · `?f=srt|vtt` subtítulos.

## Qué no hace (todavía)
- No publica en YouTube (la publicación sigue siendo manual desde el paquete de «Publicación»).
- No hay exportación de un episodio completo en 9:16 desde la interfaz (solo Shorts derivados); el motor sí lo soporta (`BENCH_FORMAT=9:16`).
- Los vídeos subidos a mano (sin escenas) no se pueden re-exportar: se descarga el archivo adjunto.
