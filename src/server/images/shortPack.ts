/**
 * PACK DE UN SHORT VISUAL (salida de KAP Studio; sin vídeo): idea, hooks, guion, storyboard, narración limpia para ElevenLabs, subtítulos, prompts de imagen,
 * orden y duración, apariciones de KAP, ritmo visual y checklist de calidad. El montaje final (voz, zoom, paneo, música, efectos) se hace fuera, en CapCut.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { FORMAT_9_16, GLOBAL_NEGATIVE_PROMPT, KAP_CHARACTER_BIBLE, KAP_REF, SECONDARY_CHARACTER_BIBLE, STYLE_BIBLE, STYLE_REFS } from "@/narrative/styleBible";
import { finalPrompt, scenePrompt } from "@/narrative/visualPrompt";
import { BANNED_OPENINGS, kapIssues, narrationSeconds, structureErrors, totalSeconds, visualRhythmCheck, type RhythmWarning, type ShortPack, type VisualScene } from "@/narrative/visualShort";

const pad = (n: number) => String(n).padStart(2, "0");
const tc = (sec: number) => { const ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms % 1000).padStart(3, "0")}`; };

/** Subtítulos (.srt): una línea por escena, con los tiempos acumulados de las duraciones. */
export function srt(scenes: VisualScene[]): string { let t = 0; return scenes.map((s) => { const a = t; t += s.duration; return `${s.n}\n${tc(a)} --> ${tc(t - 0.05)}\n${s.subtitle}\n`; }).join("\n"); }
/** Guion limpio para ElevenLabs: SOLO lo que se dice, un párrafo por escena (la pausa entre párrafos marca el cambio de imagen). Nunca lleva descripciones visuales. */
export const narrationClean = (scenes: VisualScene[]) => scenes.map((s) => s.narration.trim()).join("\n\n") + "\n";
export const scriptText = (scenes: VisualScene[]) => scenes.map((s) => `${s.sceneType === "KAP_PRESENTADOR" ? "KAP: " : ""}${s.narration.trim()}`).join("\n");

export type CheckItem = { ok: boolean | null; text: string; detail?: string };   // null = revisión humana
/** Checklist de calidad antes de exportar: lo comprobable se comprueba; lo que necesita criterio humano queda como pendiente (☐). */
export function qualityChecklist(pack: ShortPack): CheckItem[] {
  const S = pack.scenes, errs = structureErrors(S), warns = visualRhythmCheck(S), total = totalSeconds(S), hook = pack.hooks[pack.chosenHook];
  const kap = S.filter((s) => s.kapPresent), kapErr = kapIssues(S);
  const visualInNarration = S.filter((s) => /\b(?:KAP|la imagen|se ve|aparece en pantalla|plano)\b.*\b(?:camina|mira|se sienta|aparece)\b/i.test(s.narration));
  return [
    { ok: errs.length === 0, text: "Estructura válida (8-14 escenas, campos completos, tipos válidos)", detail: errs.map((e) => e.message).join("; ") || undefined },
    { ok: total >= 30 && total <= 60, text: `Duración total entre 30 y 60 s`, detail: `${total} s` },
    { ok: !!hook && !BANNED_OPENINGS.test(hook.text), text: "El hook elegido entra directo (sin «hoy vamos a hablar de…», «hola», «en este vídeo…»)", detail: hook?.text },
    { ok: pack.hooks.length >= 3, text: "Hay varias variantes de hook de tipos distintos", detail: `${new Set(pack.hooks.map((h) => h.type)).size} tipos` },
    { ok: kapErr.length === 0 && kap.length > 0, text: "KAP aparece y cada aparición está justificada", detail: kap.map((s) => `${pad(s.n)} (${s.kapReason})`).join(", ") || "KAP no aparece" },
    { ok: !warns.some((w) => w.id === "kap-consecutivos" || w.id === "kap-demasiado"), text: "KAP no aparece en escenas seguidas ni en demasiadas" },
    { ok: !warns.some((w) => w.id === "poca-variedad"), text: "Variedad de tipos de escena", detail: `${new Set(S.map((s) => s.sceneType)).size} tipos` },
    { ok: !warns.some((w) => ["demasiados-dialogos", "escenas-estaticas", "sin-accion-visual"].includes(w.id)), text: "La imagen demuestra: no hay estructura de personajes hablando ni escenas estáticas" },
    { ok: !warns.some((w) => ["sin-contraste", "sin-transformacion", "ilustra-literal"].includes(w.id)), text: "Hay contraste y cambio visual; las escenas no se limitan a ilustrar la frase" },
    { ok: visualInNarration.length === 0, text: "La narración no contiene instrucciones visuales (lo que se dibuja no se dice)" },
    { ok: S.every((s) => s.subtitle.trim().length > 0 && s.subtitle.length <= 60), text: "Cada escena tiene subtítulo corto (≤ 60 caracteres)" },
    { ok: S.every((s) => s.visualEn.trim().length > 0), text: "Cada escena tiene prompt de imagen" },
    { ok: null, text: "Revisar las afirmaciones psicológicas del guion contra una fuente fiable", detail: (pack.idea.claims ?? []).join(" · ") || "sin afirmaciones declaradas" },
    { ok: null, text: "Sin diagnósticos ni lenguaje clínico; en relaciones, enfoque respetuoso (comunicación, escucha, límites), sin trucos de manipulación" },
    { ok: null, text: "Las imágenes generadas mantienen a KAP, a los secundarios, la paleta y el mundo visual idénticos entre escenas" },
  ];
}
const mark = (c: CheckItem) => (c.ok === null ? "☐" : c.ok ? "✅" : "❌");
const checklistMd = (items: CheckItem[]) => `# Checklist de calidad\n\n${items.map((c) => `- ${mark(c)} ${c.text}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}\n\n✅ cumple · ❌ no cumple · ☐ revisión humana pendiente\n`;
const rhythmMd = (w: RhythmWarning[]) => `# Ritmo visual (avisos de calidad, no reglas rígidas)\n\n${w.length ? w.map((x) => `- **${x.id}**: ${x.message}${x.scenes?.length ? ` (escenas ${x.scenes.map(pad).join(", ")})` : ""}`).join("\n") : "Sin avisos."}\n`;

