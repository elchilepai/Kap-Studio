/**
 * RESPUESTAS DE LA MEMORIA sobre la serie (deterministas, sin IA y basadas ÚNICAMENTE en el canon: el canon base que escribió el
 * usuario y los episodios aprobados y confirmados). Responden: «¿Qué ha vivido KAP hasta este momento?», «¿Dónde terminó?» y
 * «¿Qué debería saber el sistema antes de crear el siguiente episodio?».
 */
import { milestonesInOrder, stagesInOrder } from "./canon.ts";
import type { CanonState, CharState, EpisodeMemory, MilestoneState } from "./schema.ts";
import { clip, epLabel, slug } from "./text.ts";

export type Answer = { question: string; text: string; sections: { title: string; lines: string[] }[]; basedOn: string[]; empty: boolean };
export type StoryInput = { canon: CanonState; episodes: EpisodeMemory[] };

export const hero = (c: CanonState): CharState | undefined => (c.series ? c.characters[slug(c.series.protagonist)] : undefined);

export type ArcProgress = { total: number; achieved: number; inProgress: MilestoneState[]; next: MilestoneState[]; stage?: { key: string; title: string }; finished: boolean; byStage: { stage: string; title: string; milestones: MilestoneState[] }[] };
export function arcProgress(c: CanonState): ArcProgress {
  const ms = milestonesInOrder(c), h = hero(c), st = h?.stage ? c.stages?.[h.stage] : undefined;
  return { total: ms.length, achieved: ms.filter((m) => m.status === "achieved").length, inProgress: ms.filter((m) => m.status === "in_progress"), next: ms.filter((m) => m.status === "pending").slice(0, 3),
    ...(st ? { stage: { key: st.key, title: st.title } } : {}), finished: ms.length > 0 && ms.every((m) => m.status === "achieved"),
    byStage: stagesInOrder(c).map((s) => ({ stage: s.key, title: s.title, milestones: ms.filter((m) => m.stage === s.key) })) };
}

export type Evolution = { name: string; stage?: string; age?: number; appearance?: string; profile: { facet: string; value: string; previous?: string; since: number }[]; traits: { trait: string; level: number; previous?: number }[]; stageTimeline: string[]; ageTimeline: string[] };
export function evolutionOf(c: CanonState, name: string): Evolution | undefined {
  const ch = c.characters[slug(name)]; if (!ch) return undefined;
  const title = (k: string) => c.stages?.[k]?.title ?? k;
  return {
    name: ch.name, stage: ch.stage ? title(ch.stage) : undefined, age: ch.age, appearance: ch.appearance?.description,
    profile: Object.entries(ch.profile ?? {}).map(([facet, p]) => ({ facet, value: p.value, ...(p.history.length > 1 ? { previous: p.history.at(-2)!.value } : {}), since: p.history.at(-1)!.ep })),
    traits: Object.entries(ch.traits ?? {}).map(([trait, t]) => ({ trait, level: t.level, ...(t.history.length > 1 ? { previous: t.history.at(-2)!.value } : {}) })),
    stageTimeline: (ch.stageHistory ?? []).map((h) => `${title(h.value)} (${epLabel(h.ep)})`), ageTimeline: (ch.ageHistory ?? []).map((h) => `${h.value} años (${epLabel(h.ep)})`),
  };
}
export const evolutionLines = (e: Evolution, facetTitles?: Record<string, string>): string[] => [
  `${e.name}: ${[e.stage ? `etapa «${e.stage}»` : "", e.age !== undefined ? `≈ ${e.age} años` : "", e.appearance ? `aspecto ${e.appearance}` : ""].filter(Boolean).join("; ") || "sin etapa ni edad registradas"}.`,
  ...e.profile.map((p) => `${facetTitles?.[p.facet] ?? p.facet}: ${p.value}${p.previous ? ` (antes: ${p.previous})` : ""}`),
  ...e.traits.map((t) => `${t.trait}: nivel ${t.level}/10${t.previous !== undefined ? ` (antes ${t.previous})` : ""}`),
];

const sortEps = (eps: EpisodeMemory[]) => [...eps].sort((a, b) => a.order - b.order);
const basedOn = (eps: EpisodeMemory[]) => sortEps(eps).map((e) => epLabel(e.order));
const facetTitles = (c: CanonState) => Object.fromEntries(stagesInOrder(c).flatMap((s) => s.facets.map((f) => [slug(f), f])));

