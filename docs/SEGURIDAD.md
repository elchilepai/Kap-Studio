# Seguridad (Fase A)

- **Subidas:** multipart en streaming → archivo temporal `data/tmp` (0600) → renombrado atómico a `data/media`. Límite `KAP_MAX_UPLOAD_MB`.
  El tipo se decide por *magic bytes* (`src/lib/sniff.ts`); SVG/HTML/desconocidos se rechazan. El nombre guardado se sanea; el archivo se guarda con ID aleatorio.
- **Servir medios:** `nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Cross-Origin-Resource-Policy: same-origin`, Content-Type del tipo detectado.
- **CSRF:** Server Actions (Origin verificado por Next) + `isSameOrigin()` en endpoints POST propios.
- **Redirecciones:** solo rutas locales (`safeLocalPath`).
- **Cabeceras globales:** CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP, HSTS en producción.
- **Datos:** directorio `0700`, base de datos `0600`, migraciones versionadas (`schema_migrations`), registro de actividad append-only (`/actividad`).
- **Entorno:** `src/server/env.ts` valida variables con Zod. Los secretos solo en `.env.local` (ignorado por git). Nunca se guardan contraseñas ni tokens en claro.
- **Temporales:** `cleanOldTemp` elimina restos antiguos (`KAP_TEMP_TTL_HOURS`).
- **Aún sin proteger:** acceso a la aplicación (no hay login) → Fase B. No exponer públicamente hasta entonces.
