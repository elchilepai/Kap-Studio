/**
 * Ejecuta `fn` sobre cada elemento con como mucho `limit` tareas a la vez (límite 1 = estrictamente secuencial).
 * El resultado conserva el orden de entrada. Al primer fallo no se lanzan más tareas y se propaga ese error
 * tras esperar a las que ya estaban en marcha (así no quedan procesos hijos huérfanos).
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length); let next = 0, failed = false, error: unknown;
  const lane = async () => {
    while (!failed) {
      const i = next++; if (i >= items.length) return;
      try { out[i] = await fn(items[i], i); } catch (e) { if (!failed) { failed = true; error = e; } }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Math.floor(limit) || 1, items.length)) }, lane));
  if (failed) throw error;
  return out;
}
