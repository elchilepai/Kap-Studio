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
  KAP_LIPSYNC: z.enum(["amplitud", "texto"]).default("amplitud"),   // proveedor de labial: amplitud (por defecto) | texto (experimental)
  KAP_LLM: z.enum(["none", "ollama"]).default("none"),  // proveedor de LLM LOCAL (nunca de pago). «none» = KAP funciona solo con reglas y formularios
  KAP_OLLAMA_URL: z.string().default("http://127.0.0.1:11434"),   // solo loopback salvo KAP_LLM_ALLOW_REMOTE=true
  KAP_LLM_MODEL: z.string().default("qwen3:8b"),                  // cambiar de modelo = cambiar esto; nada más del sistema depende de él
  KAP_LLM_CONTEXT: z.coerce.number().int().min(2048).max(131072).default(8192),   // tokens de contexto que se piden al motor (más contexto = más RAM)
  KAP_AUTHOR_MODE: z.enum(["arc", "json", "text"]).default("arc"),               // arc = arco → escenas (recomendado); json = borrador de una pasada; text = texto libre
  KAP_LLM_TIMEOUT_S: z.coerce.number().int().min(10).max(7200).default(1800),     // en CPU un episodio completo tarda minutos
  KAP_LLM_ALLOW_REMOTE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  KAP_CONTEXT_TOKENS: z.coerce.number().int().min(500).max(32000).default(3500), // presupuesto del paquete de contexto de la memoria narrativa
  KAP_ANIM_WORKER: z.string().optional(),             // ruta alternativa del trabajador de animación 2D
  KAP_RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  KAP_FFMPEG_THREADS: z.coerce.number().int().min(0).max(64).default(0), // 0 = automático (CPUs / concurrencia)
  KAP_RENDER_TIMEOUT_MIN: z.coerce.number().min(0.05).max(720).default(90),
  KAP_RENDER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  KAP_CLIP_WORKERS: z.coerce.number().int().min(1).max(4).default(1),        // clips 2D que se animan a la vez (1 = secuencial: la menor memoria)
  KAP_COMPOSE_MODE: z.enum(["segmentos", "unico"]).default("segmentos"),     // montaje por tramos (poca memoria) o en una sola pasada
  KAP_COMPOSE_SEGMENT: z.coerce.number().int().min(1).max(12).default(4),    // escenas por tramo de montaje
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
