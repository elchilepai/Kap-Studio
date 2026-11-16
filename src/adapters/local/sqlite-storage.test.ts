import { describe, expect, it } from "vitest";
import { createSqliteStorage } from "./sqlite-storage";
import { migrate, MIGRATIONS } from "./migrations";

describe("sqlite storage", () => {
  it("migra una sola vez (idempotente) y guarda/lee documentos", async () => {
    const st = createSqliteStorage(":memory:");
    expect(migrate(st.db)).toEqual([]);
    await st.places.save({ id: "p1", name: "Base", description: "", createdAt: "x" });
    expect((await st.places.get("p1"))?.name).toBe("Base");
    await st.places.remove("p1");
    expect(await st.places.get("p1")).toBeUndefined();
    const n = (st.db.prepare("SELECT COUNT(*) c FROM schema_migrations").get() as { c: number }).c;
    expect(n).toBe(MIGRATIONS.length);
  });
  it("registra actividad en orden inverso", async () => {
    const st = createSqliteStorage(":memory:");
    await st.activity.record({ actor: "owner", action: "a" });
    await st.activity.record({ actor: "owner", action: "b", target: "t" });
    expect((await st.activity.recent(5)).map((e) => e.action)).toEqual(["b", "a"]);
  });
});
