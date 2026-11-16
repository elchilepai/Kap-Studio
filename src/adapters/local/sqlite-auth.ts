import type { DatabaseSync } from "node:sqlite";
import type { AuthStore, AuthUser } from "@/ports";

type Row = Record<string, unknown>;
const toUser = (r: Row): AuthUser => ({ id: String(r.id), username: String(r.username), createdAt: Number(r.created_at), disabled: Number(r.disabled) === 1 });

export function createSqliteAuth(db: DatabaseSync): AuthStore {
  return {
    async countUsers() { return Number((db.prepare("SELECT COUNT(*) c FROM users").get() as Row).c); },
    async createUser({ username, passwordHash }) {
      const id = crypto.randomUUID(), now = Date.now();
      db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run(id, username, passwordHash, now);
      return { id, username, createdAt: now, disabled: false };
    },
    async getUserByUsername(username) {
      const r = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as Row | undefined;
      return r ? { ...toUser(r), passwordHash: String(r.password_hash) } : undefined;
    },
    async getUser(id) { const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined; return r ? toUser(r) : undefined; },
    async listUsers() { return (db.prepare("SELECT * FROM users ORDER BY created_at").all() as Row[]).map(toUser); },
    async setPassword(userId, hash) { db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId); },

    async createSession(s, now) {
      db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(s.tokenHash, s.userId, now, now, s.expiresAt, s.ip ?? null, s.userAgent ?? null);
    },
    async getSession(th) {
      const r = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(th) as Row | undefined;
      return r ? { tokenHash: th, userId: String(r.user_id), createdAt: Number(r.created_at), lastSeen: Number(r.last_seen), expiresAt: Number(r.expires_at) } : undefined;
    },
    async touchSession(th, now) { db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(now, th); },
    async deleteSession(th) { db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(th); },
    async deleteUserSessions(userId, except) {
      const r = except
        ? db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, except)
        : db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      return Number(r.changes);
    },
    async countSessions(userId, now) { return Number((db.prepare("SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND expires_at > ?").get(userId, now) as Row).c); },
    async deleteExpiredSessions(now) { return Number(db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes); },

    async recordFailure(key, ts) { db.prepare("INSERT INTO login_failures (key, ts) VALUES (?, ?)").run(key, ts); },
    async countFailures(key, since) { return Number((db.prepare("SELECT COUNT(*) c FROM login_failures WHERE key = ? AND ts > ?").get(key, since) as Row).c); },
    async oldestFailure(key, since) {
      const r = db.prepare("SELECT MIN(ts) m FROM login_failures WHERE key = ? AND ts > ?").get(key, since) as Row;
      return r.m == null ? undefined : Number(r.m);
    },
    async clearFailures(key) { db.prepare("DELETE FROM login_failures WHERE key = ?").run(key); },
    async pruneFailures(before) { db.prepare("DELETE FROM login_failures WHERE ts <= ?").run(before); },
  };
}
