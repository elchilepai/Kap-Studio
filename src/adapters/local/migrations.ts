import type { DatabaseSync } from "node:sqlite";

/** Migraciones versionadas y ordenadas. Cada una se aplica una sola vez, dentro de una transacción. */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_docs",
    sql: `CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));`,
  },
  {
    id: "002_activity_log",
    sql: `CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
      target TEXT, detail TEXT, ip TEXT);
      CREATE INDEX idx_activity_ts ON activity_log (ts DESC);`,
  },
];

export function migrate(db: DatabaseSync): string[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set((db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, new Date().toISOString());
      db.exec("COMMIT");
      applied.push(m.id);
    } catch (e) { db.exec("ROLLBACK"); throw new Error(`Migración ${m.id} falló: ${(e as Error).message}`); }
  }
  return applied;
}
