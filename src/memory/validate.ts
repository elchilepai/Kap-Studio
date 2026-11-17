/**
 * VALIDACIÓN DE CONTINUIDAD sin IA. Compara el episodio (escenas + directivas + reparto) con el canon vigente y devuelve hallazgos
 * de tres niveles: error crítico, advertencia e información nueva pendiente de confirmar. NO bloquea nada por sí sola: informa
 * antes de aprobar; decide el usuario.
 */
import { applyChange, findMilestone, findStage, milestonesInOrder, stagesInOrder } from "./canon.ts";
import { ACT_LABEL, type ActKind, type CanonState, type Change, type Finding, type ProposedChange, type Severity } from "./schema.ts";
import type { EpisodeInput, PerScene } from "./extract.ts";
import type { ParsedMemory } from "./directives.ts";
import { epLabel, hash, norm, orderOf, slug } from "./text.ts";

/** Umbrales de la regla «sin saltos artificiales de años» (ajustables): cuántos años de golpe entre dos episodios se consideran sospechosos. */
export const MAX_AGE_JUMP_WARN = 2, MAX_AGE_JUMP_ERROR = 4, PHYSICAL_EVOLUTION_YEARS = 3;
/** Un episodio dura ≈ 5 minutos (±20 %). */
export const EPISODE_TARGET_SEC = 300, EPISODE_TOLERANCE = 0.2;
export const REQUIRED_ACTS: ActKind[] = ["inicio", "conflicto", "desarrollo", "emocional", "resolucion", "gancho"];

export type ValidateInput = { episode: EpisodeInput; canon: CanonState; perScene: PerScene[]; changes?: ProposedChange[]; manual?: ParsedMemory;
  /** Último plano del episodio del que continúa (si se conoce): solo quien salía en él debe arrancar en el mismo sitio. */
  previousLastShot?: { characters: string[]; location: string };
  /** Gancho del episodio anterior (si continúa de él): se recuerda para retomarlo. */
  previousHook?: string };

const CONTEXT = /\b(perdi|perdio|perdid|ya no|falta|buscan?|buscar|recuerd|echa de menos|destruid|destruy|rot[oa]s?|rompi|rota|donde esta|donde estaba|sin su|sin la|sin el|nunca mas|desaparec|robaron|robo)\w*/;
const USE_VERB = /\b(usa|usan|usar|usando|monta|montan|pedalea|pedalean|conduce|conducen|conducir|coge|coges|cogen|agarra|agarran|lleva|llevan|sostiene|empuna|abre|abren|enciende|encienden|toma|saca|sube a|sube en|se sube|maneja|maneja|llama con|marca)\b/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentionRe = (name: string) => new RegExp(`(^|[^a-z0-9])${esc(norm(name))}(s|es)?([^a-z0-9]|$)`);

