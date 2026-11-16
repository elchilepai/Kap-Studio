import { createHash, randomBytes } from "node:crypto";
import type { AuthStore, AuthUser } from "@/ports";

export const COOKIE_NAME = "kap_session";
export const ABSOLUTE_MS = 7 * 24 * 3600_000; // caducidad máxima de una sesión
export const IDLE_MS = 12 * 3600_000;         // caducidad por inactividad
const TOUCH_EVERY_MS = 60_000;

/** El token (256 bits aleatorios) solo viaja en la cookie; en la base de datos se guarda su SHA-256. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function startSession(auth: AuthStore, userId: string, meta: { ip?: string; userAgent?: string } = {}, now = Date.now()) {
  const token = newToken();
  await auth.createSession({ tokenHash: hashToken(token), userId, expiresAt: now + ABSOLUTE_MS, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 200) }, now);
  return { token, maxAgeSec: Math.floor(ABSOLUTE_MS / 1000) };
}

/** Devuelve el usuario si el token es válido; elimina la sesión si está caducada. */
export async function validateToken(auth: AuthStore, token: string | undefined, now = Date.now()): Promise<AuthUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const th = hashToken(token);
  const s = await auth.getSession(th);
  if (!s) return null;
  if (now >= s.expiresAt || now - s.lastSeen >= IDLE_MS) { await auth.deleteSession(th); return null; }
  const user = await auth.getUser(s.userId);
  if (!user || user.disabled) { await auth.deleteSession(th); return null; }
  if (now - s.lastSeen > TOUCH_EVERY_MS) await auth.touchSession(th, now);
  return user;
}
