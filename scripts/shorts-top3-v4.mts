/** Valida (solo estructura, sin modelo) el storyboard TOP 3 y genera el documento de revisión. npx tsx scripts/shorts-top3-v4.mts [directorio] */
import fs from "node:fs/promises";
import path from "node:path";
const DIR = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "shorts-v4-top3"));
const { top3Issues, totalTop3 } = await import("../src/narrative/top3V4"); const { speechSeconds } = await import("../src/narrative/visualShort");
const sb = JSON.parse(await fs.readFile(path.join(DIR, "storyboard.json"), "utf8")), issues = top3Issues(sb); let t = 0;
const L = [`# ${sb.tema} — storyboard (formato KAP presentador)`, "", `*${sb.origen} · ${sb.escenas.length} escenas · ${totalTop3(sb)} s*`, "", "## Guion completo (lo que dice KAP, en orden)", ""];
for (const e of sb.escenas) { L.push(`- **[${t.toFixed(1)} s · ${e.n} · ${e.bloque}]** ${e.narracion}`); t += e.duracion; }
L.push("", `*Música:* ${sb.musica}`, "", "## Escenas", ""); t = 0;
for (const e of sb.escenas) { L.push(`### ${e.n}. ${e.bloque} — ${e.funcion} · ${t.toFixed(1)}-${(t + e.duracion).toFixed(1)} s`, `- **Narración:** «${e.narracion}» (${speechSeconds(e.narracion)} s de voz en ${e.duracion} s)`, `- **Qué vemos:** ${e.vemos}`, `- **Composición:** ${e.composicion}`, `- **KAP:** ${e.kap}`, `- **Objeto/elemento principal:** ${e.objeto}`, `- **Texto en pantalla:** ${e.texto.trim() ? `«${e.texto}»` : "(ninguno)"}`, `- **Cámara posible (CapCut):** ${e.camara} — ${e.camaraNota}`, ""); t += e.duracion; }
L.push("## Validación estructural (sin modelo)", "", issues.length ? issues.map((i) => `- ${i.msg}`).join("\n") : "Sin avisos.");
await fs.writeFile(path.join(DIR, "STORYBOARD-TOP3.md"), L.join("\n")); console.log(issues.length ? issues.map((i) => i.id + ": " + i.msg).join("\n") : "SIN AVISOS", "| segundos:", totalTop3(sb));
