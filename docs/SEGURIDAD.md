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


# Autenticación (Fase B)
- **Contraseñas:** scrypt (N=32768, r=8, p=1, sal aleatoria de 16 B), parámetros dentro del hash; verificación en tiempo constante; Unicode normalizado (NFKC). Mínimo 12 caracteres.
- **Sesiones:** token de 256 bits en cookie `httpOnly` + `SameSite=Lax` (+ `Secure` en producción). La base guarda solo el SHA-256 del token. Caducan a las 12 h de inactividad o a los 7 días absolutos. Revocables al instante (logout, cambio de clave, `admin:revoke`).
- **Guardia en capas (deny-by-default):**
  1. `src/proxy.ts`: toda petición salvo `/login` y los estáticos de Next exige sesión *válida en base de datos* (páginas, navegación RSC, Server Actions, APIs, medios). APIs y acciones → 401; páginas → redirección a `/login`.
  2. Defensa en profundidad: `requireAdmin()` en el layout del panel y en **todas** las Server Actions; `adminOr401()` en **todos** los Route Handlers. Si el proxy fallara, el backend sigue protegido.
- **Fuerza bruta:** 5 fallos/15 min por usuario, 20 por IP (solo con proxy de confianza), 60 globales. Se comprueba *antes* de verificar la clave, se persiste en base de datos y sobrevive a reinicios. Mensaje idéntico para usuario existente o no.
- **Redirección post-login:** solo rutas locales (`safeLocalPath`).
- **Trazabilidad:** login, fallos, bloqueos, logout y cambios de clave quedan en `/actividad`.
- **Limitación conocida:** el bloqueo por usuario permite que alguien que conozca tu nombre de usuario te bloquee 15 min (denegación de servicio menor). `npm run admin:unlock` lo resuelve.
- **Sin entorno PUBLIC:** no existe acceso público; la única ruta sin sesión es `/login`.