export function validateContinuity(inp: ValidateInput): Finding[] {
  const ep = inp.episode, order = orderOf(ep.season, ep.number), out: Finding[] = [];
  const add = (severity: Severity, rule: string, text: string, scene?: number, subject?: string) => {
    const id = `f_${hash(`${rule}|${scene ?? ""}|${text}`)}`; if (out.some((f) => f.id === id)) return;
    out.push({ id, severity, rule, text, ...(scene !== undefined ? { scene, sceneTitle: ep.scenes[scene]?.title } : {}), ...(subject ? { subject } : {}) });
  };
  let sim = inp.canon;
  const outfitWarned = new Set<string>(), moments = new Map<string, { scene: number; location: string; names: string[] }[]>();
  const castOutfit = new Map(ep.characters.filter((c) => c.castOutfit).map((c) => [slug(c.name), c.castOutfit!]));
  const manualChanges = inp.manual?.changes ?? [];

  ep.scenes.forEach((sc, i) => {
    const p = inp.perScene[i]?.parsed ?? { changes: [], uses: [], acts: [], errors: [] }; const fb = !!p.flashback;
    const names = [...new Set([...sc.characterNames, ...sc.lines.map((l) => l.speaker ?? "").filter(Boolean)])];
    const declaredHere: Change[] = [...p.changes, ...(i === 0 ? manualChanges : [])];
    const enters = (n: string) => sc.directions.some((d) => /^entra\s*:/i.test(d) && norm(d).includes(norm(n)));
    const sceneNo = i + 1;
    for (const e of p.errors) add("warning", "directiva", `Directiva de memoria no entendida: ${e}`, i);

    // R1 · personajes ausentes o muertos que aparecen
    for (const n of names) {
      const c = sim.characters[slug(n)]; if (!c || fb) continue;
      const explained = declaredHere.some((d) => d.kind === "character.status" && slug(d.name) === slug(n) && d.status === "active") || enters(n);
      if (c.status === "dead" && !explained) add("error", "personaje-muerto", `${c.name} murió en ${epLabel(c.statusSince ?? 0)} y aparece en la escena ${sceneNo} sin explicación (usa [reaparece: ${c.name}] o [flashback: sí] si es intencionado).`, i, c.name);
      else if (c.status === "absent" && !explained) add("warning", "personaje-ausente", `${c.name} estaba ausente desde ${epLabel(c.statusSince ?? 0)} y aparece en la escena ${sceneNo} sin explicación (usa [reaparece: ${c.name}] o una entrada con [entra: …]).`, i, c.name);
    }

    // R2 · cambio de ropa sin razón (una vez por personaje y episodio)
    for (const n of names) {
      const c = sim.characters[slug(n)], want = castOutfit.get(slug(n)); if (!c?.outfit || !want || outfitWarned.has(slug(n)) || fb) continue;
      if (norm(c.outfit) !== norm(want) && !declaredHere.some((d) => d.kind === "character.outfit" && slug(d.name) === slug(n))) { outfitWarned.add(slug(n)); add("warning", "cambio-ropa", `${c.name} llevaba «${c.outfit}» y en este episodio lleva «${want}» sin razón declarada (usa [ropa: ${c.name}, …] si es un cambio intencionado).`, i, c.name); }
    }

    // R3/R4 · objetos: destruidos o perdidos que aparecen, objetos ajenos o sin introducir
    const lines = [...sc.lines.map((l) => (l.speaker ? `${l.speaker} ${l.text}` : l.text)), ...(sc.narration ? [sc.narration] : []), ...sc.directions];
    const restored = (key: string) => declaredHere.some((d) => (d.kind === "object.update" && slug(d.name) === key && (d.status === "intact" || (d.owner && d.status !== "lost" && d.status !== "destroyed"))) || (d.kind === "object.introduce" && slug(d.name) === key));
    for (const o of Object.values(sim.objects)) {
      if (!(o.status === "lost" || o.status === "destroyed") || restored(o.key) || fb) continue;
      const est = o.status === "destroyed" ? "destruido" : "perdido", since = epLabel(o.lastChangedIn);
      if (p.uses.some((u) => slug(u.object) === o.key)) { add("error", o.status === "destroyed" ? "objeto-destruido" : "objeto-perdido", `«${o.name}» está ${est} desde ${since} y aparece en uso en la escena ${sceneNo}. Si vuelve a estar disponible, declara cómo ([obtiene: …] o [repara: …]).`, i, o.name); continue; }
      const re = mentionRe(o.name); let worst: Severity | undefined;
      for (const l of lines) { const n = norm(l); if (!re.test(n) || CONTEXT.test(n)) continue; worst = USE_VERB.test(n) ? "error" : worst ?? "warning"; if (worst === "error") break; }
      if (worst) add(worst, o.status === "destroyed" ? "objeto-destruido" : "objeto-perdido", `«${o.name}» está ${est} desde ${since} y ${worst === "error" ? "aparece utilizándose" : "se menciona"} en la escena ${sceneNo}. Si vuelve a estar disponible, declara cómo ([obtiene: …] o [repara: …]).`, i, o.name);
    }
    for (const u of p.uses) {
      const o = sim.objects[slug(u.object)];
      if (!o && !declaredHere.some((d) => (d.kind === "object.introduce" || d.kind === "object.update") && slug(d.name) === slug(u.object))) add("warning", "objeto-sin-introducir", `«${u.object}» se usa en la escena ${sceneNo} sin haber sido introducido (declara [obtiene: …] o aparece antes).`, i, u.object);
      else if (o && u.who && o.owner && slug(o.owner) !== slug(u.who) && !declaredHere.some((d) => d.kind === "object.update" && slug(d.name) === o.key && d.owner)) add("warning", "objeto-ajeno", `${u.who} usa «${o.name}», que pertenece a ${o.owner}, sin que se haya declarado el cambio de dueño.`, i, o.name);
    }

    // R5 · dos lugares a la vez
    const loc = sc.location, mom = p.moment ? norm(p.moment) : "";
    if (mom && loc) { const l = moments.get(mom) ?? []; for (const prev of l) { const shared = names.filter((n) => prev.names.some((m) => slug(m) === slug(n))); if (shared.length && slug(prev.location) !== slug(loc)) add("error", "dos-lugares", `${shared.join(", ")} está en «${prev.location}» (escena ${prev.scene + 1}) y en «${loc}» (escena ${sceneNo}) en el mismo momento («${p.moment}»).`, i, shared[0]); } l.push({ scene: i, location: loc, names }); moments.set(mom, l); }
    for (const d of declaredHere) if (d.kind === "character.location" && loc && names.some((n) => slug(n) === slug(d.name)) && slug(d.location) !== slug(loc)) add("warning", "ubicacion-incoherente", `Se declara a ${d.name} en «${d.location}» pero la escena ${sceneNo} transcurre en «${loc}».`, i, d.name);

    // R7/R8/R9 · cambios declarados frente al canon vigente (y los de escenas anteriores del mismo episodio)
    for (const ch of declaredHere) { checkChange(ch, sim, sceneNo, i, add, fb); sim = applyChange(sim, ch, order); }
  });

  // R6 · arranque discontinuo respecto al episodio anterior
  if (ep.continuesFrom !== undefined && ep.scenes[0]) {
    const sc = ep.scenes[0], p0 = inp.perScene[0]?.parsed, names = [...new Set([...sc.characterNames, ...sc.lines.map((l) => l.speaker ?? "").filter(Boolean)])];
    const inLast = new Set((inp.previousLastShot?.characters ?? []).map(slug));
    for (const n of names) {
      const c = inp.canon.characters[slug(n)]; if (!c?.location || !sc.location || slug(c.location) === slug(sc.location) || p0?.moment || p0?.changes.some((d) => d.kind === "character.location" && slug(d.name) === slug(n))) continue;
      if (ep.continuesExact !== false && (!inp.previousLastShot || inLast.has(slug(n))))   // continuación EXACTA y salía en el último plano: debe arrancar en el mismo sitio
        add("warning", "arranque-discontinuo", `${c.name} terminó el ${epLabel(ep.continuesFrom)} en «${c.location}» y este episodio arranca en «${sc.location}» sin transición (si hay un salto de tiempo o de lugar, decláralo con [momento: …] o [ubicacion: …]).`, 0, c.name);
      else add("info", "arranque-discontinuo", `${c.name} estaba en «${c.location}» y aparece en «${sc.location}»: ${ep.continuesExact === false ? "el episodio no se pidió como continuación exacta" : "no salía en el último plano"}, se asume que se desplazó entre episodios.`, 0, c.name);
    }
  }

  // R11 · el episodio como parte de una SERIE: estructura, aportes, protagonista, duración (~5 min) y gancho previo
  const acts = inp.perScene.flatMap((p) => p.parsed.acts), have = new Set(acts.map((a) => a.kind)), missing = REQUIRED_ACTS.filter((k) => !have.has(k));
  if (missing.length && inp.canon.series) add("warning", "estructura", `Al episodio le falta${missing.length > 1 ? "n" : ""}: ${missing.map((k) => ACT_LABEL[k]).join(", ")}. Decláralo en el guion con [acto: tipo | texto] o [gancho: texto]; un episodio de la serie necesita inicio, conflicto, desarrollo, punto emocional, resolución parcial y gancho.`);
  const declaredAll = [...inp.perScene.flatMap((p) => p.parsed.changes), ...manualChanges];
  const NEW = new Set<Change["kind"]>(["event.add", "thread.open", "thread.close", "milestone.progress", "character.stage", "character.profile", "character.trait", "character.age", "relationship.set", "object.introduce", "object.update", "fact.add", "character.status"]);
  if (inp.canon.series && !declaredAll.some((c) => NEW.has(c.kind))) add("warning", "sin-aporte", "El episodio no declara nada nuevo para la historia (acontecimiento, hito, hilo, evolución, relación u objeto): cada episodio debe aportar algo nuevo.");
  const hero = inp.canon.series?.protagonist; if (hero && !ep.scenes.some((s) => [...s.characterNames, ...s.lines.map((l) => l.speaker ?? "")].some((n) => slug(n) === slug(hero)))) add("warning", "protagonista", `${hero} no aparece en el episodio: la serie trata sobre su vida.`);
  if (ep.durationSec !== undefined && inp.canon.series) { const lo = EPISODE_TARGET_SEC * (1 - EPISODE_TOLERANCE), hi = EPISODE_TARGET_SEC * (1 + EPISODE_TOLERANCE); if (ep.durationSec < lo || ep.durationSec > hi) add("warning", "duracion", `El episodio dura ≈ ${Math.round(ep.durationSec / 60 * 10) / 10} min y el formato es ≈ 5 min (${Math.round(lo / 60 * 10) / 10}–${Math.round(hi / 60 * 10) / 10} min).`); }
  if (inp.previousHook && ep.continuesFrom !== undefined) add("info", "gancho-previo", `El ${epLabel(ep.continuesFrom)} terminó con este gancho: «${inp.previousHook}». El episodio debería retomarlo.`);
  for (const ci of ep.characters) {   // evolución física normal por edad: si pasan años, el diseño visual debería evolucionar
    const c = sim.characters[slug(ci.name)], before = inp.canon.characters[slug(ci.name)];   // edad de hoy (con los cambios del episodio) frente a la que tenía cuando se registró el diseño (canon anterior)
    if (!before?.appearance?.designVersion || c?.age === undefined || ci.designVersion === undefined) continue;
    const ageThen = [...(before.ageHistory ?? [])].reverse().find((h) => h.ep <= before.appearance!.ep)?.value;
    if (ageThen !== undefined && c.age - ageThen >= PHYSICAL_EVOLUTION_YEARS && ci.designVersion === before.appearance.designVersion && !declaredAll.some((d) => d.kind === "character.appearance" && slug(d.name) === slug(ci.name)) && ep.scenes.some((s) => s.characterNames.some((n) => slug(n) === slug(ci.name))))
      add("warning", "evolucion-fisica", `${c.name} ha pasado de ${ageThen} a ${c.age} años pero sigue con el diseño v${ci.designVersion}: la evolución física normal por edad pide una nueva versión de su diseño (con justificación narrativa).`, undefined, c.name);
  }

  // R10 · información nueva pendiente de confirmar
  const pending = (inp.changes ?? []).filter((c) => c.decision !== "rejected");
  for (const c of pending) {
    const ch = c.change;
    const isNew = ch.kind === "character.add" || ch.kind === "object.introduce" || (ch.kind === "object.update" && !inp.canon.objects[slug(ch.name)]) || (ch.kind === "thread.open" && inp.canon.threads[slug(ch.title)]?.status !== "open")
      || (ch.kind === "place.update" && !inp.canon.places[slug(ch.name)]) || (ch.kind === "relationship.set" && !inp.canon.relationships[[slug(ch.a), slug(ch.b)].sort().join("~")]) || ch.kind === "fact.add" || ch.kind === "rule.add";
    if (isNew) add("info", "nuevo", `Nuevo, pendiente de confirmar: ${c.text}`, c.scene);
  }
  const sev = { error: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => sev[a.severity] - sev[b.severity] || (a.scene ?? 99) - (b.scene ?? 99));
}

