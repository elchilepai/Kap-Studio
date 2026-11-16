# KAP Studio — Plan por fases

**Fase 0 — Arquitectura base (HECHA)**: scaffold, dominio, workflow, puertos, shell UI.

**Fase 1 — Núcleo de datos y auth**: SQLite local (adaptador de `Storage`), login de administrador, CRUD de personajes, canon, producciones.

**Fase 2 — Guion y continuidad**: editor de episodios/escenas, banco de canon, generador de Shorts derivados (selección de escenas), `ScriptWriter` local (plantillas) .

**Fase 3 — Recursos y producción local**: biblioteca de assets, cola de trabajos + worker, `Renderer` con ffmpeg (≈5 min), subtítulos.

**Fase 4 — Revisión y calendario**: pantalla de revisión (reproductor, aprobar/rechazar/cambios), calendario semanal, paquete de exportación manual.

**Fase 5 — Integración YouTube (opcional, requiere credenciales)**: `Publisher` y `ChannelStats` con OAuth; publicación solo desde estado APPROVED.

**Fase 6 — Automatización semanal**: planificador que crea la producción de la semana y avanza etapas; se detiene siempre en REVIEW.

**Fase 7 — IA opcional**: adaptadores LLM/TTS/imagen intercambiables, activados por configuración y clave.

---
**Estado (Fase 1 parcial, interfaz):** hecha la interfaz completa de 10 secciones con persistencia SQLite local (`data/kap.db`, `data/media`),
subida de vídeo/archivos con soporte Range (iPhone), flujo idea→publicado con aprobación obligatoria, seguimiento manual de trabajos,
costes manuales, copia de seguridad JSON y paquete de exportación para publicar a mano.
Pendiente: autenticación de administrador, adaptadores reales (render ffmpeg, guion, voz, YouTube).

---
## Plan Fase 2 (ejecución por fases)
- **A. Auditoría y seguridad** — HECHA (ver docs/AUDITORIA.md, docs/SEGURIDAD.md).
- **B. Autenticación de administrador** — HECHA (docs/ADMIN.md) — usuarios, hash scrypt, sesiones firmadas y revocables, guardia deny-by-default en backend (páginas, acciones y APIs), logout, límite de intentos.
- **C. Motor FFmpeg** — subfase A HECHA (docs/RENDER.md); B composición, C exportación/previsualización, D integración — escenas→clips, imágenes, narración, música, subtítulos, transiciones, 9:16 y 16:9, H.264/AAC.
- **D. Cola y almacenamiento** — worker asíncrono persistente, progreso real, reintentos, cancelación, limpieza; abstracción de almacenamiento (disco/S3 compatible).
- **E. Memoria narrativa** — canon estructurado y comprobación de continuidad antes del guion.
- **F. YouTube** · **G. TikTok** · **H. Pruebas integrales**.
