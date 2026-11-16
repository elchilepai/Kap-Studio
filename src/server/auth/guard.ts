import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/ports";
import { getProviders } from "@/server/providers";
import { env, isProd } from "@/server/env";
import { COOKIE_NAME, hashToken, validateToken } from "./session";

export async function currentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return validateToken(getProviders().auth, token);
}

/** Guardia de backend para páginas y Server Actions: sin sesión válida, redirige al login. */
export async function requireAdmin(): Promise<AuthUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Guardia para Route Handlers: devuelve una respuesta 401 si no hay sesión válida. */
export async function adminOr401(): Promise<{ user: AuthUser } | { denied: Response }> {
  const user = await currentUser();
  return user ? { user } : { denied: Response.json({ error: "No autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
}

export async function currentTokenHash(): Promise<string | undefined> {
  const t = (await cookies()).get(COOKIE_NAME)?.value;
  return t ? hashToken(t) : undefined;
}

export async function setSessionCookie(token: string, maxAgeSec: number) {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: maxAgeSec, secure: env().KAP_COOKIE_SECURE ?? isProd(),
  });
}
export async function clearSessionCookie() { (await cookies()).delete(COOKIE_NAME); }
