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
  {
    // Solo CREA tablas nuevas: no toca `docs` ni `activity_log`.
    id: "003_auth",
    sql: `CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL, ip TEXT, user_agent TEXT);
      CREATE INDEX idx_sessions_user ON sessions (user_id);
      CREATE TABLE login_failures (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE INDEX idx_login_failures ON login_failures (key, ts);`,
  },
  {
    // Solo CREA una tabla nueva (cola de renderizado persistente).
    id: "004_render_jobs",
    sql: `CREATE TABLE render_jobs (
      id TEXT PRIMARY KEY, production_id TEXT, kind TEXT NOT NULL, format TEXT NOT NULL, quality TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 2, error TEXT, log TEXT,
      output_asset_id TEXT, result TEXT, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
      not_before INTEGER NOT NULL DEFAULT 0, cancel_requested INTEGER NOT NULL DEFAULT 0, worker TEXT, heartbeat INTEGER);
      CREATE INDEX idx_render_status ON render_jobs (status, created_at);`,
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
