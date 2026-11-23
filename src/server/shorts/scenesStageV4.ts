/**
 * ETAPA «script» V4: de una cadena APROBADA a guion (30-45 s) + 8-10 escenas con cámara sugerida. Una llamada (más una regeneración si falla la estructura); resultado guardado y documento legible para revisar
 * si la historia funciona visualmente. NO genera prompts de imagen ni imágenes: el pipeline se detiene aquí para la revisión humana.
 */
import type { LlmClient } from "@/ports/studio";
import type { Chain, Issue } from "@/narrative/chainV4";
import { script, totalSeconds, type Plan } from "@/narrative/scenePlanV4";
import { generatePlanV4 } from "@/server/ai/scenesV4";
import type { StageFn } from "./stages";

export type ScriptStageOut = { chain: Chain; plan: Plan; issues: Issue[]; attempts: number; seconds: number; script: string };
export function scriptStageV4(llm: LlmClient, chain: Chain, o: { log?: (m: string) => void } = {}): StageFn {
  return async ({ signal }) => {
    o.log?.(`pidiendo guion y escenas de «${chain.titulo}» a Qwen…`); const t0 = Date.now(), g = await generatePlanV4(llm, chain, { signal });
    o.log?.(`guion y escenas: ${g.plan.escenas.length} escenas, ${totalSeconds(g.plan)} s, ${g.issues.length ? `${g.issues.length} aviso(s) estructural(es)` : "estructura OK"} (${g.attempts.length} intento/s) · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    return { chain, plan: g.plan, issues: g.issues, attempts: g.attempts.length, seconds: totalSeconds(g.plan), script: script(g.plan) } satisfies ScriptStageOut;
  };
}
const FIELDS = ["situacion", "conflicto", "motivo", "accion", "consecuencia", "decision", "nuevaAccion", "resultado", "mentalidad"] as const;
/** Documento para REVISAR: guion completo, escenas (qué ocurre, qué aparece, cámara) y avisos estructurales. */
export function scriptMarkdown(o: ScriptStageOut): string {
  const { chain, plan } = o, L = [`# ${chain.titulo} — guion y escenas (para revisión)`, "", `*Objeto central: **${chain.objeto}** · ${plan.escenas.length} escenas · ${o.seconds} s · intentos: ${o.attempts}*`, "", "## Cadena aprobada", ""];
  FIELDS.forEach((f, n) => L.push(`${n + 1}. **${f}:** ${chain[f]}`));
  L.push("", "## Guion completo (lo que se dice, en orden)", ""); let t = 0; for (const e of plan.escenas) { if (e.dialogo.trim()) L.push(`- **[${t.toFixed(0)} s · escena ${e.n}]** ${e.dialogo.trim()}`); t += e.duracion; }
  L.push("", `*Música:* ${plan.musica}`, "", "## Escenas", ""); t = 0;
  for (const e of plan.escenas) { L.push(`### Escena ${e.n} · ${t.toFixed(0)}-${(t + e.duracion).toFixed(0)} s · ${e.tipo} · cubre: ${e.cubre.join(", ")}`, `- **Qué ocurre:** ${e.queOcurre}`, `- **KAP en pantalla:** ${e.kapPresente ? "sí" : `no — ${e.experiencia}`}`, `- **Aparece en pantalla:** ${e.enPantalla.join("; ")}${e.textoEnPantalla.trim() ? ` · texto: «${e.textoEnPantalla}»` : ""}`, `- **Plano:** ${e.plano} · **perspectiva:** ${e.perspectiva}`, `- **Cámara sugerida (CapCut):** ${e.camara} — ${e.camaraNota}`, `- **Voz:** ${e.dialogo.trim() ? `«${e.dialogo.trim()}»` : "(silencio)"}`, ""); t += e.duracion; }
  if (o.issues.length) { L.push("## Avisos estructurales", ""); for (const i of o.issues) L.push(`- ${i.msg}`); }
  return L.join("\n");
}
