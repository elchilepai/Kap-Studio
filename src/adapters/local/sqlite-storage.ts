import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { ActivityLog, Repository, Storage } from "@/ports";
import type { ActivityEntry } from "@/domain/types";
import { migrate } from "./migrations";

export const STORAGE_COLLECTIONS = [
  "productions", "characters", "canon", "assets", "jobs", "reviews", "bible",
  "relationships", "events", "places", "evolution", "costs", "story", "settings", "style",
  "memoryCanon", "memoryEpisodes", "memoryProposals",
] as const;

/** Almacenamiento persistente local en SQLite (módulo integrado de Node, sin servicios externos). */
export function createSqliteStorage(dbPath: string): Storage & { db: DatabaseSync } {
  const inMemory = dbPath === ":memory:";
  if (!inMemory) fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  if (!inMemory) { try { fs.chmodSync(dbPath, 0o600); } catch { /* best effort */ } }
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);

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

  const activity: ActivityLog = {
    async record(e) {
      db.prepare("INSERT INTO activity_log (ts, actor, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)")
        .run(new Date().toISOString(), e.actor, e.action, e.target ?? null, e.detail ?? null, e.ip ?? null);
    },
    async recent(limit = 50) {
      return db.prepare("SELECT id, ts, actor, action, target, detail, ip FROM activity_log ORDER BY id DESC LIMIT ?").all(limit)
        .map((r) => {
          const x = r as Record<string, unknown>;
          return { id: x.id, ts: x.ts, actor: x.actor, action: x.action, target: x.target ?? undefined, detail: x.detail ?? undefined, ip: x.ip ?? undefined } as ActivityEntry;
        });
    },
  };

  const s = { db, activity } as Record<string, unknown>;
  for (const c of STORAGE_COLLECTIONS) s[c] = repo(c);
  return s as unknown as Storage & { db: DatabaseSync };
}
