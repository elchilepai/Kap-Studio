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
  // --- Motor de renderizado (FFmpeg local) ---
  KAP_FFMPEG_PATH: z.string().default("ffmpeg"),
  KAP_FFPROBE_PATH: z.string().default("ffprobe"),
  KAP_FONT_FILE: z.string().optional(),              // fuente para títulos/subtítulos; si falta se busca Inter/DejaVu
  KAP_RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  KAP_FFMPEG_THREADS: z.coerce.number().int().min(0).max(64).default(0), // 0 = automático (CPUs / concurrencia)
  KAP_RENDER_TIMEOUT_MIN: z.coerce.number().min(0.05).max(720).default(90),
  KAP_RENDER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  KAP_CLIP_CACHE_MB: z.coerce.number().int().min(50).default(2048),         // caché de clips por escena (se purga la más antigua)
  KAP_MIN_FREE_MB: z.coerce.number().int().min(0).default(1024), // espacio libre mínimo para empezar un render
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