const tableMd = (S: VisualScene[]) => { let t = 0; return `| # | Tipo | Entra en | Dur. | Plano | KAP | Narración |\n|---|---|---|---|---|---|---|\n${S.map((s) => { const a = t; t += s.duration; return `| ${pad(s.n)} | ${s.sceneType} | ${a.toFixed(1)} s | ${s.duration.toFixed(1)} s | ${s.shot} | ${s.kapPresent ? `sí (${s.kapReason})` : "no"} | ${s.narration.replace(/\|/g, "/")} |`; }).join("\n")}\n\n**Total: ${totalSeconds(S)} s · ${S.length} escenas**\n`; };
const storyboardMd = (S: VisualScene[]) => S.map((s) => `## ESCENA ${pad(s.n)} — ${s.sceneType}\n- **Narración** (se dice): "${s.narration}"\n- **Visual** (se dibuja, NO se dice): ${s.visual}\n- **Acción visual**: ${s.visualAction}\n- **Personajes**: ${s.characters.join(", ") || "—"} · **KAP**: ${s.kapPresent ? `sí — ${s.kapReason}: ${s.kapWhy}` : "no"}\n- **Lugar**: ${s.location} · **Plano**: ${s.shot}${s.camera ? ` · ${s.camera}` : ""}${s.composition ? ` · ${s.composition}` : ""} · **Emoción**: ${s.emotion}\n- **Propósito**: ${s.purpose} · **Duración**: ${s.duration.toFixed(1)} s · **Subtítulo**: «${s.subtitle}»\n`).join("\n");

