import { getProviders, MEDIA_DIR, TMP_DIR, CACHE_DIR } from "@/server/providers";
import { espeakProvider } from "@/server/studio/voice";
import { afterRender } from "@/server/studio/after";
import { env } from "@/server/env";
import { RenderQueue } from "./queue";
import { createExecutor } from "./executor";

const g = globalThis as unknown as { __kapRenderQueue?: RenderQueue };

/** Cola única por proceso (también sobrevive al HMR de desarrollo). Se arranca con el servidor (instrumentation.ts). */
export function getRenderQueue(): RenderQueue {
  if (!g.__kapRenderQueue) {
    const e = env(), p = getProviders();
    g.__kapRenderQueue = new RenderQueue({
      store: p.render, storage: p.storage, mediaDir: MEDIA_DIR, tmpRoot: TMP_DIR,
      concurrency: e.KAP_RENDER_CONCURRENCY, timeoutMs: e.KAP_RENDER_TIMEOUT_MIN * 60_000, minFreeMb: e.KAP_MIN_FREE_MB,
      execute: createExecutor(p.storage, { threads: e.KAP_FFMPEG_THREADS, concurrency: e.KAP_RENDER_CONCURRENCY, studio: { mediaDir: MEDIA_DIR, cacheDir: CACHE_DIR, voice: espeakProvider(), clipCacheMb: e.KAP_CLIP_CACHE_MB } }),
      afterSuccess: (job, assetId) => afterRender(job, assetId, p.storage, p.render, MEDIA_DIR, e.KAP_RENDER_MAX_ATTEMPTS),
    }).start();
  }
  return g.__kapRenderQueue;
}
