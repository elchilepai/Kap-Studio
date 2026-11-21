import { frameShot, layoutSlots, wideZoom, type SafeZone } from "./framing.ts";
import { evaluate } from "./timeline.ts";
import type { Appearance, Cue, EffectKind, Expression, Gesture, PropKind, PropSpec, SetPreset, SetSpec, Side, StageSpec, StyleParams, TimeOfDay } from "./types.ts";
import { WORLD_W } from "./types.ts";
import { hash32 } from "./util.ts";
import { amplitudeProvider, syntheticEnvelope, type LipSyncProvider, type LipSyncTrack } from "./lipsync.ts";
import { norm as bnorm, parseDirection, type Beat } from "./beats.ts";
export type { Beat };

/**
 * DIRECTOR 2D POR REGLAS (sin IA). Convierte una descripción estructurada de escena (líneas con su tiempo, personajes,
 * lugar, ánimo y direcciones «clave: valor») en un escenario animado: entradas/salidas, movimientos, miradas,
 * expresiones, gestos, boca, cámara, efectos y aparición de elementos. Es determinista: misma entrada ⇒ misma animación.
 */
export type TimedLine = { speaker?: string; text: string; start: number; end: number };
export type DirectorActor = { id: string; name: string; appearance: Appearance };
export type DirectorInput = {
  duration: number; tail?: number; aspect: number; index: number; fps: number; width: number; height: number;
  location: string; mood: string; tags: string[]; narration: string;
  characters: DirectorActor[]; lines: TimedLine[];
  /** Acciones estructuradas (de un intérprete: reglas o LLM) y/o texto «clave: valor» editable; se combinan. */
  beats?: Beat[]; directions: string[];
  set?: { preset?: SetPreset; timeOfDay?: TimeOfDay; imageId?: string; accent?: string; layers?: SetSpec["layers"]; elements?: SetSpec["elements"]; foreground?: SetSpec["foreground"] };
  envelopes?: (number[] | undefined)[];          // envolvente real del audio por línea (si existe)
  /** Proveedor de sincronización labial (por defecto: amplitud). Sustituible sin tocar nada más. */
  lipsync?: LipSyncProvider;
  style: StyleParams;
  /** Zona de subtítulos (fracción de la altura) para que la cámara deje los pies por encima. */
  safe?: SafeZone;
};

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export { syntheticEnvelope };

const SET_RULES: [RegExp, SetPreset][] = [
  [/azotea|tejado|terraza/, "rooftop"],
  [/^(?:(?!interior|habitaci|cuarto|sala|cocina|taller)[\s\S])*?(?:patio|fachada|portal|porche|puerta (?:de |principal)|entrada de|jardin de (?:la )?casa)/, "patio"],   // el patio doméstico no es una calle
  [/^(?:(?!interior|habitaci|cuarto|casa|sala|cocina|taller)[\s\S])*?(?:calle|acera|puerta|entrada|exterior|afuera|fuera)/, "street"],   // lo exterior que se nombra ANTES que lo interior («Puerta de casa», «Calle cerca de la casa») es exterior
  [/refugio|habitaci|cuarto|casa|interior|sala|cocina|taller|laboratorio|cabana|cueva|bunker/, "room"],
  [/bosque|selva|jardin|parque|campo|monte/, "forest"], [/calle|plaza|mercado|puente|callejon|carretera|puerto|costa|faro|playa/, "street"],
  [/ciudad|skyline|torre|rascacielos|metro|tunel|distrito/, "city"],
];
export function resolveSet(location: string, tags: string[], mood: string, given?: DirectorInput["set"]): SetSpec {
  const key = norm(`${location} ${tags.join(" ")}`); let preset: SetPreset = given?.preset ?? "abstract";
  if (!given?.preset) for (const [re, p] of SET_RULES) if (re.test(key)) { preset = p; break; }
  if (!given?.preset && preset === "room" && /\bexterior\b/.test(norm(mood))) preset = "street";   // el beat dice que la escena es exterior
  const m = norm(mood), said = `${key} ${m}`;
  // la hora que dice el guion MANDA (también sobre la del lugar guardado): mañana ≠ tarde ≠ atardecer ≠ noche; solo si no dice nada se recurre al ánimo
  const stated: TimeOfDay | undefined = /\b(?:noche|nocturn\w*|medianoche)\b/.test(said) ? "night" : /\b(?:atardecer|atardec\w*|ocaso|anochecer|crepusculo)\b/.test(said) ? "dusk" : /\btarde\b/.test(said) ? "afternoon" : /\b(?:manana|amanecer|amanec\w*|madrugada|mediodia|dia)\b/.test(said) ? "day" : undefined;
  const tod: TimeOfDay = stated ?? given?.timeOfDay ?? (/oscur|tens|misteri|miedo/.test(m) ? "night" : /trist/.test(m) ? "dusk" : /\bsol\b|aleg|diverti/.test(said) ? "day" : "dusk");
  return { preset, timeOfDay: tod, seed: hash32(location || "kap") % 1000, imageId: given?.imageId, accent: given?.accent, ...(given?.layers ? { layers: given.layers } : {}), ...(given?.elements ? { elements: given.elements } : {}), ...(given?.foreground ? { foreground: given.foreground } : {}) };
}

