/**
 * Comprueba contra un servidor en marcha que NINGUNA ruta administrativa es accesible sin sesión.
 * Las rutas se descubren desde src/app (así una ruta nueva no puede quedar sin comprobar).
 *   BASE_URL=http://localhost:3000 npm run check:access
 * Con KAP_CHECK_COOKIE="kap_session=<token>" comprueba además que con sesión válida SÍ se accede (200).
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KAP_CHECK_COOKIE;
const ROOT = "src/app";
const PUBLIC = new Set(["/login"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}
const routes = [];
for (const f of walk(ROOT)) {
  const base = path.basename(f);
  const kind = /^page\.(t|j)sx?$/.test(base) ? "page" : /^route\.(t|j)s$/.test(base) ? "api" : null;
  if (!kind) continue;
  const url = "/" + path.relative(ROOT, path.dirname(f)).split(path.sep)
    .filter((s) => !/^\(.*\)$/.test(s)).map((s) => (/^\[.+\]$/.test(s) ? "00000000-0000-0000-0000-000000000000" : s)).join("/");
  routes.push({ url: url === "/" ? "/" : url.replace(/\/$/, ""), kind });
}

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) fails++; console.log((c ? "OK   " : "FAIL ") + m); };
const get = (u, init = {}) => fetch(BASE + u, { redirect: "manual", ...init });

for (const r of routes) {
  if (PUBLIC.has(r.url)) continue;
  const res = await get(r.url);
  const body = await res.text();
  if (r.kind === "api") ok(res.status === 401, `API   ${r.url} sin sesión → ${res.status} (esperado 401)`);
  else ok([302, 303, 307, 308].includes(res.status) && (res.headers.get("location") ?? "").includes("/login"), `PAG   ${r.url} sin sesión → ${res.status} → ${res.headers.get("location")}`);
  ok(!/KAP STUDIO|Dashboard|Panel/.test(body) || res.status === 401 && !body.includes("<html"), `      ${r.url} no filtra contenido del panel`);
  if (r.kind === "api") {
    const post = await get(r.url, { method: "POST", headers: { Origin: BASE }, body: new FormData() });
    ok(post.status === 401, `API   POST ${r.url} sin sesión → ${post.status} (esperado 401)`);
  }
}

// Intentos de evasión
const bad = [
  ["cookie inventada", { Cookie: "kap_session=" + "A".repeat(43) }],
  ["cookie vacía", { Cookie: "kap_session=" }],
  ["cookie con inyección SQL", { Cookie: "kap_session=' OR '1'='1" }],
  ["cabecera x-middleware-subrequest (CVE-2025-29927)", { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" }],
  ["x-forwarded-for local", { "x-forwarded-for": "127.0.0.1" }],
  ["x-user-id falsificado", { "x-user-id": "admin", Authorization: "Bearer admin" }],
];
for (const [name, h] of bad) {
  const a = await get("/", { headers: h }), b = await get("/api/backup", { headers: h });
  ok([302, 307].includes(a.status) && b.status === 401, `EVASIÓN ${name}: / → ${a.status}, /api/backup → ${b.status}`);
}
const rsc = await get("/produccion", { headers: { RSC: "1", "Next-Router-State-Tree": "%5B%22%22%5D" } });
ok(rsc.status !== 200, `EVASIÓN navegación RSC sin sesión → ${rsc.status}`);
const act = await get("/produccion", { method: "POST", headers: { "Next-Action": "00" + "a".repeat(40), "Content-Type": "text/plain", Origin: BASE }, body: "[]" });
ok(act.status === 401, `EVASIÓN Server Action forjada sin sesión → ${act.status} (esperado 401)`);
const act2 = await get("/login", { method: "POST", headers: { "Next-Action": "00" + "a".repeat(40), "Content-Type": "text/plain", Origin: BASE }, body: "[]" });
ok(act2.status !== 200 || !(await act2.text()).includes("KAP STUDIO · panel"), `Server Action forjada en /login no ejecuta nada (${act2.status})`);

const login = await get("/login");
ok(login.status === 200, `/login es público → ${login.status}`);
const hdr = login.headers.get("content-security-policy") ?? "";
ok(hdr.includes("frame-ancestors 'none'"), "/login lleva cabeceras de seguridad");

if (COOKIE) {
  // Con sesión válida hay que ATRAVESAR la guardia: 200, 405 (API que solo admite POST), o 404 en rutas dinámicas (el ID de ejemplo no existe,
  // pero la petición llegó a la aplicación). Nunca 401 ni redirección al login.
  for (const r of routes) {
    if (PUBLIC.has(r.url)) continue;
    const dynamic = r.url.includes("00000000-0000-0000-0000-000000000000");
    const res = await get(r.url, { headers: { Cookie: COOKIE } });
    ok(res.status === 200 || (dynamic && res.status === 404) || (r.kind === "api" && res.status === 405), `AUTORIZADO ${r.url} con sesión → ${res.status}${dynamic ? " (404 = ID de ejemplo inexistente; guardia superada)" : ""}`);
  }
  const post = await get("/api/upload", { method: "POST", headers: { Cookie: COOKIE, Origin: BASE }, body: new FormData() });
  ok(post.status !== 401 && post.status < 500, `AUTORIZADO POST /api/upload con sesión llega al manejador → ${post.status}`);
}
console.log(`\n${checks - fails}/${checks} comprobaciones correctas`);
process.exit(fails ? 1 : 0);
