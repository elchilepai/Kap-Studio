/**
 * Gestión del administrador desde la terminal. Las contraseñas NUNCA se pasan como argumento ni variable de entorno:
 * se piden sin eco en la terminal, o se leen por stdin con --password-stdin (para scripts/CI).
 *
 *   npm run admin:create                 crea el administrador (solo si no existe ninguno)
 *   npm run admin:passwd                 cambia la contraseña y cierra todas sus sesiones
 *   npm run admin:list                   lista usuarios y sesiones activas (nunca muestra hashes)
 *   npm run admin:revoke                 cierra todas las sesiones
 *   npm run admin:unlock                 elimina los bloqueos por intentos fallidos
 */
import fs from "node:fs";
import readline from "node:readline";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Esta operación necesita una terminal interactiva (o usa --password-stdin).");
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(prompt);
    out._writeToOutput = () => {}; // sin eco
    rl.question("", (v) => { rl.close(); process.stdout.write("\n"); resolve(v); });
  });
}
async function readLine(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(prompt, (v) => { rl.close(); r(v); }));
}
async function readStdin(): Promise<string> {
  let d = ""; for await (const c of process.stdin) d += c; return d.replace(/\r?\n$/, "");
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const { getProviders } = await import("../src/server/providers");
  const { hashPassword, passwordProblem, normalizeUsername, USERNAME_RE } = await import("../src/server/auth/password");
  const { auth, storage } = getProviders();
  const fromStdin = args.includes("--password-stdin");
  const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

  const askPassword = async (username: string) => {
    if (fromStdin) return readStdin();
    const p1 = await readHidden("Contraseña (mín. 12 caracteres): ");
    const p2 = await readHidden("Repite la contraseña: ");
    if (p1 !== p2) throw new Error("Las contraseñas no coinciden.");
    void username; return p1;
  };

  switch (cmd) {
    case "create": {
      if ((await auth.countUsers()) > 0) throw new Error("Ya existe un administrador. Usa `npm run admin:passwd` para cambiar su contraseña.");
      const username = normalizeUsername(arg("--username") ?? (await readLine("Nombre de usuario: ")));
      if (!USERNAME_RE.test(username)) throw new Error("Usuario inválido: 3-40 caracteres entre a-z, 0-9, punto, guion y guion bajo.");
      const password = await askPassword(username);
      const problem = passwordProblem(password, username);
      if (problem) throw new Error(problem);
      await auth.createUser({ username, passwordHash: await hashPassword(password) });
      await storage.activity.record({ actor: "cli", action: "admin.crear", target: username });
      console.log(`✔ Administrador «${username}» creado. Ya puedes iniciar sesión.`);
      break;
    }
    case "passwd": {
      const user = (await auth.listUsers())[0];
      if (!user) throw new Error("No hay ningún administrador. Usa `npm run admin:create`.");
      const password = await askPassword(user.username);
      const problem = passwordProblem(password, user.username);
      if (problem) throw new Error(problem);
      await auth.setPassword(user.id, await hashPassword(password));
      const n = await auth.deleteUserSessions(user.id);
      await auth.clearFailures(`u:${user.username}`);
      await storage.activity.record({ actor: "cli", action: "admin.cambio_clave", target: user.username, detail: `${n} sesiones cerradas` });
      console.log(`✔ Contraseña de «${user.username}» actualizada. ${n} sesiones cerradas.`);
      break;
    }
    case "list": {
      for (const u of await auth.listUsers())
        console.log(`${u.username}  creado ${new Date(u.createdAt).toISOString()}  sesiones activas: ${await auth.countSessions(u.id, Date.now())}${u.disabled ? "  [DESACTIVADO]" : ""}`);
      if ((await auth.countUsers()) === 0) console.log("(sin usuarios)");
      break;
    }
    case "revoke": {
      let n = 0; for (const u of await auth.listUsers()) n += await auth.deleteUserSessions(u.id);
      await storage.activity.record({ actor: "cli", action: "admin.revocar_sesiones", detail: `${n}` });
      console.log(`✔ ${n} sesiones cerradas.`); break;
    }
    case "unlock": {
      const db = (storage as unknown as { db: import("node:sqlite").DatabaseSync }).db;
      db.exec("DELETE FROM login_failures");
      console.log("✔ Bloqueos por intentos fallidos eliminados."); break;
    }
    default:
      console.log("Uso: npm run admin:<create|passwd|list|revoke|unlock>   (--password-stdin para leer la contraseña por stdin)");
      process.exitCode = cmd ? 1 : 0;
  }
}
main().catch((e) => { console.error("✖ " + (e as Error).message); process.exit(1); });
