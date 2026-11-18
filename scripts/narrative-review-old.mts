/** Aplica la revisión narrativa NUEVA a los borradores de la prueba original (sin volver a generar nada). */
import fs from "node:fs";
import { reviewNarrative, countBySeverity } from "../src/narrative/review.ts";
const KNOWN = ["KAP", "Hermano de KAP", "Dani", "Ramiro", "Profesora", "Padres de KAP"];
const files = process.argv.slice(2), rows: any[] = [];
for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const r of d.results) { if (!r.draft) continue; const dr = r.draft;
    const hook = dr.scenes.flatMap((s: any) => s.memory).map((m: string) => /^gancho:\s*(.+)$/i.exec(m)?.[1]).filter(Boolean).pop();
    const acts = dr.scenes.flatMap((s: any) => s.memory).map((m: string) => /^acto:\s*(\w+)/i.exec(m.normalize("NFD").replace(/[̀-ͯ]/g, ""))?.[1]?.toLowerCase()).filter(Boolean);
    const fs_ = reviewNarrative({ scenes: dr.scenes.map((s: any) => ({ location: s.location, title: s.title, lines: s.lines.map((l: any) => ({ speaker: l.speaker, text: l.text })) })), hook, knownCharacters: KNOWN, acts });
    rows.push({ file: f.split("/").pop(), id: r.id, scenes: dr.scenes.length, ...countBySeverity(fs_), rules: [...new Set(fs_.map((x) => x.rule.replace("narrativa-", "")))], findings: fs_ }); } }
for (const r of rows) console.log(`${r.file.padEnd(34)} ${r.id.padEnd(3)} esc ${String(r.scenes).padStart(2)} · crit ${r.error} aviso ${r.warning} info ${r.info} · ${r.rules.join(", ")}`);
fs.writeFileSync("docs/ia-bench/revision-narrativa-original.json", JSON.stringify(rows, null, 1));
