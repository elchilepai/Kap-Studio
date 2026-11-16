import type { AuthStore, AuthUser } from "@/ports";
import { dummyHash, normalizeUsername, verifyPassword } from "./password";

/** Límites de intentos fallidos en una ventana deslizante. Se guardan en la base de datos: sobreviven a reinicios. */
export const WINDOW_MS = 15 * 60_000;
export const LIMITS = { user: 5, ip: 20, global: 60 };

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; retryAfterSec: number };

const keysFor = (username: string, ip?: string) => ({
  user: `u:${username}`, ...(ip ? { ip: `ip:${ip}` } : {}), global: "g",
}) as Record<string, string>;

export async function attemptLogin(auth: AuthStore, usernameRaw: string, password: string, ip?: string, now = Date.now()): Promise<LoginResult> {
  const username = normalizeUsername(usernameRaw).slice(0, 60);
  const keys = keysFor(username, ip);
  const since = now - WINDOW_MS;

  // 1) ¿Bloqueado? Se comprueba ANTES de verificar la contraseña: así un atacante no puede seguir probando.
  for (const [scope, key] of Object.entries(keys)) {
    if ((await auth.countFailures(key, since)) >= LIMITS[scope as keyof typeof LIMITS]) {
      const oldest = (await auth.oldestFailure(key, since)) ?? now;
      return { ok: false, reason: "locked", retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)) };
    }
  }

  // 2) Verificación en tiempo constante respecto a la existencia del usuario.
  const row = await auth.getUserByUsername(username);
  const ok = await verifyPassword(password, row?.passwordHash ?? (await dummyHash()));
  if (!row || row.disabled || !ok) {
    for (const key of Object.values(keys)) await auth.recordFailure(key, now);
    return { ok: false, reason: "invalid" };
  }
  await auth.clearFailures(keys.user);
  await auth.pruneFailures(now - 2 * WINDOW_MS);
  const { passwordHash: _omit, ...user } = row; void _omit;
  return { ok: true, user };
}