type Add = (s: Severity, r: string, t: string, scene?: number, subject?: string) => void;
const pendingIn = (s: CanonState, stageKey: string) => milestonesInOrder(s).filter((m) => m.stage === stageKey && m.status !== "achieved").map((m) => m.title);
function checkChange(ch: Change, sim: CanonState, sceneNo: number, i: number, add: Add, fb = false) {
  switch (ch.kind) {
    case "character.stage": {   // la evolución de vida avanza UNA etapa cada vez y no deja atrás hitos sin contar
      const c = sim.characters[slug(ch.name)], to = findStage(sim, ch.stage), all = stagesInOrder(sim);
      if (all.length && !to) { add("warning", "etapa", `La etapa «${ch.stage}» no está definida en el arco de la serie.`, i, ch.name); break; }
      const from = c?.stage ? sim.stages?.[c.stage] : undefined; if (!to || !from || fb || to.key === from.key) break;
      if (to.order > from.order + 1) { const skipped = all.filter((s) => s.order > from.order && s.order < to.order).map((s) => s.title); add("error", "etapa-saltada", `${ch.name} pasa de «${from.title}» a «${to.title}» saltándose ${skipped.map((x) => `«${x}»`).join(", ")}: cada episodio debe vivir una etapa concreta, sin saltos.`, i, ch.name); }
      else if (to.order < from.order) add("warning", "etapa-retrocede", `${ch.name} vuelve de «${from.title}» a «${to.title}»: si es un recuerdo usa [flashback: sí].`, i, ch.name);
      else { const pend = pendingIn(sim, from.key); if (pend.length) add("warning", "etapa-hitos-pendientes", `${ch.name} deja la etapa «${from.title}» con hitos sin contar: ${pend.map((x) => `«${x}»`).join(", ")}.`, i, ch.name); }
      break; }
    case "milestone.progress": {
      const m = findMilestone(sim, ch.key); if (!m) { add("warning", "hito", `Hito desconocido «${ch.key}»: no está en el arco de la serie.`, i); break; }
      const earlier = milestonesInOrder(sim).filter((x) => x.order < m.order && x.status !== "achieved").map((x) => x.title), top = stagesInOrder(sim).at(-1)?.key === m.stage;
      if (ch.status === "achieved") {
        if (m.status === "achieved") add("warning", "hito", `El hito «${m.title}» ya estaba logrado en ${epLabel(m.achievedIn ?? 0)}.`, i);
        if (earlier.length) add(top ? "error" : "warning", top ? "cima-prematura" : "hito-saltado", top ? `Llegada a la cima prematura: «${m.title}» se da por logrado con hitos anteriores sin contar (${earlier.map((x) => `«${x}»`).join(", ")}). La historia debe desarrollar antes todo el recorrido.` : `Se da por logrado «${m.title}» con hitos anteriores sin contar: ${earlier.map((x) => `«${x}»`).join(", ")}.`, i);
      } else if (top && earlier.length) add("warning", "cima-prematura", `El episodio avanza hacia la cima («${m.title}») con hitos anteriores sin contar: ${earlier.slice(0, 4).map((x) => `«${x}»`).join(", ")}.`, i);
      break; }
    case "character.age": {
      const c = sim.characters[slug(ch.name)], prev = c?.age; if (prev === undefined || fb) break;
      if (ch.age < prev) add("error", "edad", `${ch.name} no puede tener menos edad (${ch.age}) que antes (${prev}) salvo en un flashback.`, i, ch.name);
      else if (ch.age - prev >= MAX_AGE_JUMP_ERROR) add("error", "salto-de-años", `Salto de años artificial: ${ch.name} pasa de ${prev} a ${ch.age} años de golpe${c?.stage && sim.stages?.[c.stage] ? `; en «${sim.stages[c.stage].title}» quedan hitos por contar: ${pendingIn(sim, c.stage).slice(0, 4).join(", ") || "ninguno"}` : ""}.`, i, ch.name);
      else if (ch.age - prev >= MAX_AGE_JUMP_WARN) add("warning", "salto-de-años", `${ch.name} pasa de ${prev} a ${ch.age} años: ¿se omite alguna parte importante de la historia?${c?.stage && sim.stages?.[c.stage] && pendingIn(sim, c.stage).length ? ` Quedan hitos de «${sim.stages[c.stage].title}»: ${pendingIn(sim, c.stage).slice(0, 4).join(", ")}.` : ""}`, i, ch.name);
      break; }
    case "relationship.set": {
      const prev = sim.relationships[[slug(ch.a), slug(ch.b)].sort().join("~")]; if (!prev) break;
      const rel = norm(ch.relation);
      if (rel === "conocidos") add("warning", "relacion-contradice", `${ch.a} y ${ch.b} ya se conocían (relación «${prev.relation}» desde ${epLabel(prev.since)}); la escena ${sceneNo} los presenta como si se conocieran ahora.`, i, ch.a);
      else if (/^(desconocidos|no se conocen|extranos)$/.test(rel)) add("error", "relacion-contradice", `${ch.a} y ${ch.b} no pueden ser «${ch.relation}»: el canon dice «${prev.relation}» desde ${epLabel(prev.since)}.`, i, ch.a);
      else if (ch.trust !== undefined && Math.abs(ch.trust - prev.trust) >= 3) add("warning", "relacion-contradice", `Cambio brusco de confianza entre ${ch.a} y ${ch.b}: de ${prev.trust} («${prev.relation}») a ${ch.trust} («${ch.relation}») sin acontecimiento que lo justifique.`, i, ch.a);
      break; }
    case "character.status": {
      const c = sim.characters[slug(ch.name)]; if (!c) break;
      if (ch.status === "dead" && c.status === "dead") add("error", "evento-contradice", `${c.name} ya había muerto en ${epLabel(c.statusSince ?? 0)}: no puede morir de nuevo.`, i, c.name);
      else if (ch.status === "active" && c.status === "dead") add("warning", "evento-contradice", `${c.name} murió en ${epLabel(c.statusSince ?? 0)} y ahora reaparece: confirma que es intencionado (resurrección, flashback…).`, i, c.name);
      break; }
    case "object.update": {
      const o = sim.objects[slug(ch.name)]; if (!o) break;
      if (ch.status === "destroyed" && o.status === "destroyed") add("error", "evento-contradice", `«${o.name}» ya estaba destruido desde ${epLabel(o.lastChangedIn)}: no puede destruirse otra vez.`, i, o.name);
      else if (ch.status === "lost" && o.status === "destroyed") add("error", "evento-contradice", `«${o.name}» está destruido desde ${epLabel(o.lastChangedIn)}: no se puede perder.`, i, o.name);
      else if (ch.status === "lost" && o.status === "lost") add("warning", "evento-contradice", `«${o.name}» ya estaba perdido desde ${epLabel(o.lastChangedIn)}.`, i, o.name);
      else if (ch.owner && o.status === "destroyed" && (ch.status === "intact" || ch.status === undefined)) add("warning", "objeto-destruido", `${ch.owner} obtiene «${o.name}», que estaba destruido desde ${epLabel(o.lastChangedIn)}: declara antes [repara: ${o.name}].`, i, o.name);
      else if (ch.owner && o.owner && slug(o.owner) !== slug(ch.owner)) add("warning", "objeto-ajeno", `${ch.owner} obtiene «${o.name}», que pertenece a ${o.owner}: declara antes cómo lo pierde ${o.owner}.`, i, o.name);
      break; }
    case "thread.close": { const t = sim.threads[slug(ch.title)]; if (!t) add("warning", "hilo", `Se cierra el hilo «${ch.title}» que no estaba abierto.`, i); else if (t.status === "closed") add("warning", "hilo", `El hilo «${ch.title}» ya estaba cerrado desde ${epLabel(t.closedIn ?? 0)}.`, i); break; }
    case "thread.open": { const t = sim.threads[slug(ch.title)]; if (t?.status === "open") add("info", "hilo", `El hilo «${ch.title}» ya estaba abierto desde ${epLabel(t.openedIn)}: se considera que sigue abierto.`, i); else if (t?.status === "closed") add("warning", "hilo", `Se reabre el hilo «${ch.title}», cerrado en ${epLabel(t.closedIn ?? 0)}.`, i); break; }
    case "fact.add": {
      if (!ch.key || ch.supersede) break; const f = sim.facts.find((x) => x.k && slug(x.k) === slug(ch.key!));
      if (f && norm(f.v ?? "") !== norm(ch.value ?? "")) add("error", "hecho-contradice", `Contradice el canon: «${f.k} = ${f.v}» (${epLabel(f.ep)}) y aquí «${ch.key} = ${ch.value}». Si es una corrección, usa [corrige-hecho: …].`, i);
      break; }
    default: break;
  }
}
