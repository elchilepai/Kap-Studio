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
};

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export { syntheticEnvelope };

const SET_RULES: [RegExp, SetPreset][] = [
  [/azotea|tejado|terraza/, "rooftop"], [/refugio|habitaci|cuarto|casa|interior|sala|cocina|taller|laboratorio|cabana|cueva|bunker/, "room"],
  [/bosque|selva|jardin|parque|campo|monte/, "forest"], [/calle|plaza|mercado|puente|callejon|carretera|puerto|costa|faro|playa/, "street"],
  [/ciudad|skyline|torre|rascacielos|metro|tunel|distrito/, "city"],
];
export function resolveSet(location: string, tags: string[], mood: string, given?: DirectorInput["set"]): SetSpec {
  const key = norm(`${location} ${tags.join(" ")}`); let preset: SetPreset = given?.preset ?? "abstract";
  if (!given?.preset) for (const [re, p] of SET_RULES) if (re.test(key)) { preset = p; break; }
  const m = norm(mood); const tod: TimeOfDay = given?.timeOfDay ?? (/noche|nocturn/.test(key) || /oscur|tens|misteri|miedo/.test(m) ? "night" : /amanec|atardec|ocaso/.test(key) || /trist/.test(m) ? "dusk" : /dia|sol|aleg|diverti/.test(key + m) ? "day" : "dusk");
  return { preset, timeOfDay: tod, seed: hash32(location || "kap") % 1000, imageId: given?.imageId, accent: given?.accent, ...(given?.layers ? { layers: given.layers } : {}), ...(given?.elements ? { elements: given.elements } : {}), ...(given?.foreground ? { foreground: given.foreground } : {}) };
}

const MOOD_EXPR: [RegExp, Expression][] = [[/oscur|tens|miedo|preocup/, "worried"], [/trist|melanc/, "sad"], [/aleg|diverti|feliz/, "happy"], [/misteri|intrig/, "thinking"], [/enfad|furi|ira/, "angry"]];

const slots = (n: number) => (n <= 1 ? [8] : n === 2 ? [5.8, 10.2] : n === 3 ? [4.4, 8, 11.6] : [3.4, 6, 10, 12.6]);

export function direct(inp: DirectorInput): StageSpec {
  const warnings: string[] = []; const cues: Cue[] = []; const D = inp.duration; const tail = inp.tail ?? 0;
  const chars = inp.characters.slice(0, 4); const sl = slots(chars.length);
  const byName = (nm: string) => { const k = norm(nm); return chars.find((c) => norm(c.name) === k) ?? chars.find((c) => norm(c.name).startsWith(k) || k.startsWith(norm(c.name))); };
  const actors = chars.map((c, i) => ({ id: c.id, name: c.name, appearance: c.appearance, slot: sl[i], facing: (chars.length === 1 || i < chars.length / 2 ? 1 : -1) as 1 | -1, presentAtStart: true }));
  const props: PropSpec[] = []; const touched = new Set<string>();   // actores con movimiento dirigido a mano

  // ---------- acciones: beats estructurados + texto editable (ambos se convierten al mismo vocabulario) ----------
  const beats: Beat[] = [...(inp.beats ?? [])];
  for (const raw of inp.directions) { const r = parseDirection(raw); if (r.beat) beats.push(r.beat); else warnings.push(r.warning ?? `No entiendo «${raw}»`); }
  let explicitCamera = false;
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
      case "shot": { explicitCamera = true; const z = b.size === "wide" ? 1 : b.size === "medium" ? 1.22 : 1.55; const a = b.actor ? who(b.actor, "plano") : undefined;
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
  let dialogueCam = false; let camSpeaker: string | undefined, camZoom = 0;
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
      const zoom = portrait ? 1.35 : emotional ? 1.55 : actors.length > 1 ? 1.25 : 1.18; const dirTo = target ? (target.slot >= me.slot ? 1 : -1) : 0;
      // lead: la cámara va hacia donde mira el hablante → él queda en el tercio opuesto, con espacio para mirar
      if (camSpeaker !== a.id || camZoom !== zoom) cues.push({ t: Math.max(0, l.start - 0.05), type: "camera", focus: a.id, zoom, lead: portrait ? 0 : dirTo * 0.17, dur: firstLine ? 0.7 : 0.01, ease: "inOut" });
      camSpeaker = a.id; camZoom = zoom;
    }
  });
  if (dialogueCam && inp.lines.length) cues.push({ t: Math.min(D, inp.lines[inp.lines.length - 1].end + 0.2), type: "camera", x: WORLD_W / 2, zoom: 1, dur: 0.8, ease: "inOut" });   // vuelve al plano general

  // ---------- acciones sugeridas por la narración ----------
  const nar = norm(inp.narration); const lead = actors[0];
  if (lead && !touched.has(lead.id)) {
    if (/\b(corre|huye|escapa)\b/.test(nar)) cues.push({ t: 0.3, type: "move", actor: lead.id, x: lead.slot < 8 ? 14 : 2, dur: Math.max(1.4, D * 0.6), run: true });
    else if (/\b(camina|avanza|se acerca|se aleja|llega|recorre)\b/.test(nar)) cues.push({ t: 0.3, type: "move", actor: lead.id, x: Math.min(WORLD_W - 1, lead.slot + (actors.length > 1 ? 1.2 : 3.2)), dur: Math.max(1.6, D * 0.8) });
  }
  const weather: [RegExp, EffectKind][] = [[/lluvi|llueve|tormenta/, "rain"], [/nieve|nieva|nevada/, "snow"], [/niebla|bruma/, "fog"], [/polvo|ceniza|cenizas/, "dust"]];
  for (const [re, e] of weather) if (re.test(nar + " " + norm(inp.location)) && !cues.some((c) => c.type === "effect" && c.effect === e)) cues.push({ t: 0, type: "effect", effect: e, dur: D + tail });
  if (/rayo|relampago|trueno|explosi|estruendo/.test(nar) && !cues.some((c) => c.type === "shake")) { cues.push({ t: Math.min(D * 0.4, 1.5), type: "effect", effect: "flash", dur: 0.6 }); cues.push({ t: Math.min(D * 0.4, 1.5), type: "shake", amp: 0.3, dur: 0.8 }); }

  // ---------- cámara por defecto: nunca queda estática ----------
  if (!explicitCamera && !dialogueCam) {
    const k = inp.index % 3, T = Math.max(1, D + tail);
    if (k === 0) cues.push({ t: 0, type: "camera", zoom: 1.0, dur: 0.01 }, { t: 0.01, type: "camera", zoom: 1.09, dur: T, ease: "linear" });
    else if (k === 1) cues.push({ t: 0, type: "camera", zoom: 1.1, dur: 0.01 }, { t: 0.01, type: "camera", zoom: 1.0, dur: T, ease: "linear" });
    else cues.push({ t: 0, type: "camera", x: WORLD_W / 2 - 0.8, dur: 0.01 }, { t: 0.01, type: "camera", x: WORLD_W / 2 + 0.8, dur: T, ease: "linear" });
  }

  return { v: 1, width: inp.width, height: inp.height, fps: inp.fps, duration: D + tail, seed: hash32(inp.location + inp.index) % 100000, set: resolveSet(inp.location, inp.tags, inp.mood, inp.set), actors, props, cues, style: inp.style, warnings };
}