/** «¿Qué ha vivido KAP hasta este momento?» Solo con el canon base y los episodios aprobados. */
export function lifeSoFar({ canon, episodes }: StoryInput): Answer {
  const eps = sortEps(episodes), h = hero(canon), name = h?.name ?? canon.series?.protagonist ?? "el protagonista", sections: Answer["sections"] = [];
  const start = canon.facts.filter((f) => f.ep === 0).map((f) => f.text);
  if (start.length) sections.push({ title: "Punto de partida (canon inicial)", lines: start });
  if (!eps.length) sections.push({ title: "Episodios", lines: [`Todavía no hay episodios aprobados en el canon: ${name} aún no ha vivido nada «en pantalla». La historia empezará en el punto de partida.`] });
  else sections.push({ title: `Lo vivido, episodio a episodio (${eps.length})`, lines: eps.map((e) => {
    const marks = e.accepted.filter((c) => c.change.kind === "milestone.progress" || c.change.kind === "character.stage" || c.change.kind === "character.age").map((c) => c.text);
    return `${epLabel(e.order)} «${e.title}»: ${e.logline}${marks.length ? ` — ${marks.join("; ")}` : ""}${e.eventsText.length ? ` · Ocurre: ${e.eventsText.slice(0, 4).join("; ")}` : ""}`;
  }) });
  const arc = arcProgress(canon);
  if (arc.total) sections.push({ title: "Arco de la serie", lines: [`${arc.achieved}/${arc.total} hitos logrados${arc.stage ? `; etapa actual «${arc.stage.title}»` : ""}.`, ...arc.inProgress.map((m) => `En curso: ${m.title}`), ...(arc.finished ? ["Arco completo: la serie ha llegado a la cima."] : arc.next.map((m) => `Pendiente: ${m.title}`))] });
  const ev = h && evolutionOf(canon, h.name); if (ev) sections.push({ title: `Evolución de ${ev.name}`, lines: [...evolutionLines(ev, facetTitles(canon)), ...(ev.stageTimeline.length ? [`Etapas: ${ev.stageTimeline.join(" → ")}`] : []), ...(ev.ageTimeline.length ? [`Edades: ${ev.ageTimeline.join(" → ")}`] : [])] });
  const open = Object.values(canon.threads).filter((t) => t.status === "open"); if (open.length) sections.push({ title: "Conflictos abiertos", lines: open.map((t) => t.title) });
  return { question: `¿Qué ha vivido ${name} hasta este momento?`, text: sections.map((s) => `## ${s.title}\n${s.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n"), sections, basedOn: basedOn(eps), empty: !eps.length && !start.length };
}

/** «¿Dónde terminó KAP?» */
export function whereEnded({ canon, episodes }: StoryInput): Answer {
  const eps = sortEps(episodes), last = eps.at(-1), name = hero(canon)?.name ?? canon.series?.protagonist ?? "el protagonista";
  const sections: Answer["sections"] = [];
  if (!last) sections.push({ title: "Situación", lines: [`No hay episodios aprobados: ${name} sigue en el punto de partida del canon inicial.`, ...(hero(canon)?.location ? [`Lugar: ${hero(canon)!.location}`] : [])] });
  else { sections.push({ title: `Estado final del ${epLabel(last.order)} «${last.title}»`, lines: [last.endingSituation] });
    sections.push({ title: "Último plano", lines: [`Escena «${last.lastShot.scene}» en ${last.lastShot.location || "lugar sin definir"}; con ${last.lastShot.characters.join(", ") || "—"}.`, `«${clip(last.lastShot.text, 500)}»`] });
    if (last.hook) sections.push({ title: "Gancho", lines: [last.hook] }); }
  const open = Object.values(canon.threads).filter((t) => t.status === "open"); if (open.length) sections.push({ title: "Hilos abiertos", lines: open.map((t) => t.title) });
  return { question: `¿Dónde terminó ${name}?`, text: sections.map((s) => `## ${s.title}\n${s.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n"), sections, basedOn: last ? [epLabel(last.order)] : [], empty: !last };
}

const CHECK: { label: string; find: (c: CanonState, h: CharState) => string | undefined }[] = [
  { label: "Edad aproximada", find: (_c, h) => (h.age !== undefined ? `≈ ${h.age} años` : undefined) },
  { label: "Apariencia", find: (_c, h) => h.appearance?.description },
  { label: "Ropa", find: (_c, h) => h.outfit },
  { label: "Personalidad", find: (_c, h) => facet(h, /personalidad|caracter/) },
  { label: "Relación con su hermano", find: (c, h) => facet(h, /hermano/) ?? rel(c, h, /herman/) },
  { label: "Situación de sus padres", find: (c, h) => facet(h, /padres|familia/) ?? rel(c, h, /padres?|madre|padre/) },
  { label: "Amigos y enemigos", find: (c, h) => { const l = Object.values(c.relationships).filter((r) => (slug(r.a) === h.key || slug(r.b) === h.key) && /amig|enemig|rival|aliad|bully|acos/.test(slug(r.relation))).map((r) => `${slug(r.a) === h.key ? r.b : r.a}: ${r.relation}`); return l.length ? l.join("; ") : undefined; } },
  { label: "Personajes secundarios", find: (c, h) => { const l = Object.values(c.characters).filter((x) => x.key !== h.key && x.status === "active").map((x) => x.name); return l.length ? l.slice(0, 8).join(", ") : undefined; } },
  { label: "Lugares", find: (c) => { const l = Object.values(c.places).map((p) => p.name); return l.length ? l.slice(0, 8).join(", ") : undefined; } },
  { label: "Objetos importantes", find: (c) => { const l = Object.values(c.objects).map((o) => `${o.name} (${o.status === "intact" ? "ok" : o.status})`); return l.length ? l.slice(0, 8).join(", ") : undefined; } },
  { label: "Evolución musical", find: (_c, h) => facet(h, /music|rap|habilidad|talento/) ?? (h.traits?.talento ? `talento ${h.traits.talento.level}/10` : undefined) },
  { label: "Sueños y objetivos", find: (_c, h) => facet(h, /sueno|objetivo|meta/) },
  { label: "Conflictos abiertos", find: (c) => { const l = Object.values(c.threads).filter((t) => t.status === "open").map((t) => t.title); return l.length ? l.join("; ") : undefined; } },
  { label: "Acontecimientos anteriores", find: (c) => { const l = c.events.slice(-5).map((e) => e.title); return l.length ? l.join("; ") : undefined; } },
];
const facet = (h: CharState, re: RegExp) => Object.entries(h.profile ?? {}).filter(([k]) => re.test(k)).map(([, p]) => p.value).join("; ") || undefined;
const rel = (c: CanonState, h: CharState, re: RegExp) => { const r = Object.values(c.relationships).filter((x) => (slug(x.a) === h.key || slug(x.b) === h.key) && (re.test(slug(x.a)) || re.test(slug(x.b)) || re.test(slug(x.relation)))); return r.length ? r.map((x) => `${x.a} ↔ ${x.b}: ${x.relation}`).join("; ") : undefined; };

/** Lista de comprobación de continuidad del protagonista: qué sabe el sistema y qué NO sabe todavía. */
export function continuityChecklist(c: CanonState): { label: string; value?: string }[] { const h = hero(c); return h ? CHECK.map((k) => ({ label: k.label, value: k.find(c, h) })) : []; }

/** «¿Qué debería saber el sistema antes de crear el siguiente episodio?» */
export function beforeNext(inp: StoryInput): Answer {
  const { canon, episodes } = inp, eps = sortEps(episodes), last = eps.at(-1), arc = arcProgress(canon), list = continuityChecklist(canon), name = hero(canon)?.name ?? canon.series?.protagonist ?? "el protagonista";
  const sections: Answer["sections"] = [];
  sections.push({ title: "Dónde terminó", lines: last ? [last.endingSituation, `Último plano: «${clip(last.lastShot.text, 300)}»`, ...(last.hook ? [`Gancho que hay que retomar: «${last.hook}»`] : [])] : ["No hay episodios aprobados: el primero parte del canon inicial."] });
  if (arc.total) sections.push({ title: "Arco y siguiente paso", lines: [`Etapa actual: ${arc.stage ? `«${arc.stage.title}»` : "sin definir"}; ${arc.achieved}/${arc.total} hitos logrados.`, ...arc.inProgress.map((m) => `Hito en curso (continuarlo): ${m.title}`), ...arc.next.map((m, i) => `${i === 0 && !arc.inProgress.length ? "Siguiente hito" : "Después"}: ${m.title}`), "Un episodio = una etapa concreta; sin saltos de años; la cima no llega hasta completar el recorrido."] });
  sections.push({ title: `Lo que el sistema sabe de ${name}`, lines: list.filter((x) => x.value).map((x) => `${x.label}: ${x.value}`) });
  const missing = list.filter((x) => !x.value).map((x) => x.label);
  if (missing.length) sections.push({ title: "Sin datos todavía (confírmalo o decláralo antes de escribir)", lines: missing });
  if (canon.rules.length) sections.push({ title: "Reglas de la serie", lines: canon.rules.map((r) => r.text) });
  return { question: "¿Qué debería saber el sistema antes de crear el siguiente episodio?", text: sections.map((s) => `## ${s.title}\n${s.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n"), sections, basedOn: basedOn(eps), empty: !eps.length };
}
