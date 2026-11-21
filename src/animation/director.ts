import { frameShot, layoutSlots, wideZoom, type SafeZone } from "./framing.ts";
import { evaluate } from "./timeline.ts";
import type { ActionExpression, Appearance, Cue, ObjectKind, EffectKind, Expression, Gesture, PropKind, PropSpec, SetPreset, SetSpec, Side, StageSpec, StyleParams, TimeOfDay } from "./types.ts";
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
  [/refugio|habitaci|cuarto|dormitorio|casa|interior|sala|salon|comedor|pasillo|recibidor|vestibulo|escritorio|bano|cocina|taller|laboratorio|cabana|cueva|bunker/, "room"],
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
  const variant = preset === "room" ? (/habitaci|cuarto|dormitorio/.test(key) ? "bedroom" : /salon|sala\b|comedor|living/.test(key) ? "living" : /cocina/.test(key) ? "kitchen" : /pasillo|recibidor|vestibulo/.test(key) ? "hallway" : undefined) : undefined;
  return { preset, timeOfDay: tod, seed: hash32(location || "kap") % 1000, ...(variant ? { variant } : {}), imageId: given?.imageId, accent: given?.accent, ...(given?.layers ? { layers: given.layers } : {}), ...(given?.elements ? { elements: given.elements } : {}), ...(given?.foreground ? { foreground: given.foreground } : {}) };
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

  // ---------- ACTING a partir de la narración ----------
  // La narración NO se lee: DIRIGE. Cada cláusula con un personaje nombrado y un verbo se convierte en pequeñas fases (anticipación → acción → llegada/reacción)
  // con cuerpo, mirada, expresión, cámara y, si hay, el objeto en la mano. Solo reglas léxicas: no se inventa movimiento que el texto no diga.
  const CLAUSE = 1.5;   // segundos que la línea de tiempo reserva a cada cláusula de acción (igual que el montaje)
  const LANDMARK: [RegExp, number][] = [[/\bventana\b/, 10.8], [/\b(?:puerta|salida|pasillo|salon|cocina|fuera|afuera|calle|entrada)\b/, 14.2]];
  const EXPRS: [RegExp, ActionExpression][] = [
    [/\b(?:asustad\w*|miedo|aterr\w*|pavor|ojos muy abiertos|se estremece)\b/, "scared"], [/\b(?:verguenza|avergonz\w*|sonroj\w*)\b/, "embarrassed"], [/\b(?:confus\w*|no entiende|desconcert\w*)\b/, "confused"],
    [/\b(?:curios\w*|intrigad\w*)\b/, "curious"], [/\b(?:alivi\w*)\b/, "relieved"], [/\b(?:incomod\w*|se remueve|nervios\w*)\b/, "uncomfortable"], [/\b(?:aburrid\w*|bosteza\w*)\b/, "bored"],
    [/\b(?:trist\w*|llora\w*|lagrim\w*)\b/, "sad"], [/\b(?:enfad\w*|furios\w*|rabia)\b/, "angry"], [/\b(?:sorprend\w*|sobresalt\w*)\b/, "surprised"], [/\b(?:preocupad\w*|inquiet\w*|tens[oa]\b|angusti\w*)\b/, "worried"], [/\b(?:sonr\w*|rie\b|rien\b|alegre)\b/, "happy"], [/\b(?:piensa\w*|duda\w*|pensativ\w*)\b/, "thinking"],
  ];
  const ACTIONS: [RegExp, "crouch" | "reach" | "throw" | "recoil", number][] = [
    [/\b(?:se agach\w*|se inclin\w*|se arrodill\w*|recoge|recoger|mete (?:la|las) mano\w*|planta\w*|rebusca\w*)\b/, "crouch", 1.5],
    [/\b(?:lanza\w*|arroja\w*|tira (?:la|el|una|un)|patea\w*)\b/, "throw", 1.0],
    [/\b(?:alcanza\w*|estira\w*|agarra\w*|coge\w*|toma\w*|saca\w*|empuja\w*|abre|abrir|cierra|cerrar|toca\w*|levanta\w*|mueve\w*|aparta\w*|esconde\w*|guarda\w*|se quita|se pone|deja (?:la|el|las|los|una|un))\b/, "reach", 1.2],
    [/\b(?:retrocede\w*|da un paso atras|se echa atras|se sobresalta|se asusta)\b/, "recoil", 1.0],
  ];
  const OBJECTS: [RegExp, ObjectKind][] = [[/\b(?:telefono|movil|celular)\b/, "phone"], [/\bmochila\b/, "backpack"], [/\b(?:cuaderno|libreta)\b/, "notebook"], [/\b(?:auriculares|cascos)\b/, "headphones"], [/\bmaleta\b/, "suitcase"], [/\b(?:pelota|balon)\b/, "ball"], [/\b(?:papel|hoja)\b/, "paper"], [/\bsilla\b/, "chair"]];
  const TAKE = /\b(?:coge\w*|agarra\w*|saca\w*|toma\w*|recoge\w*|sostiene|sujeta\w*|lleva|abraza\w*|se pone|se quita|mira (?:el|la|su) (?:telefono|movil|pantalla))\b/, PUT = /\b(?:deja\w*|apoya\w*|suelta\w*|tira\w*|lanza\w*|guarda\w*)\b/;
  const ALERT = /\b(?:se oye\w*|se escucha\w*|suena\w*|portazo|grito\w*|ruido|estruendo|golpe seco|se rompe\w*|truen\w*)\b/, STRONG = /grito|estruendo|golpe|rompe|portazo|truen/;
  const STOP = /\b(?:se detiene|se para|se queda (?:quiet\w*|inmovil\w*|paralizad\w*)|se congela\w*|deja de moverse)\b/, RUN = /\b(?:corre\w*|echa a correr|sale corriendo)\b/;
  const WALK = /\b(?:se acerca\w*|se aproxima\w*|camina\w*|va (?:hacia|a)|avanza\w*|entra|llega\w*|se dirige\w*)\b/, AWAY = /\b(?:se aleja\w*|se separa|se marcha|se va)\b/, LOOK = /\bmira\w*\s+(?:hacia|a|al|a la|por|fijamente)\b/;
  const aliasesOf = (nm: string) => [norm(nm), ...norm(nm).split(/\s+/).filter((w) => w.length > 3 && w !== "kap")];
  const mentions = (clause: string) => actors.map((a) => ({ a, i: Math.min(...aliasesOf(a.name).map((al) => { const m = new RegExp(`(?<!\\bde\\s)\\b${al.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).exec(clause); return m ? m.index : 1e9; })) })).filter((x) => x.i < 1e9).sort((p, q) => p.i - q.i).map((x) => x.a);
  const xNow = (id: string, t: number) => { const f = evaluate({ v: 1, width: inp.width, height: inp.height, fps: inp.fps, duration: D + tail, seed: 0, set: { preset: "abstract", timeOfDay: "day", seed: 0 }, actors, props: [], cues: cues.filter((c) => c.type !== "camera"), style: inp.style, warnings: [] } as StageSpec, Math.max(0, t)); const i = actors.findIndex((a) => a.id === id); return f.actors[i]?.x ?? actors[i]?.slot ?? WORLD_W / 2; };
  const clampX = (x: number) => Math.max(0.8, Math.min(WORLD_W - 0.8, x)), cam = { t: -9 };
  const camera = (t: number, id: string, kind: "push" | "cut" | "follow", dur = 1) => {   // la cámara sigue la historia: un empuje al llegar información, un corte a la reacción, seguimiento al caminar; no más de uno cada 2,5 s
    if (explicitCamera || t - cam.t < 2.5) return; cam.t = t;
    if (kind === "follow") cues.push({ t, type: "camera", focus: id, zoom: 1.12, dur, ease: "inOut" });
    else { cues.push(kind === "push" ? { t, type: "camera", focus: id, zoom: 1.32, dur: 0.9, ease: "inOut" } : { t, type: "camera", focus: id, zoom: 1.55, dur: 0.01 }, { t: t + (kind === "push" ? 2.4 : 1.5), type: "camera", x: WORLD_W / 2, zoom: 1, dur: 0.8, ease: "inOut" }); }
  };
  const walkTo = (a: (typeof actors)[number], x: number, t: number, run: boolean): number => {
    const x0 = xNow(a.id, t), d = Math.abs(x - x0); if (d < 0.3) return t;
    const dur = Math.max(run ? 0.9 : 1.1, Math.min(run ? 2.4 : 3.4, d / (run ? 5.2 : 2.4)));
    cues.push({ t, type: "face", actor: a.id, dir: x > x0 ? "right" : "left" });   // primero se gira hacia donde va
    let t1 = t + 0.12; if (run) { cues.push({ t, type: "pose", actor: a.id, value: "crouch", dur: 0.28 }); t1 = t + 0.28; }   // anticipación antes de arrancar
    cues.push({ t: t1, type: "move", actor: a.id, x: clampX(x), dur, run }); const tEnd = t1 + dur;
    cues.push({ t: tEnd, type: "pose", actor: a.id, value: "idle" });   // llega, frena y se asienta
    camera(t1, a.id, "follow", dur); return tEnd;
  };
  const objSpecs = () => props.filter((p) => ["phone", "backpack", "notebook", "headphones", "suitcase", "ball", "paper", "chair"].includes(p.kind));
  for (const l of inp.lines) {
    if (l.speaker) continue; let lastP: (typeof actors)[number] | undefined;   // una cláusula sin nombre («…, confusa, no entiende nada») sigue siendo del último personaje nombrado en la línea
    norm(l.text).split(/[.!?;]+|,|\bpero\b|\bmientras\b/).map((x) => x.trim()).filter((x) => x.length > 2).forEach((clause, ci) => {
      const t0 = Math.max(0.1, l.start + ci * CLAUSE), who = mentions(clause), P = who[0] ?? lastP, others = who.slice(who[0] ? 1 : 0), free = P && !touched.has(P.id); if (who[0]) lastP = who[0];
      const ex = EXPRS.find(([re]) => re.test(clause))?.[1];
      if (ALERT.test(clause)) {   // un sonido: todos reaccionan (escalonados), con un empuje de cámara a quien más cerca está de la acción
        const strong = STRONG.test(clause); actors.forEach((a, k) => { if (touched.has(a.id)) return; const t = t0 + 0.15 * k; cues.push({ t, type: "pose", actor: a.id, value: "recoil", dur: 0.7 }, { t: t + 0.1, type: "expression", actor: a.id, value: strong ? "scared" : "surprised" }); });
        if (actors[0]) camera(t0, actors[0].id, "push");
        const ringing = OBJECTS.find(([re]) => re.test(clause))?.[1]; if (ringing && actors[0] && objSpecs().length < 4 && !props.some((q) => q.kind === ringing)) { const sp: PropSpec = { id: `o${props.length}`, kind: ringing, x: clampX(actors[0].slot + (actors[0].slot < 8 ? 1.4 : -1.4)), y: 7.55, scale: 1, visibleAtStart: false }; props.push(sp); cues.push({ t: t0, type: "prop", id: sp.id, action: "show" }); }   // suena el teléfono: se ve
        return;
      }
      if (!P) return;
      let moved = false;
      const target = others[0], landmark = LANDMARK.find(([re]) => re.test(clause))?.[1], nearest = actors.filter((a) => a.id !== P.id).sort((p, q) => Math.abs(p.slot - P.slot) - Math.abs(q.slot - P.slot))[0];
      if (free && STOP.test(clause)) { cues.push({ t: t0, type: "move", actor: P.id, x: xNow(P.id, t0), dur: 0.25 }, { t: t0 + 0.25, type: "pose", actor: P.id, value: "idle" }); moved = true; }
      else if (free && (RUN.test(clause) || WALK.test(clause))) {
        const run = RUN.test(clause), x0 = xNow(P.id, t0), other = target ?? (/\bse acerca|se aproxima/.test(clause) ? nearest : undefined);
        const dest = other ? (() => { const ox = xNow(other.id, t0 + 1); return ox - (Math.sign(ox - x0) || 1) * 1.4; })() : landmark;
        if (dest !== undefined) { const te = walkTo(P, dest, t0, run); moved = true; if (other) cues.push({ t: te + 0.05, type: "face", actor: P.id, dir: xNow(other.id, te) >= xNow(P.id, te) ? "right" : "left" }); else if (landmark !== undefined) cues.push({ t: te + 0.05, type: "face", actor: P.id, dir: landmark >= xNow(P.id, te) ? "right" : "left" }); }
      } else if (free && AWAY.test(clause)) { const other = target ?? nearest; if (other) { const x0 = xNow(P.id, t0), dir = Math.sign(xNow(other.id, t0) - x0) || 1; walkTo(P, x0 - dir * 1.8, t0, false); cues.push({ t: t0 + 1.9, type: "face", actor: P.id, dir: dir > 0 ? "right" : "left" }); moved = true; } }
      else if (free && LOOK.test(clause)) { const other = target ?? (landmark === undefined ? undefined : undefined), x0 = xNow(P.id, t0), toX = other ? xNow(other.id, t0) : landmark; if (toX !== undefined) cues.push({ t: t0, type: "face", actor: P.id, dir: toX >= x0 ? "right" : "left" }); }
      if (!moved) { const act = ACTIONS.find(([re]) => re.test(clause)); if (act) cues.push({ t: t0, type: "pose", actor: P.id, value: act[1], dur: act[2] }); }
      if (ex) { cues.push({ t: t0 + 0.1, type: "expression", actor: P.id, value: ex }); if (ex === "scared" || ex === "surprised") camera(t0 + 0.1, P.id, "cut"); }
      // objetos: lo que se coge va en la mano, lo que se deja queda en el suelo, lo que aparece en la escena se ve (solo los que la narración nombra; máx. 4)
      const obj = OBJECTS.find(([re]) => re.test(clause))?.[1];
      if (obj && objSpecs().length < 4) {
        const spec = (holder?: string, x = 0): PropSpec => { const sp: PropSpec = { id: `o${props.length}`, kind: obj, x, y: 7.55, scale: 1, visibleAtStart: false, ...(holder ? { holder } : {}) }; props.push(sp); return sp; };
        const held = props.find((q) => q.kind === obj && q.holder === P.id), floorAt = () => clampX(xNow(P.id, t0) + (P.slot < 8 ? 1 : -1) * 1.1);
        if (TAKE.test(clause) && !PUT.test(clause)) { const floor = props.find((q) => q.kind === obj && !q.holder); if (floor) cues.push({ t: t0 + 0.3, type: "prop", id: floor.id, action: "hide" }); cues.push({ t: t0 + 0.35, type: "prop", id: (held ?? spec(P.id)).id, action: "show" }); }
        else if (PUT.test(clause)) { if (held) cues.push({ t: t0 + 0.1, type: "prop", id: held.id, action: "hide" }); if (!/guarda/.test(clause)) cues.push({ t: t0 + 0.25, type: "prop", id: spec(undefined, floorAt()).id, action: "show" }); }
        else if (!props.some((q) => q.kind === obj)) cues.push({ t: t0, type: "prop", id: spec(undefined, floorAt()).id, action: "show" });
      }
    });
  }

  // ---------- acciones sugeridas por la narración ----------
  const nar = norm(inp.narration); const lead = actors[0];
  if (lead && !touched.has(lead.id) && !cues.some((c) => c.type === "move" && c.actor === lead.id)) {
    if (/\b(corre|huye|escapa)\b/.test(nar)) cues.push({ t: 0.3, type: "move", actor: lead.id, x: lead.slot < 8 ? 14 : 2, dur: Math.max(1.4, D * 0.6), run: true });
    else if (/\b(camina|avanza|se acerca|se aleja|llega|recorre)\b/.test(nar)) cues.push({ t: 0.3, type: "move", actor: lead.id, x: Math.min(WORLD_W - 1, lead.slot + (actors.length > 1 ? 1.2 : 3.2)), dur: Math.max(1.6, D * 0.8) });
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
