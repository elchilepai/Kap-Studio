# Crear y gestionar tu usuario administrador

La contraseña **nunca** se guarda en el código, en `.env` ni en el historial de git: solo su hash (scrypt) en la base de datos.

## Primer arranque
```bash
npm install
cp .env.example .env.local        # opcional; todo tiene valores por defecto
npm run admin:create              # pide usuario y contraseña (sin eco, dos veces)
npm run build && npm start        # o: npm run dev
# abre http://localhost:3000 → te redirige a /login
```
- Usuario: 3–40 caracteres (`a-z 0-9 . _ -`). Contraseña: mínimo 12 caracteres, sin contener el usuario.
- Solo puede existir **un** administrador. Si ya existe, `admin:create` se niega.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run admin:create` | Crea el administrador (solo si no hay ninguno) |
| `npm run admin:passwd` | Cambia la contraseña y cierra **todas** las sesiones |
| `npm run admin:list` | Muestra usuario y nº de sesiones (nunca hashes) |
| `npm run admin:revoke` | Cierra todas las sesiones |
| `npm run admin:unlock` | Quita el bloqueo por intentos fallidos (si te bloqueas tú mismo) |
| `npm run check:access` | Verifica contra un servidor en marcha que nada es accesible sin sesión (`BASE_URL=…`) |

Para scripts/CI: `echo "clave" | npm run admin:create -- --username propietario --password-stdin` (la clave nunca va en argumentos).

## Si olvidas la contraseña
Tienes acceso al servidor: `npm run admin:passwd`. No existe «recuperar por email» a propósito (no hay servicio de correo ni canal público).

## Detrás de HTTPS / proxy
- Producción: la cookie es `Secure` por defecto (necesita HTTPS; `localhost` también vale). Solo para pruebas sin HTTPS: `KAP_COOKIE_SECURE=false`.
- Si tras un proxy/CDN **de confianza** que fija `X-Forwarded-For`: `KAP_TRUST_PROXY=true` activa el límite de intentos por IP. Sin él, `X-Forwarded-For` es falsificable y se ignora.
