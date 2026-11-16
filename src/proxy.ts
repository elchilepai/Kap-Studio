import { NextResponse, type NextRequest } from "next/server";
import { getProviders } from "@/server/providers";
import { COOKIE_NAME, validateToken } from "@/server/auth/session";
import { safeLocalPath } from "@/lib/security";

/**
 * PUNTO ÚNICO DE ENTRADA — deny-by-default.
 * Toda petición (páginas, navegaciones RSC, Server Actions, APIs, medios) exige una sesión VÁLIDA
 * (validada contra la base de datos, no solo "existe cookie"). La única ruta pública es /login.
 * Además, las acciones y los route handlers vuelven a comprobar la sesión (defensa en profundidad).
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isLogin = pathname === "/login";
  let user = null;
  try { user = await validateToken(getProviders().auth, req.cookies.get(COOKIE_NAME)?.value); } catch { user = null; }

  if (user) {
    if (isLogin) return NextResponse.redirect(new URL("/", req.url));
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  if (isLogin) return NextResponse.next();

  const deny = { "Cache-Control": "no-store" };
  if (pathname.startsWith("/api/") || req.headers.has("next-action"))
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: deny });
  const to = new URL("/login", req.url);
  const next = safeLocalPath(pathname + search, "/");
  if (next !== "/") to.searchParams.set("next", next);
  return NextResponse.redirect(to, { headers: deny });
}

// Todo salvo los recursos estáticos compilados de Next (CSS/JS/fuentes) y el favicon.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
