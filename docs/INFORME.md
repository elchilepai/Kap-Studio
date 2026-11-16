# KAP Studio — Informe de estado inicial

## 1. Estado del repositorio (antes de esta tarea)
- Repo local y remoto (`elchilepai/Kap-Studio`) **completamente vacíos**: sin commits, archivos, dependencias ni ramas.
- Por tanto: no hay funcionalidades existentes, errores previos ni deuda técnica. Nada se ha eliminado ni reconstruido.
- Entorno disponible: Node 22, npm 10, Python 3.13, **ffmpeg 6.1** (clave para renderizar vídeo sin pagar).

## 2. Qué se ha creado (Fase 0, solo arquitectura)
Next.js (App Router) + TypeScript + Zod + Vitest. Shell responsive dark con acento amarillo KAP (#FFD400), UI en español,
10 secciones de navegación con páginas marcador, modelo de dominio, máquina de estados de producción, puertos de integración
y composition root. `tsc`, tests y `next build` pasan.

## 3. Riesgos / decisiones de arquitectura detectadas
- **Persistencia**: hoy es en memoria (solo arranque/tests). Fase 1 debe añadir SQLite local; las Server Actions no deben usar el almacén en memoria en producción.
- **Autenticación**: "administrador" aún sin implementar; hasta entonces el panel no debe exponerse públicamente.
- **Trabajos largos** (render, voz): no caben en una petición HTTP → cola de trabajos persistente con worker propio.
- **Copyright/licencias**: cada recurso lleva campo `license`; evitar recursos sin licencia clara.
- **YouTube**: la subida y las estadísticas requieren OAuth y cuota de la YouTube Data API (gratuita pero con cuota y verificación de app para publicar en público).

## 4. Integraciones externas necesarias (ninguna activada)
| Necesidad | Opción | Coste | Estado |
|---|---|---|---|
| Subir/gestionar vídeos y estadísticas | YouTube Data API v3 + OAuth | Gratis (cuota diaria) | Pendiente, requiere tus credenciales |
| Generar guion con IA | LLM (p. ej. API de Anthropic) o local | De pago / local gratis | Opcional; sin él, guion manual/plantillas |
| Voz (TTS) | Local (Piper/espeak) o servicio externo | Gratis local / de pago | Opcional |
| Imágenes/animación | Subida manual, assets propios, o generación | Gratis manual / de pago IA | Opcional |
| Render de vídeo | ffmpeg local | Gratis | Disponible en el entorno |

## 5. Qué funciona sin pagar servicios externos
Gestión de personajes, escenas, guiones (manual/plantillas), biblioteca de recursos, canon de continuidad, calendario semanal,
flujo de revisión/aprobación, render con ffmpeg (diapositivas + audio + subtítulos), exportación de paquete listo para subir a mano.
Lo que **requiere** servicio externo: publicación automática y estadísticas (YouTube API, gratis pero con OAuth) y generación por IA (opcional).
