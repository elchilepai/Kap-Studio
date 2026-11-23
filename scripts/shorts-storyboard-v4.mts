/** Valida (solo estructura, sin modelo) el storyboard revisado y genera el documento de revisión. npx tsx scripts/shorts-storyboard-v4.mts [directorio] */
import fs from "node:fs/promises";
import path from "node:path";
const DIR = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "shorts-v4-reloj"));
const { planIssues, totalSeconds, script } = await import("../src/narrative/scenePlanV4"); const { speechSeconds } = await import("../src/narrative/visualShort");
const chain = JSON.parse(await fs.readFile(path.join(import.meta.dirname, "..", "docs", "shorts-ideas-v4-run", "approved", "cadena-02.json"), "utf8")); const sb = JSON.parse(await fs.readFile(path.join(DIR, "storyboard-revisado.json"), "utf8"));
const issues = planIssues(sb, chain); let t = 0;
const L = [`# ${chain.titulo} — storyboard revisado (10 escenas)`, "", `*${sb.origen} · ${sb.escenas.length} escenas · ${totalSeconds(sb)} s · objeto central: **${chain.objeto}***`, "", "## Narración completa (en orden)", ""];
for (const e of sb.escenas) { if (e.dialogo.trim()) L.push(`- **[${t.toFixed(1)} s · escena ${e.n}]** ${e.dialogo}`); t += e.duracion; }
L.push("", `*Música:* ${sb.musica}`, "", "## Escenas", ""); t = 0;
for (const e of sb.escenas) { L.push(`### ${e.n}. ${e.funcion} · ${t.toFixed(1)}-${(t + e.duracion).toFixed(1)} s`, `- **Qué vemos:** ${e.queOcurre}`, `- **Composición:** ${e.composicion}`, `- **Plano / perspectiva:** ${e.plano} · ${e.perspectiva}`, `- **KAP:** ${e.kapPresente ? "aparece" : `no aparece — ${e.experiencia}`}`, `- **Objeto principal:** ${e.objetoPrincipal}`, `- **En pantalla:** ${e.enPantalla.join("; ")}`, `- **Texto en pantalla:** ${e.textoEnPantalla.trim() ? `«${e.textoEnPantalla}»` : "(ninguno)"}`, `- **Cámara posible (CapCut):** ${e.camara} — ${e.camaraNota}`, `- **Narración:** «${e.dialogo}» (${speechSeconds(e.dialogo)} s de voz en ${e.duracion} s)`, ""); t += e.duracion; }
L.push("## Validación estructural (sin modelo)", "", issues.length ? issues.map((i) => `- ${i.msg}`).join("\n") : "Sin avisos.");
await fs.writeFile(path.join(DIR, "STORYBOARD-10-ESCENAS.md"), L.join("\n")); console.log(issues.length ? issues.map((i) => i.id + ": " + i.msg).join("\n") : "SIN AVISOS", "| segundos:", totalSeconds(sb), "| palabras:", script(sb).split(/\s+/).length);
