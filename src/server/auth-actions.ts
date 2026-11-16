"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getProviders } from "./providers";
import { env } from "./env";
import { audit } from "./audit";
import { attemptLogin } from "./auth/login";
import { hashPassword, passwordProblem, verifyPassword } from "./auth/password";
import { startSession } from "./auth/session";
import { clearSessionCookie, currentTokenHash, requireAdmin, setSessionCookie } from "./auth/guard";
import { safeLocalPath } from "@/lib/security";

export type FormState = { error?: string; ok?: string; username?: string } | null;

async function clientIp(): Promise<string | undefined> {
  if (!env().KAP_TRUST_PROXY) return undefined; // sin proxy de confianza, X-Forwarded-For es falsificable
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  const { auth } = getProviders();
  const username = String(fd.get("username") ?? ""), password = String(fd.get("password") ?? "");
  if (!username || !password || password.length > 500) return { error: "Introduce usuario y contraseña", username: username.slice(0, 60) };
  if ((await auth.countUsers()) === 0) return { error: "Todavía no hay ningún administrador. Créalo desde la terminal: npm run admin:create" };

  const ip = await clientIp();
  const r = await attemptLogin(auth, username, password, ip);
  if (!r.ok) {
    await audit(r.reason === "locked" ? "auth.bloqueado" : "auth.fallo", username.slice(0, 40), undefined, "anónimo", ip);
    return { username: username.slice(0, 60), error: r.reason === "locked" ? `Demasiados intentos fallidos. Inténtalo de nuevo en ${Math.ceil(r.retryAfterSec / 60)} min.` : "Usuario o contraseña incorrectos" };
  }
  const h = await headers();
  const { token, maxAgeSec } = await startSession(auth, r.user.id, { ip, userAgent: h.get("user-agent") ?? undefined });
  await setSessionCookie(token, maxAgeSec);
  await audit("auth.login", r.user.username, undefined, r.user.username, ip);
  redirect(safeLocalPath(fd.get("next"), "/"));
}

export async function logout() {
  const user = await requireAdmin();
  const th = await currentTokenHash();
  if (th) await getProviders().auth.deleteSession(th);
  await clearSessionCookie();
  await audit("auth.logout", user.username, undefined, user.username);
  redirect("/login");
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const { auth } = getProviders();
  const current = String(fd.get("current") ?? ""), next = String(fd.get("next") ?? ""), again = String(fd.get("again") ?? "");
  const row = await auth.getUserByUsername(user.username);
  if (!row || !(await verifyPassword(current, row.passwordHash))) { await audit("auth.cambio_clave_fallido", user.username); return { error: "La contraseña actual no es correcta" }; }
  if (next !== again) return { error: "Las contraseñas nuevas no coinciden" };
  const problem = passwordProblem(next, user.username);
  if (problem) return { error: problem };
  await auth.setPassword(user.id, await hashPassword(next));
  const closed = await auth.deleteUserSessions(user.id, await currentTokenHash());
  await audit("auth.cambio_clave", user.username, `${closed} sesiones cerradas`);
  return { ok: `Contraseña actualizada. Se cerraron ${closed} sesiones en otros dispositivos.` };
}

export async function revokeOtherSessions() {
  const user = await requireAdmin();
  const n = await getProviders().auth.deleteUserSessions(user.id, await currentTokenHash());
  await audit("auth.revocar_sesiones", user.username, `${n} sesiones cerradas`);
  redirect("/configuracion?sesiones=" + n);
}
