import type { Repository, Storage } from "@/ports";

function memoryRepo<T extends { id: string }>(): Repository<T> {
  const m = new Map<string, T>();
  return {
    async list() { return [...m.values()]; },
    async get(id) { return m.get(id); },
    async save(item) { m.set(item.id, item); return item; },
    async remove(id) { m.delete(id); },
  };
}

/** Almacenamiento en memoria: solo para arranque y tests. Se sustituirá por SQLite local (Fase 1). */
export function createMemoryStorage(): Storage {
  return {
    productions: memoryRepo(), characters: memoryRepo(), canon: memoryRepo(),
    assets: memoryRepo(), jobs: memoryRepo(),
  };
}
