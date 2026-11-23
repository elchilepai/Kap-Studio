/** Re-valida la ESTRUCTURA de las cadenas ya guardadas (sin llamar al modelo) y regenera el documento de aprobación. npx tsx scripts/shorts-chains-revalidate.mts [directorio] */
import fs from "node:fs/promises";
import path from "node:path";
const DIR = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "docs", "shorts-ideas-v4-run"));
const { evaluateChains, chainsMarkdown } = await import("../src/server/shorts/chainStageV4");
const stage = JSON.parse(await fs.readFile(path.join(DIR, "stages", "01-idea.json"), "utf8")); const chains = evaluateChains(stage.chains.map((c: { chain: unknown; attempts: number }) => ({ chain: c.chain, attempts: c.attempts })));
const out = { ...stage, chains, revalidated: new Date().toISOString() }; await fs.writeFile(path.join(DIR, "stages", "01-idea.json"), JSON.stringify(out, null, 1)); await fs.writeFile(path.join(DIR, "CADENAS-PARA-APROBAR.md"), chainsMarkdown(out));
console.log(chains.map((c: { id: string; issues: { id: string }[]; duplicateOf?: string }) => `${c.id}: ${c.issues.map((i) => i.id).join(",") || "OK"}${c.duplicateOf ? ` (duplica ${c.duplicateOf})` : ""}`).join("\n"));