const MOOD_EXPR: [RegExp, Expression][] = [[/oscur|tens|miedo|preocup/, "worried"], [/trist|melanc/, "sad"], [/aleg|diverti|feliz/, "happy"], [/misteri|intrig/, "thinking"], [/enfad|furi|ira/, "angry"]];

export function direct(inp: DirectorInput): StageSpec {
  const warnings: string[] = []; const cues: Cue[] = []; const D = inp.duration; const tail = inp.tail ?? 0;
  const chars = inp.characters.slice(0, 4); const portraitShot = inp.aspect < 0.8;
  const sl = layoutSlots(chars.length, inp.aspect);                  // una fila en horizontal; en vertical con 3-4 personajes, dos filas sin solaparse
  const byName = (nm: string) => { const k = norm(nm); return chars.find((c) => norm(c.name) === k) ?? chars.find((c) => norm(c.name).startsWith(k) || k.startsWith(norm(c.name))); };
  const actors = chars.map((c, i) => ({ id: c.id, name: c.name, appearance: c.appearance, slot: sl[i].x, ...(sl[i].row ? { row: sl[i].row } : {}), facing: (chars.length === 1 || i < chars.length / 2 ? 1 : -1) as 1 | -1, presentAtStart: true }));
  const imageSet = inp.set?.preset === "image" || !!inp.set?.imageId;                 // con imagen de fondo no se abre por debajo de 1 (no hay imagen fuera)
  const actorX = actors.map((a) => a.slot), fitZoom = wideZoom(actorX, inp.aspect, 0.3, 3);      // zoom máximo con el que el reparto sigue entero
  const wideZ = portraitShot ? Math.min(1, imageSet ? Math.max(1, fitZoom) : Math.max(0.8, fitZoom)) : 1; // plano general: en vertical se abre si hace falta (solo ese plano)
  const centroid = actors.length ? actors.reduce((n, a) => n + a.slot, 0) / actors.length : WORLD_W / 2;
  const props: PropSpec[] = []; const touched = new Set<string>();   // actores con movimiento dirigido a mano

  // ---------- acciones: beats estructurados + texto editable (ambos se convierten al mismo vocabulario) ----------
  const beats: Beat[] = [...(inp.beats ?? [])];
  for (const raw of inp.directions) { const r = parseDirection(raw); if (r.beat) beats.push(r.beat); else warnings.push(r.warning ?? `No entiendo «${raw}»`); }
  let explicitCamera = false, shotOnly = false;
  const who = (name: string | undefined, ctx: string) => { const a = name ? byName(name) : undefined; if (!a) warnings.push(`${ctx}: personaje «${name ?? "?"}» no está en la escena`); return a; };
  for (const b of beats) {
    const at = b.at ?? 0.2;
    switch (b.type) {
      case "camera": {
        explicitCamera = true;
        if (b.mode === "shake") cues.push({ t: at, type: "shake", amp: b.amp ?? 0.25, dur: b.dur ?? 1 });
        else if (b.mode === "pan") cues.push({ t: at, type: "camera", x: WORLD_W / 2 + (b.dir === "left" ? -3 : 3), dur: b.dur ?? Math.max(1, D - at), ease: "inOut" });
        else if (b.mode === "follow") { const a = who(b.actor, "cámara"); if (a) cues.push({ t: at, type: "camera", focus: a.id, zoom: b.zoom ?? 1.15, dur: b.dur ?? 1, ease: "inOut" }); }
        else if (b.mode === "reset") cues.push({ t: at, type: "camera", x: WORLD_W / 2, zoom: 1, dur: b.dur ?? 1 });
        else cues.push({ t: at, type: "camera", zoom: b.zoom ?? 1.3, dur: b.dur ?? 1.5, ease: "inOut" });
        break; }
      case "shot": { shotOnly = true; const z = b.size === "wide" ? 1 : b.size === "medium" ? 1.22 : 1.55; const a = b.actor ? who(b.actor, "plano") : undefined;
        cues.push(a ? { t: at, type: "camera", focus: a.id, zoom: z, dur: b.cut ? 0.01 : 0.9, ease: "inOut" } : { t: at, type: "camera", x: WORLD_W / 2, zoom: z, dur: b.cut ? 0.01 : 0.9, ease: "inOut" }); break; }
      case "enter": case "exit": { const a = who(b.actor, b.type === "enter" ? "entra" : "sale"); if (!a) break; touched.add(a.id); const act = actors.find((x) => x.id === a.id)!;
        if (b.type === "enter") { act.presentAtStart = false; cues.push({ t: at, type: "enter", actor: a.id, from: b.from, x: act.slot, dur: b.dur ?? 1.8 }); } else cues.push({ t: at, type: "exit", actor: a.id, to: b.to, dur: b.dur ?? 1.8 });
        break; }
      case "walk": { const a = who(b.actor, "camina"); if (!a) break; touched.add(a.id);
        const dest = b.to === "left" ? 3 : b.to === "right" ? 13 : b.to === "center" ? 8 : b.to; cues.push({ t: at, type: "move", actor: a.id, x: Math.max(0.5, Math.min(WORLD_W - 0.5, dest)), dur: b.dur ?? 2.2, run: !!b.run }); break; }
      case "face": { const a = who(b.actor, "mira"); if (a) cues.push({ t: at, type: "face", actor: a.id, dir: b.dir }); break; }
      case "expression": { const a = who(b.actor, "expresión"); if (a) cues.push({ t: at, type: "expression", actor: a.id, value: b.value }); break; }
      case "gesture": { const a = who(b.actor, "gesto"); if (a) cues.push({ t: at, type: "gesture", actor: a.id, value: b.value, dur: b.dur ?? 1.4 }); break; }
      case "pose": { const a = who(b.actor, "pose"); if (a) cues.push({ t: at, type: "pose", actor: a.id, value: b.value, dur: b.dur }); break; }
      case "vfx": cues.push({ t: at, type: "effect", effect: b.effect, dur: b.dur ?? Math.max(1, D - at), intensity: b.intensity }); break;
      case "prop": { let pr = props.find((p) => p.kind === b.kind); if (!pr) { pr = { id: `p${props.length}`, kind: b.kind, x: 2 + props.length * 4.5 + (hash32(b.kind) % 30) / 10, y: 7.55, scale: 1.3, visibleAtStart: b.action === "hide" }; props.push(pr); }
        cues.push({ t: at, type: "prop", id: pr.id, action: b.action }); break; }
    }
  }

  // ---------- ánimo por defecto ----------
  const mood = norm(inp.mood); const base = MOOD_EXPR.find(([re]) => re.test(mood))?.[1];
  if (base) for (const a of actors) cues.push({ t: 0, type: "expression", actor: a.id, value: base });

  // ---------- diálogo: boca, mirada, gestos, cámara ----------
  let dialogueCam = false; let camSpeaker: string | undefined;
  const shotReqs: { t: number; until: number; id: string; name: string; ideal: number; look: -1 | 0 | 1; first: boolean }[] = [];
  inp.lines.forEach((l, li) => {
    const a = l.speaker ? byName(l.speaker) : undefined; const dur = Math.max(0.3, l.end - l.start); if (!a) return;
    const trk: LipSyncTrack = (inp.lipsync ?? amplitudeProvider).track({ text: l.text, durationSec: dur, fps: inp.fps, audioEnvelope: inp.envelopes?.[li] });
    cues.push({ t: l.start, type: "speak", actor: a.id, dur, envelope: trk.envelope, ...(trk.visemes ? { visemes: trk.visemes } : {}) });
    const others = actors.filter((x) => x.id !== a.id), me = actors.find((x) => x.id === a.id)!;
    const target = others.sort((p, q) => Math.abs(p.slot - me.slot) - Math.abs(q.slot - me.slot))[0];
    if (target && !touched.has(a.id)) cues.push({ t: l.start, type: "face", actor: a.id, dir: target.slot >= me.slot ? "right" : "left" });
    const q = /\?/.test(l.text) && !/!/.test(l.text), ex = /!/.test(l.text), h = hash32(l.text);
    if (ex) cues.push({ t: l.start, type: "expression", actor: a.id, value: /angry|oscur|tens/.test(mood) ? "angry" : "surprised" });
    else if (q) cues.push({ t: l.start, type: "expression", actor: a.id, value: "thinking" });
    else if (base) cues.push({ t: l.start, type: "expression", actor: a.id, value: base });
    if (dur > 1.2 && !touched.has(a.id)) cues.push({ t: l.start + dur * 0.25, type: "gesture", actor: a.id, value: q ? "shrug" : ex ? "point" : (["raise", "point", "nod"] as Gesture[])[h % 3], dur: Math.min(1.4, dur * 0.5) });
    if (target && dur > 1.5) cues.push({ t: l.start + dur * 0.45, type: "gesture", actor: target.id, value: "nod", dur: 0.9 });
    if (target && !touched.has(target.id)) cues.push({ t: l.start, type: "face", actor: target.id, dir: me.slot >= target.slot ? "right" : "left" });
    if (!explicitCamera && actors.length >= 1) {
      // Plano / contraplano: tras la primera intervención se CORTA entre quien habla (ritmo dinámico). El hablante se coloca en un
      // tercio de la imagen mirando hacia el espacio libre (regla de tercios). Las frases emotivas piden un plano más cerrado.
      dialogueCam = true; const portrait = inp.aspect < 1, emotional = q || ex, firstLine = camSpeaker === undefined;
      const ideal = portrait ? (emotional ? 1.45 : 1.3) : emotional ? 1.55 : actors.length > 1 ? 1.25 : 1.18; const dirTo = target ? (target.slot >= me.slot ? 1 : -1) : 0;
      // El plano se RESUELVE más abajo, cuando ya están todos los movimientos (dirigidos y sugeridos por la narración): así se encuadra
      // a los personajes donde están en cada momento, no donde empezaron.
      if (camSpeaker !== a.id) shotReqs.push({ t: Math.max(0, l.start - 0.05), until: l.end, id: a.id, name: a.name, ideal, look: dirTo as -1 | 0 | 1, first: firstLine });
      camSpeaker = a.id;
    }
  });

  // ---------- acciones sugeridas por la narración ----------
  const nar = norm(inp.narration); const lead = actors[0];
  if (lead && !touched.has(lead.id)) {
    if (/\b(corre|huye|escapa)\b/.test(nar)) cues.push({ t: 0.3, type: "move", actor: lead.id, x: lead.slot < 8 ? 14 : 2, dur: Math.max(1.4, D * 0.6), run: true });
    else if (/\b(camina|avanza|se acerca|se aleja|llega|recorre)\b/.test(nar)) cues.push({ t: 0.3, type: "move", actor: lead.id, x: Math.min(WORLD_W - 1, lead.slot + (actors.length > 1 ? 1.2 : 3.2)), dur: Math.max(1.6, D * 0.8) });
  }
  // Lo que la narración dice que un personaje HACE se ve en el cuerpo (no solo en el subtítulo): cada cláusula con un verbo de acción
  // y un personaje nombrado le da esa pose durante un momento. Solo reglas léxicas sobre las líneas narradas; no inventa nada que el texto no diga.
  const ACTIONS: [RegExp, "crouch" | "reach" | "throw" | "recoil", number][] = [
    [/\b(?:se agach\w*|se inclin\w*|se arrodill\w*|recoge|recoger|coge|mete (?:la|las) mano\w*|planta\w*|rebusca\w*|busca\w* (?:en|entre|bajo|debajo))\b/, "crouch", 1.5],
    [/\b(?:lanza\w*|arroja\w*|tira (?:la|el|una|un)|patea\w*)\b/, "throw", 1.0],
    [/\b(?:alcanza\w*|estira\w*|agarra\w*|empuja\w*|abre|abrir|cierra|cerrar|toca\w*|levanta\w*|mueve\w*|aparta\w*)\b/, "reach", 1.2],
    [/\b(?:retrocede\w*|da un paso atras|se echa atras|se aleja de golpe|se sobresalta|se asusta)\b/, "recoil", 1.0],
  ];
  const aliasesOf = (nm: string) => [norm(nm), ...norm(nm).split(/\s+/).filter((w) => w.length > 3 && w !== "kap")];
  for (const l of inp.lines) {
    if (l.speaker) continue;
    norm(l.text).split(/[.!?;]+|,|\bpero\b|\bmientras\b/).map((x) => x.trim()).filter(Boolean).forEach((clause, ci) => {
      const hit = actors.map((a) => ({ a, i: Math.min(...aliasesOf(a.name).map((al) => { const m = new RegExp(`\\b${al.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).exec(clause); return m ? m.index : 1e9; })) })).filter((x) => x.i < 1e9).sort((p, q) => p.i - q.i)[0];
      const act = hit && ACTIONS.find(([re]) => re.test(clause)); if (!hit || !act) return;
      cues.push({ t: Math.max(0.1, l.start + ci * 0.45), type: "pose", actor: hit.a.id, value: act[1], dur: act[2] });
    });
  }
  const weather: [RegExp, EffectKind][] = [[/lluvi|llueve|tormenta/, "rain"], [/nieve|nieva|nevada/, "snow"], [/niebla|bruma/, "fog"], [/polvo|ceniza|cenizas/, "dust"]];
  for (const [re, e] of weather) if (re.test(nar + " " + norm(inp.location)) && !cues.some((c) => c.type === "effect" && c.effect === e)) cues.push({ t: 0, type: "effect", effect: e, dur: D + tail });
  if (/rayo|relampago|trueno|explosi|estruendo/.test(nar) && !cues.some((c) => c.type === "shake")) { cues.push({ t: Math.min(D * 0.4, 1.5), type: "effect", effect: "flash", dur: 0.6 }); cues.push({ t: Math.min(D * 0.4, 1.5), type: "shake", amp: 0.3, dur: 0.8 }); }

  // ---------- encuadre de los planos de diálogo (con las posiciones reales de cada momento) ----------
  const nonCam = cues.filter((c) => c.type !== "camera");
  const live = (t: number): { id: string; x: number }[] => {
    const f = evaluate({ v: 1, width: inp.width, height: inp.height, fps: inp.fps, duration: D + tail, seed: 0, set: { preset: "abstract", timeOfDay: "day", seed: 0 }, actors, props, cues: nonCam, style: inp.style, warnings: [] } as StageSpec, Math.max(0, t));
    return actors.flatMap((a, i) => (f.actors[i].visible && f.actors[i].alpha > 0.3 ? [{ id: a.id, x: f.actors[i].x }] : []));
  };
  const minZ = portraitShot && !imageSet ? Math.min(0.8, wideZ) : 1;
  for (const r of shotReqs) {
    let prev: { zoom: number; cx: number } | undefined; const dur0 = r.first ? 0.7 : 0.01;
    for (let k = 0, tt = r.t; tt < Math.max(r.t + 0.01, r.until - 0.2); k++, tt = r.t + k * 0.7) {
      const dur = k === 0 ? dur0 : 0.6, pos = live(tt + dur); const focus = pos.find((p) => p.id === r.id); if (!focus) continue;
      const fr = frameShot({ actors: pos, focus: r.id, aspect: inp.aspect, zoom: r.ideal, minZoom: minZ, maxZoom: 1.9, look: r.look, leadFrac: portraitShot ? 0.1 : 0.17 });
      if (fr.cut.length && k === 0) warnings.push(`Plano de «${r.name}»: ${fr.cut.length} personaje(s) quedan cortados por el borde; cambia la posición o el plano`);
      if (prev && Math.abs(prev.cx - fr.cx) < 0.2 && Math.abs(prev.zoom - fr.zoom) < 0.03) continue;   // no se mueve la cámara si el plano sigue valiendo
      cues.push({ t: tt, type: "camera", focus: r.id, zoom: fr.zoom, lead: fr.lead, dur, ease: "inOut" }); prev = { zoom: fr.zoom, cx: fr.cx };
    }
  }

  if (dialogueCam && portraitShot) cues.push({ t: 0, type: "camera", x: centroid, zoom: wideZ, dur: 0.01 });   // antes de la 1.ª intervención: plano general que cabe entero (en vertical no es el de por defecto)
  if (dialogueCam && inp.lines.length) {   // vuelve al plano general; en vertical, el más abierto que deje a todos enteros (o al último que habló con quien quepa a su lado)
    const lastLine = inp.lines[inp.lines.length - 1], tEnd = Math.min(D, lastLine.end + 0.2), pos = live(tEnd + 0.8);
    if (portraitShot && pos.length) {
      const f = (lastLine.speaker ? byName(lastLine.speaker)?.id : undefined) ?? pos[0].id, focus = pos.some((p) => p.id === f) ? f : pos[0].id;
      const fr = frameShot({ actors: pos, focus, aspect: inp.aspect, zoom: wideZ, minZoom: minZ, maxZoom: 1.9, look: 0, leadFrac: 0 });
      cues.push({ t: tEnd, type: "camera", x: fr.cx, zoom: fr.zoom, dur: 0.8, ease: "inOut" });
    } else cues.push({ t: tEnd, type: "camera", x: WORLD_W / 2, zoom: wideZ, dur: 0.8, ease: "inOut" });
  }

  // ---------- cámara por defecto: nunca queda estática ----------
  if (!explicitCamera && !dialogueCam && !shotOnly && portraitShot) {
    // Vertical: la cámara acompaña a quien se mueve (re-enfocando cada 0,8 s) o se queda en el grupo con un empuje lento; nunca recorta a un personaje.
    const T = Math.max(1, D + tail), mv = cues.filter((c) => (c.type === "move" || c.type === "enter") && actors.some((a) => a.id === c.actor)).sort((a, b) => a.t - b.t)[0];
    if (mv && "actor" in mv) {
      const end = Math.min(T, mv.t + ("dur" in mv && typeof mv.dur === "number" ? mv.dur : 2) + 0.8);
      cues.push({ t: 0, type: "camera", focus: mv.actor, zoom: wideZ, dur: 0.01 });
      for (let t = Math.max(0.05, mv.t); t < end; t += 0.8) {
        const pos = live(t + 0.8); if (!pos.some((p) => p.id === mv.actor)) continue;
        const fr = frameShot({ actors: pos, focus: mv.actor, aspect: inp.aspect, zoom: wideZ, minZoom: minZ, maxZoom: Math.max(wideZ, 1), look: 0, leadFrac: 0 });   // acompaña al que camina sin dejar a nadie cortado
        cues.push({ t, type: "camera", focus: mv.actor, zoom: fr.zoom, lead: fr.lead, dur: 0.8, ease: "linear" });
      }
    } else {
      const k = inp.index % 2, z0 = wideZ, z1 = Math.min(wideZ * 1.1, fitZoom);      // el empuje lento nunca llega a cortar a nadie
      cues.push({ t: 0, type: "camera", x: centroid, zoom: k ? z1 : z0, dur: 0.01 }, { t: 0.01, type: "camera", x: centroid, zoom: k ? z0 : z1, dur: T, ease: "linear" });
    }
  } else if (!explicitCamera && !dialogueCam && !shotOnly) {
    const k = inp.index % 3, T = Math.max(1, D + tail);
    if (k === 0) cues.push({ t: 0, type: "camera", zoom: 1.0, dur: 0.01 }, { t: 0.01, type: "camera", zoom: 1.09, dur: T, ease: "linear" });
    else if (k === 1) cues.push({ t: 0, type: "camera", zoom: 1.1, dur: 0.01 }, { t: 0.01, type: "camera", zoom: 1.0, dur: T, ease: "linear" });
    else cues.push({ t: 0, type: "camera", x: WORLD_W / 2 - 0.8, dur: 0.01 }, { t: 0.01, type: "camera", x: WORLD_W / 2 + 0.8, dur: T, ease: "linear" });
  }

  return { v: 1, width: inp.width, height: inp.height, fps: inp.fps, duration: D + tail, seed: hash32(inp.location + inp.index) % 100000, set: resolveSet(inp.location, inp.tags, inp.mood, inp.set), actors, props, cues, style: inp.style, warnings, ...(inp.safe ? { safe: inp.safe } : {}) };
}
