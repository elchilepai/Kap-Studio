/** Utilidades de seguridad puras (sin dependencias de Next) para poder testearlas. */

/** Acepta solo rutas locales ("/algo"); rechaza URLs absolutas, "//host", "\\" y caracteres de control. */
export function safeLocalPath(input: unknown, fallback = "/"): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 500) return fallback;
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\") || /[\u0000-\u001f]/.test(input)) return fallback;
  try {
    const u = new URL(input, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return fallback;
  } catch { return fallback; }
  return input;
}

/**
 * Protección CSRF para endpoints que mutan estado fuera de Server Actions
 * (estas ya validan Origin en Next). Exige que el Origin coincida con el Host,
 * o, si el navegador no envía Origin, que Sec-Fetch-Site no sea cross-site.
 */
export function isSameOrigin(h: { get(name: string): string | null }): boolean {
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (origin) {
    try { return !!host && new URL(origin).host === host; } catch { return false; }
  }
  const site = h.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}
