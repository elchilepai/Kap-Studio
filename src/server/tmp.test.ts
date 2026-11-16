import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanOldTemp } from "./tmp";

describe("cleanOldTemp", () => {
  it("borra solo lo antiguo", async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), "kap-"));
    await fs.writeFile(path.join(d, "viejo"), "x"); await fs.writeFile(path.join(d, "nuevo"), "x");
    const old = new Date(Date.now() - 48 * 3600_000); await fs.utimes(path.join(d, "viejo"), old, old);
    expect(await cleanOldTemp(d, 24)).toBe(1);
    expect(await fs.readdir(d)).toEqual(["nuevo"]);
  });
});
