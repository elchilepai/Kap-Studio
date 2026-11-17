/**
 * Registra el CANON INICIAL de KAP en el canon base (idempotente: si ya está, no cambia nada).
 *   npm run memory:seed
 * Usa el mismo directorio de datos que la aplicación (KAP_DATA_DIR, por defecto ./data). No toca episodios ni borra nada.
 */
import fs from "node:fs";
import path from "node:path";
import { createSqliteStorage } from "../src/adapters/local/sqlite-storage";
import { registerKapCanon } from "../src/server/memory/service";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const dir = path.resolve(process.env.KAP_DATA_DIR ?? "./data");
const storage = createSqliteStorage(path.join(dir, "kap.db"));
const r = await registerKapCanon({ storage, log: async (a, t, d) => { await storage.activity.record({ actor: "cli", action: a, target: t, detail: d }); } }, "cli");
console.log(r.already ? "El canon inicial de KAP ya estaba registrado: sin cambios." : `Canon inicial de KAP registrado (${r.added} cambios) en ${dir}.`);