/** Escribe el pack en `dir` y devuelve la lista de ficheros, el ritmo visual y la checklist. */
export async function writeShortPack(dir: string, pack: ShortPack, o: { root?: string } = {}): Promise<{ files: string[]; warnings: RhythmWarning[]; checklist: CheckItem[] }> {
  const errs = structureErrors(pack.scenes); if (errs.length) throw new Error(`El storyboard no es válido: ${errs.map((e) => e.message).join("; ")}`);
  const root = o.root ?? process.cwd(), files: string[] = [], S = pack.scenes, warnings = visualRhythmCheck(S), checklist = qualityChecklist(pack);
  const w = async (rel: string, text: string) => { const f = path.join(dir, rel); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, text); files.push(rel); };
  await w("01-idea.md", `# ${pack.idea.title}\n\n- **Categoría**: ${pack.idea.category}\n- **Planteamiento**: ${pack.idea.premise}\n- **Por qué funciona**: ${pack.idea.whyItWorks}\n${pack.idea.claims?.length ? `- **Afirmaciones a verificar**: ${pack.idea.claims.join(" · ")}\n` : ""}`);
  await w("02-hooks.md", `# Hooks\n\n${pack.hooks.map((h, i) => `${i === pack.chosenHook ? "👉" : "-"} **${h.type}**: ${h.text}`).join("\n")}\n\n**Elegido**: ${pack.hooks[pack.chosenHook]?.text ?? "—"}\n`);
  await w("03-guion.md", `# Guion (solo lo que se dice)\n\n${scriptText(S)}\n`);
  await w("04-storyboard.md", `# Storyboard\n\n${tableMd(S)}\n${storyboardMd(S)}`); await w("storyboard.json", JSON.stringify(pack, null, 1));
  await w("narracion-elevenlabs.txt", narrationClean(S)); await w("subtitulos.srt", srt(S)); await w("subtitulos.txt", S.map((s) => `${pad(s.n)}  ${s.subtitle}`).join("\n") + "\n");
  for (const s of S) { const p = finalPrompt(s); await w(`prompts/scene-${pad(s.n)}.txt`, `${p.prompt}\n\n--- NEGATIVE PROMPT (global) ---\n${p.negative}\n\n--- ATTACH AS REFERENCE ---\n${p.references.join("\n")}\n`); }
  await w("prompts-cortos.md", `# Prompts cortos (solo la escena; pega la Style Bible global una vez en tu generador, ver globales/)\n\n${S.map((s) => `## ${pad(s.n)} — ${s.sceneType}\n\`\`\`\n${scenePrompt(s)}\n\`\`\`\n`).join("\n")}`);
  await w("globales/style-bible.txt", STYLE_BIBLE + "\n"); await w("globales/kap-character-bible.txt", KAP_CHARACTER_BIBLE + "\n"); await w("globales/secondary-character-bible.txt", Object.values(SECONDARY_CHARACTER_BIBLE).map((x) => `- ${x}`).join("\n") + "\n"); await w("globales/global-negative-prompt.txt", GLOBAL_NEGATIVE_PROMPT + "\n"); await w("globales/format-9-16.txt", FORMAT_9_16 + "\n");
  await w("orden-y-duracion.md", `# Orden de las imágenes y duración\n\n${tableMd(S)}`);
  await w("apariciones-kap.md", `# Apariciones de KAP\n\n${S.filter((s) => s.kapPresent).map((s) => `- Escena ${pad(s.n)} (${s.kapReason}): ${s.kapWhy} — «${s.narration}»`).join("\n") || "KAP no aparece."}\n\nKAP aparece en ${S.filter((s) => s.kapPresent).length} de ${S.length} escenas.\n`);
  await w("ritmo-visual.md", rhythmMd(warnings)); await w("checklist.md", checklistMd(checklist));
  await fs.mkdir(path.join(dir, "imagenes"), { recursive: true }); await fs.mkdir(path.join(dir, "referencias"), { recursive: true });
  for (const ref of [KAP_REF, ...STYLE_REFS]) { try { await fs.copyFile(path.join(root, ref), path.join(dir, "referencias", path.basename(ref))); files.push(`referencias/${path.basename(ref)}`); } catch { /* sin referencia */ } }
  await w("LEEME.md", `# Cómo usar este pack\n\n1. Carga (o pega una vez) los textos de \`globales/\` en tu generador de imágenes y adjunta \`referencias/\` (KAP: reference.jpg; estilo: el resto).\n2. Para cada escena usa \`prompts/scene-NN.txt\` (prompt final) o \`prompts-cortos.md\` si tu generador ya tiene la Style Bible cargada. Guarda la imagen como \`imagenes/scene-NN.png\`.\n3. \`narracion-elevenlabs.txt\` es lo único que se locuta (un párrafo por escena).\n4. Importa \`subtitulos.srt\` y monta en CapCut con \`orden-y-duracion.md\`: zoom, paneo, transiciones, música y efectos.\n5. Revisa \`checklist.md\` y \`ritmo-visual.md\` antes de exportar.\n`);
  return { files, warnings, checklist };
}
