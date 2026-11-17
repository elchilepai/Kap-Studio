import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSqliteStorage } from "@/adapters/local/sqlite-storage";
import { createSqliteRender } from "@/adapters/local/sqlite-render";
import { afterRender } from "./after";
import type { Production, Scene } from "@/domain/types";

const scene = (i: number): Scene => ({ id: `s${i}`, order: i, title: `Escena ${i}`, location: "Calle", durationSec: 12, durationSource: "audio", lines: [{ speaker: "KAP", text: "Hola." }], characterIds: ["kap"], transition: "fade", motion: "kenburns", directions: [] } as never);

describe("Shorts derivados", () => {
  it("heredan el modo de animación (2D) del episodio: no caen a tarjetas fijas", async () => {
    const st = createSqliteStorage(":memory:"), store = createSqliteRender(st.db), dir = await fs.mkdtemp(path.join(os.tmpdir(), "kap-after-"));
    try {
      const ep = { id: "ep", kind: "episode", number: 1, season: 1, title: "T", status: "RENDER", synopsis: "", script: "", scenes: [0, 1, 2, 3, 4].map(scene), assetIds: [], durationSec: 60, createdAt: "x", updatedAt: "x", generated: false, brief: "", cast: [], storyTime: "" } as unknown as Production;
      await st.productions.save(ep);
      await st.assets.save({ id: "vid", kind: "video", path: "vid.mp4", origin: "generated", license: "propio", createdAt: "x", name: "v", mime: "video/mp4", size: 1, durationSec: 60 } as never);
      const job = { id: "j", kind: "episode", format: "16:9", quality: "1080p", productionId: "ep", params: { mode: "full", voice: "espeak", animation: "2d", shortsCount: 1 }, status: "done", progress: 1, attempts: 1, maxAttempts: 1, createdAt: 0, notBefore: 0, cancelRequested: false } as never;
      await afterRender(job, "vid", st, store, dir, 1);
      const shorts = (await store.list(50)).filter((j) => j.kind === "short");
      expect(shorts).toHaveLength(1); expect(shorts[0]).toMatchObject({ format: "9:16", quality: "1080p" });
      expect(shorts[0].params).toMatchObject({ animation: "2d", voice: "espeak" });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
