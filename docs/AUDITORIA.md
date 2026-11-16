# Auditoría del estado (inicio de Fase 2)

Fecha: 2026-11-16 · Rama `claude/beautiful-dijkstra-0vijpk` · Commit base `13b7886`.

## Inventario
- **Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Zod, SQLite (`node:sqlite`, integrado en Node ≥22.5), Vitest. ~2.000 líneas.
- **Almacenamiento:** tabla `docs(collection,id,data JSON)` tras el puerto `Storage`; vídeos en `data/media`.
- **Arquitectura:** hexagonal (domain → ports → adapters → server/composition root → app). Sólida; se conserva.
- **Funcional y probado (E2E):** 10 secciones, CRUD, flujo idea→publicado con aprobación, subida/reproducción con Range, trabajos manuales, costes, backup JSON, exportación de paquete.
- **Dependencias:** `npm audit` → 0 vulnerabilidades. `tsc` y tests limpios.

## Hallazgos de seguridad (verificados con sondeos reales, antes de corregir)
| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| 1 | **Crítica** | Sin autenticación: todas las páginas, Server Actions y APIs abiertas; `/api/backup` devolvía toda la base de datos (200) | **Pendiente → Fase B** |
| 2 | **Alta** | XSS almacenado: se aceptaba un SVG declarado `image/svg+xml` y se servía inline desde el origen de la app | **Corregido** |
| 3 | Alta | Redirección abierta: `redirect` de `/api/upload` y `_redirect` de las acciones aceptaban URLs externas (phishing) | **Corregido** |
| 4 | Alta | `/api/upload` sin comprobación de origen (CSRF) | **Corregido** |
| 5 | Media | Subida cargada entera en memoria (`arrayBuffer`), sin límite de tamaño ni escritura atómica | **Corregido** (streaming a disco + límite) |
| 6 | Media | Tipo de archivo confiado al `Content-Type` del cliente | **Corregido** (detección por bytes) |
| 7 | Media | Sin cabeceras de seguridad (CSP, X-Frame-Options, nosniff…) | **Corregido** |
| 8 | Media | `.env.example` sugería `KAP_ADMIN_PASSWORD` (contraseña en texto plano) | **Corregido** (se elimina; ver Fase B) |
| 9 | Baja | Sin registro de auditoría; sin migraciones versionadas; datos sin permisos restrictivos | **Corregido** |
| 10 | Baja | `node:sqlite` es «experimental» (aviso en logs) | Aceptado: cero dependencias nativas; se revisará |

## Pendientes conocidos (no son regresiones)
Sin login (Fase B) · CSP usa `'unsafe-inline'` para scripts (Next hidrata con inline; migrar a nonces es una mejora) ·
render/cola/narrativa/YouTube/TikTok aún no existen (Fases C–G) · el seguimiento de trabajos sigue siendo manual hasta la Fase C/D.
