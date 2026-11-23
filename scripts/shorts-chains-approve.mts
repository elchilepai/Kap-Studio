/** Aplica las cadenas APROBADAS (reescritas por indicación del usuario) sobre el documento de aprobación. Solo validación estructural (sin modelo). npx tsx scripts/shorts-chains-approve.mts [directorio] */
import fs from "node:fs/promises";
import path from "node:path";
const DIR = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "shorts-ideas-v4-run"));
const { chainIssues, FIELDS_V4 } = await import("../src/narrative/chainV4"); const { chainsMarkdown } = await import("../src/server/shorts/chainStageV4");
const stage = JSON.parse(await fs.readFile(path.join(DIR, "stages", "01-idea.json"), "utf8")); const approved: Record<string, Record<string, string>> = {};
for (const id of ["cadena-02", "cadena-04"]) { const c = JSON.parse(await fs.readFile(path.join(DIR, "approved", `${id}.json`), "utf8")); const issues = chainIssues(c); if (issues.length) { console.error(id, issues.map((i) => i.msg)); process.exit(1); } approved[id] = c; }
const L = ["# Cadenas aprobadas para la siguiente fase", "", "Cadenas **2 y 4** aprobadas por el usuario (reescritas según sus indicaciones; estructura validada sin modelo). Las originales de Qwen siguen en `stages/` y más abajo.", ""];
const LABEL: Record<string, string> = { situacion: "Situación", conflicto: "Conflicto", motivo: "Motivo de KAP", accion: "Acción", consecuencia: "Consecuencia", decision: "Momento de decisión", nuevaAccion: "Nueva acción", resultado: "Resultado", mentalidad: "Mentalidad" };
for (const [id, c] of Object.entries(approved)) { L.push(`## ✅ ${id} · ${c.titulo} — APROBADA`, `*Categoría: ${c.category} · Objeto central: **${c.objeto}** · estructura OK*`, ""); FIELDS_V4.forEach((f, n) => L.push(`${n + 1}. **${LABEL[f]}:** ${c[f]}`)); L.push(""); }
L.push("---", "", "# Cadenas originales de Qwen (V4)", "", "Las cadenas 1, 3 y 5 no están aprobadas.", "", chainsMarkdown(stage).split("\n").slice(4).join("\n"));
await fs.writeFile(path.join(DIR, "CADENAS-PARA-APROBAR.md"), L.join("\n")); await fs.writeFile(path.join(DIR, "approved", "approved.json"), JSON.stringify({ approved: Object.keys(approved), chains: approved }, null, 1)); console.log("OK", Object.keys(approved).join(", "));
