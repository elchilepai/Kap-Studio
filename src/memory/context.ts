/**
 * PAQUETE DE CONTEXTO para continuar un episodio. No carga la historia entera: selecciona lo relevante (el estado final del
 * episodio anterior, su último plano, los personajes que importan, sus relaciones, objetos, hilos abiertos, reglas y la
 * continuidad visual) y lo recorta a un PRESUPUESTO DE TOKENS. Es texto en español + estructura, independiente de cualquier modelo.
 */
import type { CanonState, ContextPack, ContextSection, EpisodeMemory, EpisodeRequest } from "./schema.ts";
import { arcProgress, evolutionLines, evolutionOf, hero } from "./story.ts";
import { stagesInOrder } from "./canon.ts";
import { clip, epLabel, estimateTokens, slug } from "./text.ts";

/** Formato de la serie que el guion debe cumplir (se entrega al modelo en cada petición). */
export const SERIES_FORMAT = "Serie serializada y continua: cada episodio es consecuencia del anterior. Dura ≈ 5 minutos (≈ 700-800 palabras entre narración y diálogo) y cuenta UNA etapa concreta del recorrido. Estructura obligatoria, declarada con [acto: inicio|conflicto|desarrollo|emocional|resolucion | texto] y [gancho: texto]: inicio, conflicto, desarrollo, punto emocional o de tensión, resolución parcial y gancho para el siguiente episodio. Debe aportar algo nuevo (acontecimiento, hito, evolución, relación) y declararlo con directivas.";

export type CharLook = { name: string; look?: string; designVersion?: number; outfits?: string[] };
export type PlaceLook = { name: string; look?: string };
export type ContextInput = {
  request: EpisodeRequest; canon: CanonState; episodes: EpisodeMemory[];
  characters?: CharLook[]; places?: PlaceLook[]; budgetTokens?: number; maxCharacters?: number;
};
export const DEFAULT_CONTEXT_TOKENS = 3500;   // pensado para modelos locales de 4-8 B con contexto de 8k: deja sitio al guion

export function relevantCharacters(inp: ContextInput): string[] {
  const { canon, request, episodes } = inp, max = inp.maxCharacters ?? 8, out: string[] = [], seen = new Set<string>();
  const add = (n: string) => { const k = slug(n); if (k && !seen.has(k) && canon.characters[k]) { seen.add(k); out.push(canon.characters[k].name); } };
  request.cast.forEach(add);
  const prev = episodes.find((e) => e.order === request.continuesFrom);
  prev?.lastShot.characters.forEach(add); prev?.present.forEach(add);
  Object.values(canon.threads).filter((t) => t.status === "open").forEach((t) => t.involves.forEach(add));
  Object.values(canon.characters).filter((c) => c.status === "active").sort((a, b) => b.lastSeen - a.lastSeen).forEach((c) => add(c.name));
  return out.slice(0, max);
}

