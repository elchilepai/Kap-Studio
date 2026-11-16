import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createSqliteAuth } from "@/adapters/local/sqlite-auth";
import { MIGRATIONS, migrate } from "@/adapters/local/migrations";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { ABSOLUTE_MS, IDLE_MS, hashToken, startSession, validateToken } from "./session";
import { LIMITS, WINDOW_MS, attemptLogin } from "./login";

const setup = async () => {
  const st = createSqliteStorage(":memory:");
  const auth = createSqliteAuth(st.db);
  const u = await auth.createUser({ username: "owner", passwordHash: await hashPassword("una-clave-muy-larga-123") });
  return { st, auth, u };
};

describe("contraseñas", () => {
  it("hash con sal: dos hashes distintos, ambos verifican; nunca contiene la clave", async () => {
    const a = await hashPassword("secreto-largo-1234"), b = await hashPassword("secreto-largo-1234");
    expect(a).not.toBe(b); expect(a).not.toContain("secreto"); expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("secreto-largo-1234", a)).toBe(true);
    expect(await verifyPassword("otra-clave-larga-12", a)).toBe(false);
    expect(await verifyPassword("x", "basura")).toBe(false);
  });
  it("política mínima", () => {
    expect(passwordProblem("corta")).toBeTruthy();
    expect(passwordProblem("aaaaaaaaaaaaaaaa")).toBeTruthy();
    expect(passwordProblem("owner-123456789", "owner")).toBeTruthy();
    expect(passwordProblem("una-clave-muy-larga-123", "owner")).toBeNull();
  });
});

describe("sesiones", () => {
  it("válida → usuario; se guarda solo el hash del token", async () => {
    const { st, auth, u } = await setup();
    const { token } = await startSession(auth, u.id);
    expect((await validateToken(auth, token))?.username).toBe("owner");
    const rows = st.db.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(rows[0].token_hash).toBe(hashToken(token)); expect(rows[0].token_hash).not.toBe(token);
  });
  it("rechaza token falso, vacío, caducado por inactividad y por antigüedad", async () => {
    const { auth, u } = await setup(); const t0 = 1_000_000;
    expect(await validateToken(auth, "x".repeat(43))).toBeNull(); expect(await validateToken(auth, undefined)).toBeNull();
    const a = await startSession(auth, u.id, {}, t0);
    expect(await validateToken(auth, a.token, t0 + IDLE_MS + 1)).toBeNull();
    expect(await validateToken(auth, a.token, t0 + 10)).toBeNull(); // ya eliminada
    const b = await startSession(auth, u.id, {}, t0);
    for (let t = t0; t < t0 + ABSOLUTE_MS; t += IDLE_MS - 1000) expect(await validateToken(auth, b.token, t)).not.toBeNull(); // actividad mantiene viva
    expect(await validateToken(auth, b.token, t0 + ABSOLUTE_MS + 1)).toBeNull(); // pero hay tope absoluto
  });
  it("revocación inmediata (logout / cambio de clave) y usuario desactivado", async () => {
    const { st, auth, u } = await setup();
    const a = await startSession(auth, u.id), b = await startSession(auth, u.id);
    await auth.deleteSession(hashToken(a.token));
    expect(await validateToken(auth, a.token)).toBeNull(); expect(await validateToken(auth, b.token)).not.toBeNull();
    expect(await auth.deleteUserSessions(u.id)).toBe(1);
    expect(await validateToken(auth, b.token)).toBeNull();
    const c = await startSession(auth, u.id); st.db.prepare("UPDATE users SET disabled = 1").run();
    expect(await validateToken(auth, c.token)).toBeNull();
  });
});

describe("login y límite de intentos", () => {
  it("credenciales correctas / incorrectas, mismo mensaje para usuario inexistente", async () => {
    const { auth } = await setup();
    expect((await attemptLogin(auth, "OWNER", "una-clave-muy-larga-123")).ok).toBe(true);
    expect(await attemptLogin(auth, "owner", "mala")).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin(auth, "nadie", "una-clave-muy-larga-123")).toEqual({ ok: false, reason: "invalid" });
  });
  it(`bloquea tras ${LIMITS.user} fallos, incluso con la contraseña correcta, y se libera con el tiempo`, async () => {
    const { auth } = await setup(); const t0 = 5_000_000;
    for (let i = 0; i < LIMITS.user; i++) expect((await attemptLogin(auth, "owner", "mala", undefined, t0 + i)).ok).toBe(false);
    const r = await attemptLogin(auth, "owner", "una-clave-muy-larga-123", undefined, t0 + 10);
    expect(r).toMatchObject({ ok: false, reason: "locked" });
    expect((r as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
    expect((await attemptLogin(auth, "owner", "una-clave-muy-larga-123", undefined, t0 + WINDOW_MS + LIMITS.user + 1)).ok).toBe(true);
  });
  it("un login correcto borra los fallos previos del usuario", async () => {
    const { auth } = await setup();
    for (let i = 0; i < LIMITS.user - 1; i++) await attemptLogin(auth, "owner", "mala");
    expect((await attemptLogin(auth, "owner", "una-clave-muy-larga-123")).ok).toBe(true);
    for (let i = 0; i < LIMITS.user - 1; i++) await attemptLogin(auth, "owner", "mala");
    expect((await attemptLogin(auth, "owner", "una-clave-muy-larga-123")).ok).toBe(true);
  });
  it("el límite por IP se aplica a todos los usuarios de esa IP", async () => {
    const { auth } = await setup();
    for (let i = 0; i < LIMITS.ip; i++) await attemptLogin(auth, `user${i}`, "mala", "1.2.3.4");
    expect(await attemptLogin(auth, "owner", "una-clave-muy-larga-123", "1.2.3.4")).toMatchObject({ reason: "locked" });
    expect((await attemptLogin(auth, "owner", "una-clave-muy-larga-123", "9.9.9.9")).ok).toBe(true);
  });
});

describe("migración 003_auth NO destruye datos", () => {
  it("una base con datos de Fase A conserva todo al migrar", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const m of MIGRATIONS.slice(0, 2)) { db.exec(m.sql); db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(m.id, "x"); }
    db.prepare("INSERT INTO docs VALUES ('productions','p1','{\"title\":\"El despertar\"}')").run();
    db.prepare("INSERT INTO activity_log (ts, actor, action) VALUES ('t','owner','x')").run();
    expect(migrate(db)).toEqual(["003_auth"]);
    expect((db.prepare("SELECT data FROM docs WHERE id='p1'").get() as { data: string }).data).toContain("El despertar");
    expect((db.prepare("SELECT COUNT(*) c FROM activity_log").get() as { c: number }).c).toBe(1);
    expect(migrate(db)).toEqual([]);
  });
});
