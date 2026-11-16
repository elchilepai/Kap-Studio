import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Repository, Storage } from "@/ports";

export const STORAGE_COLLECTIONS = [
  "productions", "characters", "canon", "assets", "jobs", "reviews", "bible",
  "relationships", "events", "places", "evolution", "costs", "story", "settings",
] as const;

/** Almacenamiento persistente local en SQLite (módulo integrado de Node, sin servicios externos). */
export function createSqliteStorage(dbPath: string): Storage & { db: DatabaseSync } {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS docs (
    collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (collection, id))`);

  const repo = <T extends { id: string }>(c: string): Repository<T> => ({
    async list() {
      return db.prepare("SELECT data FROM docs WHERE collection = ?").all(c)
        .map((r) => JSON.parse((r as { data: string }).data) as T);
    },
    async get(id) {
      const r = db.prepare("SELECT data FROM docs WHERE collection = ? AND id = ?").get(c, id) as { data: string } | undefined;
      return r ? (JSON.parse(r.data) as T) : undefined;
    },
    async save(item) {
      db.prepare("INSERT OR REPLACE INTO docs (collection, id, data) VALUES (?, ?, ?)").run(c, item.id, JSON.stringify(item));
      return item;
    },
    async remove(id) {
      db.prepare("DELETE FROM docs WHERE collection = ? AND id = ?").run(c, id);
    },
  });

  const s = { db } as Record<string, unknown>;
  for (const c of STORAGE_COLLECTIONS) s[c] = repo(c);
  return s as unknown as Storage & { db: DatabaseSync };
}