export function buildContextPack(inp: ContextInput): ContextPack {
  const { request, canon, episodes } = inp, budget = inp.budgetTokens ?? DEFAULT_CONTEXT_TOKENS;
  const prev = episodes.find((e) => e.order === request.continuesFrom);
  const rel = relevantCharacters(inp), relSet = new Set(rel.map(slug));
  const look = new Map((inp.characters ?? []).map((c) => [slug(c.name), c]));
  const objs = Object.values(canon.objects);
  const S: ContextSection[] = [];
  const sec = (id: string, title: string, priority: number, required: boolean, items: string[]) => { if (items.length) S.push({ id, title, priority, required, items }); };

  sec("request", "Petición", 1, true, [`Episodio ${request.number} (temporada ${request.season})${request.continuesFrom !== undefined ? `, continúa del ${epLabel(request.continuesFrom)}${request.exact ? " EXACTAMENTE donde terminó (sin saltos de tiempo ni de lugar salvo que se indique)" : ""}` : ""}.`, ...(request.notes ? [`Petición del usuario: «${clip(request.notes, 400)}»`] : [])]);
  if (canon.series) sec("format", "Formato de la serie", 1.5, true, [SERIES_FORMAT]);
  if (prev) {
    sec("final", `Estado final del ${epLabel(prev.order)} («${prev.title}»)`, 2, true, [prev.endingSituation, ...(prev.summary ? [`Resumen: ${clip(prev.summary, 500)}`] : [])]);
    sec("lastshot", `Último plano del ${epLabel(prev.order)}`, 3, true, [`Escena «${prev.lastShot.scene}» en ${prev.lastShot.location || "lugar sin definir"}; personajes: ${prev.lastShot.characters.join(", ") || "—"}.`, `Texto literal: «${clip(prev.lastShot.text, 600)}»`, ...(prev.lastShot.directions.length ? [`Direcciones: ${prev.lastShot.directions.join("; ")}`] : [])]);
  }
  if (prev?.hook) sec("hook", `Gancho que dejó el ${epLabel(prev.order)} (hay que retomarlo)`, 3.2, true, [prev.hook]);
  if (canon.series) {
    const arc = arcProgress(canon), titles = Object.fromEntries(stagesInOrder(canon).flatMap((s) => s.facets.map((f) => [slug(f), f])));
    sec("arc", "Arco de la serie", 3.5, true, [
      `Protagonista: ${canon.series.protagonist}. Etapa actual: ${arc.stage ? `«${arc.stage.title}»` : "sin definir"}. Hitos logrados: ${arc.achieved}/${arc.total}${arc.finished ? " (arco completo)" : ""}.`,
      ...arc.inProgress.map((m) => `Hito en curso (continúalo o ciérralo): ${m.title}`), ...arc.next.map((m, i) => `${i === 0 && !arc.inProgress.length ? "Siguiente hito" : "Después"}: ${m.title}`),
      "No saltes hitos ni años: la llegada a la cima no ocurre hasta que el recorrido anterior esté contado.",
      ...arc.byStage.filter((s) => s.milestones.some((m) => m.status === "achieved")).map((s) => `Logrado en «${s.title}»: ${s.milestones.filter((m) => m.status === "achieved").map((m) => m.title).join("; ")}`)]);
    const h = hero(canon), ev = h && evolutionOf(canon, h.name);
    if (ev) sec("evolution", `Evolución de ${ev.name} hasta ahora`, 4.5, true, evolutionLines(ev, titles));
  }
  sec("characters", "Personajes relevantes", 4, true, rel.map((n) => {
    const c = canon.characters[slug(n)], own = objs.filter((o) => o.owner && slug(o.owner) === slug(n)).map((o) => o.name);
    return `${c.name} — ${c.status === "active" ? "activo" : c.status === "dead" ? "muerto" : "ausente"}${c.location ? `; en ${c.location}` : ""}${c.outfit ? `; lleva ${c.outfit}` : ""}${own.length ? `; tiene ${own.join(", ")}` : ""}${c.knows.length ? `; sabe: ${c.knows.slice(0, 3).join(" | ")}` : ""}.`;
  }));
  sec("relationships", "Relaciones actuales", 5, false, Object.values(canon.relationships).filter((r) => relSet.has(slug(r.a)) || relSet.has(slug(r.b))).sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust))
    .map((r) => `${r.a} ↔ ${r.b}: ${r.relation} (confianza ${r.trust > 0 ? "+" : ""}${r.trust}; desde ${epLabel(r.since)})${r.note ? ` — ${r.note}` : ""}`));
  const open = Object.values(canon.threads).filter((t) => t.status === "open"), recentClosed = Object.values(canon.threads).filter((t) => t.status === "closed").sort((a, b) => (b.closedIn ?? 0) - (a.closedIn ?? 0)).slice(0, 3);
  const threadLine = (t: typeof open[number]) => `«${t.title}» (abierto en ${epLabel(t.openedIn)}${t.involves.length ? `; implicados: ${t.involves.join(", ")}` : ""})${t.notes.length ? ` — ${t.notes.at(-1)}` : ""}`;
  const isRel = (t: typeof open[number]) => t.involves.length === 0 || t.involves.some((n) => relSet.has(slug(n)));   // sin implicados declarados: afecta a la historia entera
  sec("threads", "Hilos narrativos abiertos", 6, false, [...open.filter(isRel).map(threadLine), ...recentClosed.filter(isRel).map((t) => `(cerrado en ${epLabel(t.closedIn ?? 0)}) «${t.title}»`)]);
  sec("threads-other", "Otros hilos abiertos (no implican a los personajes relevantes)", 12, false, open.filter((t) => !isRel(t)).map(threadLine));
  sec("objects", "Objetos importantes", 7, false, objs.filter((o) => (o.owner && relSet.has(slug(o.owner))) || (!o.owner && o.lastOwner && relSet.has(slug(o.lastOwner))) || o.status !== "intact")
    .sort((a, b) => b.lastChangedIn - a.lastChangedIn).map((o) => `«${o.name}» — ${o.status === "intact" ? "en buen estado" : o.status === "damaged" ? "dañado" : o.status === "destroyed" ? "DESTRUIDO (no puede volver a usarse sin repararlo)" : "PERDIDO"}${o.owner ? `; de ${o.owner}` : o.lastOwner ? `; era de ${o.lastOwner}` : ""}${o.location ? `; está en ${o.location}` : ""}.`));
  sec("rules", "Reglas del universo", 8, true, canon.rules.map((r) => r.text));
  sec("visual", "Continuidad visual", 9, false, [
    ...rel.map((n) => { const c = canon.characters[slug(n)], l = look.get(slug(n)); return `${c.name}: ${[c.outfit ? `ropa «${c.outfit}»` : "", c.accessories.length ? `accesorios ${c.accessories.join(", ")}` : "", l?.look ? `aspecto ${l.look}` : "", l?.designVersion ? `diseño v${l.designVersion}` : ""].filter(Boolean).join("; ") || "sin datos visuales fijados"}.`; }),
    ...(prev?.lastShot.location ? (inp.places ?? []).filter((p) => slug(p.name) === slug(prev.lastShot.location)).map((p) => `Lugar del último plano «${p.name}»: ${p.look ?? "escenario ya definido (mantener)"}.`) : []),
  ]);
  sec("facts", "Hechos confirmados", 10, false, [...canon.facts.filter((f) => f.knownBy.some((n) => relSet.has(slug(n))) || f.k).map((f) => f.text), ...canon.facts.filter((f) => !f.k && !f.knownBy.length).slice(-6).map((f) => f.text)]);
  sec("history", "Episodios anteriores (resumen)", 13, false, [...episodes].sort((a, b) => b.order - a.order).filter((e) => e.order !== request.continuesFrom && (request.continuesFrom === undefined || e.order < request.continuesFrom)).map((e) => `${epLabel(e.order)} «${e.title}»: ${e.logline}`));

  // ---- ajuste al presupuesto: se incluyen elementos por prioridad; un elemento que no cabe cierra su sección (no se salta) ----
  const chosen = new Map(S.map((s) => [s.id, [] as string[]])), closed = new Set<string>();
  const render = () => {
    const lines = [`# Contexto de continuidad — Episodio ${request.number}${request.continuesFrom !== undefined ? ` (continúa del ${epLabel(request.continuesFrom)})` : ""}`];
    for (const s of S) { const it = chosen.get(s.id)!; if (it.length) lines.push("", `## ${s.title}`, ...it.map((x) => `- ${x}`)); }
    return lines.join("\n");
  };
  const tokens = () => estimateTokens(render());
  for (const s of S.filter((x) => x.required)) { chosen.get(s.id)!.push(s.items[0]); }   // lo imprescindible entra siempre (recortado si hace falta)
  let over = false;
  if (tokens() > budget) {   // recorte de emergencia de lo imprescindible
    for (const s of S.filter((x) => x.required)) { const it = chosen.get(s.id)!; it[0] = clip(it[0], 200); }
    over = tokens() > budget;
  }
  const queue = S.flatMap((s) => s.items.map((text, i) => ({ s, text, i }))).filter((q) => !(q.s.required && q.i === 0)).sort((a, b) => a.s.priority - b.s.priority || a.i - b.i);
  for (const q of queue) {
    if (closed.has(q.s.id)) continue;
    const cur = chosen.get(q.s.id)!; if (cur.length !== q.i) { closed.add(q.s.id); continue; }
    cur.push(q.text); if (tokens() > budget) { cur.pop(); closed.add(q.s.id); }
  }
  const text = render();
  const sections = S.map((s) => { const it = chosen.get(s.id)!; return { id: s.id, title: s.title, text: it.join("\n"), tokens: estimateTokens(it.join("\n")), itemsTotal: s.items.length, itemsIncluded: it.length }; });
  return { request, budgetTokens: budget, usedTokens: estimateTokens(text), sections, dropped: sections.filter((s) => s.itemsIncluded < s.itemsTotal).map((s) => ({ section: s.id, items: s.itemsTotal - s.itemsIncluded })), relevantCharacters: rel, text, ...(over ? { overBudget: true } : {}) };
}
