/**
 * ETAPA «idea» V4 (FASE A): genera N cadenas narrativas (una llamada por cadena, guardada en disco al terminar), valida SOLO la estructura, marca duplicados y deja el resultado para APROBACIÓN HUMANA.
 * No selecciona, no puntúa y no usa ningún modelo como juez. El pipeline se detiene aquí (stopAfter: "idea").
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { LlmClient } from "@/ports/studio";
import { CATEGORIES_V4, FIELDS_V4, duplicateChain, type CategoryV4, type Chain, type Issue } from "@/narrative/chainV4";
import { generateChainV4 } from "@/server/ai/chainV4";
import type { StageFn } from "./stages";

const partFile = (dir: string, name: string) => path.join(dir, "stages", "parts", `${name}.json`);
const readPart = async <T>(dir: string, name: string): Promise<T | undefined> => { try { return JSON.parse(await fs.readFile(partFile(dir, name), "utf8")) as T; } catch { return undefined; } };
const writePart = async (dir: string, name: string, data: unknown) => { const f = partFile(dir, name); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f + ".tmp", JSON.stringify(data, null, 1)); await fs.rename(f + ".tmp", f); };
export type Log = (msg: string) => void;
export type ChainRecord = { id: string; chain: Chain; issues: Issue[]; attempts: number; duplicateOf?: string; duplicateWhy?: string; structurallyOk: boolean };
export type ChainStageOut = { chains: ChainRecord[]; stats: { calls: number; resumed: number; ms: number } };

export function chainStageV4(llm: LlmClient, dir: string, o: { log?: Log; categories?: readonly CategoryV4[] } = {}): StageFn {
  const cats = o.categories ?? CATEGORIES_V4, log = o.log ?? (() => {});
  return async ({ signal }) => {
    const t0 = Date.now(), raw: { chain: Chain; issues: Issue[]; attempts: number }[] = []; let calls = 0, resumed = 0;
    for (const [n, category] of cats.entries()) {
      const saved = await readPart<{ chain: Chain; issues: Issue[]; attempts: number }>(dir, `chain-${n + 1}`);
      if (saved) { raw.push(saved); resumed++; log(`cadena ${n + 1}/${cats.length} (${category}): recuperada de disco`); continue; }
      log(`cadena ${n + 1}/${cats.length} (${category}): pidiendo a Qwen…`); const b = Date.now(), g = await generateChainV4(llm, { category, avoid: raw.map((r) => ({ titulo: r.chain.titulo, objeto: r.chain.objeto })), signal }); calls += g.calls;
      const rec = { chain: g.chain, issues: g.issues, attempts: g.attempts.length }; await writePart(dir, `chain-${n + 1}`, rec); raw.push(rec);
      log(`cadena ${n + 1}/${cats.length}: «${g.chain.titulo}» ${g.issues.length ? `con ${g.issues.length} aviso(s) estructural(es)` : "estructura OK"} (${g.attempts.length} intento/s) · ${((Date.now() - b) / 60000).toFixed(1)} min`);
    }
    const chains: ChainRecord[] = raw.map((r, n) => ({ id: `cadena-${String(n + 1).padStart(2, "0")}`, ...r, structurallyOk: r.issues.length === 0 }));
    for (let a = 0; a < chains.length; a++) for (let b = a + 1; b < chains.length; b++) { const w = duplicateChain(chains[a].chain, chains[b].chain); if (w && !chains[b].duplicateOf) { chains[b].duplicateOf = chains[a].id; chains[b].duplicateWhy = w; chains[b].structurallyOk = false; } }
    return { chains, stats: { calls, resumed, ms: Date.now() - t0 } } satisfies ChainStageOut;
  };
}

const LABEL: Record<string, string> = { situacion: "Situación", conflicto: "Conflicto", motivo: "Motivo de KAP", accion: "Acción", consecuencia: "Consecuencia", decision: "Momento de decisión", nuevaAccion: "Nueva acción", resultado: "Resultado", mentalidad: "Mentalidad" };
/** Documento legible para la APROBACIÓN HUMANA de las cadenas (con los avisos estructurales, nunca con un veredicto de un modelo). */
export function chainsMarkdown(out: ChainStageOut): string {
  const L = ["# Cadenas narrativas — para aprobación", "", "Solo hay validación ESTRUCTURAL (campos completos y sin truncar, acciones de KAP concretas, objeto con función, mentalidad derivada, sin duplicados). La lógica de la historia la decides tú.", ""];
  for (const c of out.chains) {
    L.push(`## ${c.id} · ${c.chain.titulo}`, `*Categoría: ${c.chain.category} · Objeto: **${c.chain.objeto}** · Estructura: ${c.structurallyOk ? "OK" : "CON AVISOS"} · intentos: ${c.attempts}*`, "");
    for (const f of FIELDS_V4) L.push(`${FIELDS_V4.indexOf(f) + 1}. **${LABEL[f]}:** ${c.chain[f]}`);
    if (c.issues.length || c.duplicateOf) { L.push("", "Avisos estructurales:"); for (const i of c.issues) L.push(`- ${i.msg}`); if (c.duplicateOf) L.push(`- duplica a ${c.duplicateOf}: ${c.duplicateWhy}`); }
    L.push("", "- [ ] aprobada · [ ] descartada · [ ] cambiar: ", "");
  }
  return L.join("\n");
}
