import { z } from "zod";

/**
 * Configuración desde variables de entorno, validada al arrancar.
 * Los secretos (claves OAuth, secreto de sesión…) NUNCA se registran ni se devuelven al cliente.
 */
const Schema = z.object({
  KAP_DATA_DIR: z.string().default("./data"),
  KAP_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20000).default(1024),
  KAP_TEMP_TTL_HOURS: z.coerce.number().min(0.1).default(24),
  NODE_ENV: z.string().default("development"),
  // true solo si la app corre detrás de un proxy/CDN de confianza que fija X-Forwarded-For.
  KAP_TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Cookie "Secure": por defecto activa en producción. Solo "false" para pruebas locales sin HTTPS.
  KAP_COOKIE_SECURE: z.enum(["true", "false"]).optional().transform((v) => v === undefined ? undefined : v === "true"),
});
export type Env = z.infer<typeof Schema>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    const r = Schema.safeParse(process.env);
    if (!r.success) throw new Error("Configuración de entorno inválida: " + r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
    cached = r.data;
  }
  return cached;
}
export const isProd = () => env().NODE_ENV === "production";
