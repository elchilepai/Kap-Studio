import type { Appearance, Cue, EffectKind, Expression, Gesture, PropKind, PropSpec, SetPreset, SetSpec, Side, StageSpec, StyleParams, TimeOfDay } from "./types.ts";
import { WORLD_W } from "./types.ts";
import { hash32 } from "./util.ts";

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
  characters: DirectorActor[]; lines: TimedLine[]; directions: string[];
  set?: { preset?: SetPreset; timeOfDay?: TimeOfDay; imageId?: string; accent?: string };
  envelopes?: (number[] | undefined)[];          // envolvente real del audio por línea (si existe)
  style: StyleParams;
};

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Envolvente de boca sintética a partir del ritmo del texto (sílabas y pausas). Solo se usa si NO hay audio real. */
export function syntheticEnvelope(text: string, dur: number, fps: number): number[] {
  const n = Math.max(1, Math.round(dur * fps)); const w: { len: number; open: number }[] = [];
  for (const m of text.matchAll(/[aeiouáéíóúü]+|[,.;:!?…]+/gi)) w.push(/[,.;:!?…]/.test(m[0]) ? { len: 1.1, open: 0 } : { len: 1, open: 0.35 + ((hash32(m[0] + w.length) % 100) / 100) * 0.65 });
  if (!w.length) return new Array(n).fill(0);
  const total = w.reduce((a, b) => a + b.len, 0), out: number[] = [];
  for (let i = 0; i < n; i++) { let u = ((i + 0.5) / n) * total, k = 0; while (k < w.length - 1 && u > w[k].len) { u -= w[k].len; k++; } const p = u / w[k].len; out.push(w[k].open ? +(w[k].open * Math.pow(Math.sin(Math.PI * Math.min(1, p)), 0.7)).toFixed(2) : 0); }
  return out;
}

const SET_RULES: [RegExp, SetPreset][] = [
  [/azotea|tejado|terraza/, "rooftop"], [/refugio|habitaci|cuarto|casa|interior|sala|cocina|taller|laboratorio|cabana|cueva|bunker/, "room"],
  [/bosque|selva|jardin|parque|campo|monte/, "forest"], [/calle|plaza|mercado|puente|callejon|carretera|puerto|costa|faro|playa/, "street"],
  [/ciudad|skyline|torre|rascacielos|metro|tunel|distrito/, "city"],
];
export function resolveSet(location: string, tags: string[], mood: string, given?: DirectorInput["set"]): SetSpec {
  const key = norm(`${location} ${tags.join(" ")}`); let preset: SetPreset = given?.preset ?? "abstract";
  if (!given?.preset) for (const [re, p] of SET_RULES) if (re.test(key)) { preset = p; break; }
  const m = norm(mood); const tod: TimeOfDay = given?.timeOfDay ?? (/noche|nocturn/.test(key) || /oscur|tens|misteri|miedo/.test(m) ? "night" : /amanec|atardec|ocaso/.test(key) || /trist/.test(m) ? "dusk" : /dia|sol|aleg|diverti/.test(key + m) ? "day" : "dusk");
  return { preset, timeOfDay: tod, seed: hash32(location || "kap") % 1000, imageId: given?.imageId, accent: given?.accent };
}

const MOOD_EXPR: [RegExp, Expression][] = [[/oscur|tens|miedo|preocup/, "worried"], [/trist|melanc/, "sad"], [/aleg|diverti|feliz/, "happy"], [/misteri|intrig/, "thinking"], [/enfad|furi|ira/, "angry"]];
const EXPR_WORDS: Record<string, Expression> = { triste: "sad", feliz: "happy", contento: "happy", alegre: "happy", enfadado: "angry", furioso: "angry", sorprendido: "surprised", asombrado: "surprised", preocupado: "worried", asustado: "worried", pensativo: "thinking", neutral: "neutral", serio: "neutral" };
const GESTURE_WORDS: Record<string, Gesture> = { saluda: "wave", saludar: "wave", senala: "point", señala: "point", encoge: "shrug", asiente: "nod", niega: "shake", piensa: "think", levanta: "raise", celebra: "raise" };
const PROPS: Record<string, PropKind> = { linterna: "lantern", caja: "box", puerta: "door", cartel: "sign", estrella: "star", luna: "moon", arbol: "tree", farola: "lamp" };
const VFX: Record<string, EffectKind> = { lluvia: "rain", nieve: "snow", niebla: "fog", flash: "flash", oscurecer: "darken", polvo: "dust" };

const slots = (n: number) => (n <= 1 ? [8] : n === 2 ? [5.8, 10.2] : n === 3 ? [4.4, 8, 11.6] : [3.4, 6, 10, 12.6]);

export function direct(inp: DirectorInput): StageSpec {
  const warnings: string[] = []; const cues: Cue[] = []; const D = inp.duration; const tail = inp.tail ?? 0;
  const chars = inp.characters.slice(0, 4); const sl = slots(chars.length);
  const byName = (nm: string) => { const k = norm(nm); return chars.find((c) => norm(c.name) === k) ?? chars.find((c) => norm(c.name).startsWith(k) || k.startsWith(norm(c.name))); };
  const actors = chars.map((c, i) => ({ id: c.id, name: c.name, appearance: c.appearance, slot: sl[i], facing: (chars.length === 1 || i < chars.length / 2 ? 1 : -1) as 1 | -1, presentAtStart: true }));
  const props: PropSpec[] = []; const touched = new Set<string>();   // actores con movimiento dirigido a mano

  // ---------- direcciones explícitas («clave: valor») ----------
  const num = (s: string, re: RegExp) => { const m = re.exec(s); return m ? parseFloat(m[1].replace(",", ".")) : undefined; };
  let explicitCamera = false;
  for (const raw of inp.directions) {
    const i = raw.indexOf(":"); if (i < 0) { warnings.push(`Dirección sin «clave: valor»: «${raw}»`); continue; }
    const key = norm(raw.slice(0, i)), val = raw.slice(i + 1).trim(), nv = norm(val);
    const at = num(nv, /\ben\s+(\d+(?:[.,]\d+)?)\s*s/) ?? 0.2, during = num(nv, /durante\s+(\d+(?:[.,]\d+)?)\s*s/);
    const clean = nv.replace(/\ben\s+\d+(?:[.,]\d+)?\s*s/, "").replace(/durante\s+\d+(?:[.,]\d+)?\s*s/, "").trim();
    const who = () => { const tok = val.split(/\s+/)[0]; return byName(tok); };
    const side = (s: string): Side | "fade" | undefined => /izquierd/.test(s) ? "left" : /derech/.test(s) ? "right" : /fundid|fade/.test(s) ? "fade" : undefined;
    if (key === "camara") {
      explicitCamera = true; const z = num(clean, /zoom\s+(\d+(?:[.,]\d+)?)/) ?? (/acercar|primer plano/.test(clean) ? 1.3 : /alejar|plano general/.test(clean) ? 0.9 : undefined);
      if (/temblor|tiembla/.test(clean)) cues.push({ t: at, type: "shake", amp: num(clean, /(\d+(?:[.,]\d+)?)/) ?? 0.25, dur: during ?? 1 });
      else if (/paneo|panoram/.test(clean)) { const dir = /izquierd/.test(clean) ? -1 : 1; cues.push({ t: at, type: "camera", x: WORLD_W / 2 + dir * 3, dur: during ?? Math.max(1, D - at), ease: "inOut" }); }
      else if (/segui|siguie/.test(clean)) { const a = byName(clean.replace(/segui\w*\s*/, "").split(" ")[0]); if (a) cues.push({ t: at, type: "camera", focus: a.id, zoom: z ?? 1.15, dur: during ?? 1, ease: "inOut" }); else warnings.push(`cámara: personaje no encontrado en «${raw}»`); }
      else if (/centro/.test(clean)) cues.push({ t: at, type: "camera", x: WORLD_W / 2, zoom: 1, dur: during ?? 1 });
      else if (z) cues.push({ t: at, type: "camera", zoom: z, dur: during ?? 1.5, ease: "inOut" });
      else warnings.push(`cámara: no entiendo «${raw}»`);
    } else if (key === "entra" || key === "sale") {
      const a = who(); const sd = side(clean); if (!a || !sd) { warnings.push(`${key}: necesito «NOMBRE izquierda|derecha|fundido» en «${raw}»`); continue; }
      touched.add(a.id); const act = actors.find((x) => x.id === a.id)!;
      if (key === "entra") { act.presentAtStart = false; cues.push({ t: at, type: "enter", actor: a.id, from: sd, x: act.slot, dur: during ?? 1.8 }); } else cues.push({ t: at, type: "exit", actor: a.id, to: sd, dur: during ?? 1.8 });
    } else if (key === "camina") {
      const a = who(); if (!a) { warnings.push(`camina: personaje no encontrado en «${raw}»`); continue; } touched.add(a.id);
      const dest = /izquierd/.test(clean) ? 3 : /derech/.test(clean) ? 13 : /centro/.test(clean) ? 8 : num(clean, /\ba\s+(\d+(?:[.,]\d+)?)/); if (dest === undefined) { warnings.push(`camina: destino no entendido en «${raw}»`); continue; }
      cues.push({ t: at, type: "move", actor: a.id, x: Math.max(0.5, Math.min(WORLD_W - 0.5, dest)), dur: during ?? 2.2, run: /corre/.test(clean) });
    } else if (key === "expresion") { const a = who(); const e = Object.entries(EXPR_WORDS).find(([w]) => clean.includes(w))?.[1]; if (a && e) cues.push({ t: at, type: "expression", actor: a.id, value: e }); else warnings.push(`expresión: no entiendo «${raw}»`); }
    else if (key === "gesto") { const a = who(); const g = Object.entries(GESTURE_WORDS).find(([w]) => clean.includes(norm(w)))?.[1]; if (a && g) cues.push({ t: at, type: "gesture", actor: a.id, value: g, dur: during ?? 1.4 }); else warnings.push(`gesto: no entiendo «${raw}»`); }
    else if (key === "mira") { const a = who(); const sd = side(clean); if (a && (sd === "left" || sd === "right")) cues.push({ t: at, type: "face", actor: a.id, dir: sd }); else warnings.push(`mira: necesito «NOMBRE izquierda|derecha» en «${raw}»`); }
    else if (key === "vfx") { const e = Object.entries(VFX).find(([w]) => clean.includes(w))?.[1]; if (e) cues.push({ t: at, type: "effect", effect: e, dur: during ?? Math.max(1, D - at), intensity: num(clean, /(\d+(?:[.,]\d+)?)/) }); else warnings.push(`vfx: no conozco «${raw}»`); }
    else if (key === "aparece" || key === "desaparece") {
      const kind = Object.entries(PROPS).find(([w]) => clean.includes(w))?.[1]; if (!kind) { warnings.push(`${key}: objeto desconocido en «${raw}»`); continue; }
      let pr = props.find((p) => p.kind === kind); if (!pr) { pr = { id: `p${props.length}`, kind, x: 2 + props.length * 4.5 + (hash32(kind) % 30) / 10, y: 7.55, scale: 1.3, visibleAtStart: key === "desaparece" }; props.push(pr); }
      cues.push({ t: at, type: "prop", id: pr.id, action: key === "aparece" ? "show" : "hide" });
    } else warnings.push(`Dirección desconocida: «${raw}»`);
  }

  // ---------- ánimo por defecto ----------
  const mood = norm(inp.mood); const base = MOOD_EXPR.find(([re]) => re.test(mood))?.[1];
  if (base) for (const a of actors) cues.push({ t: 0, type: "expression", actor: a.id, value: base });

  // ---------- diálogo: boca, mirada, gestos, cámara ----------
  let dialogueCam = false;
  inp.lines.forEach((l, li) => {
    const a = l.speaker ? byName(l.speaker) : undefined; const dur = Math.max(0.3, l.end - l.start); if (!a) return;
    const env = inp.envelopes?.[li] ?? syntheticEnvelope(l.text, dur, inp.fps);
    cues.push({ t: l.start, type: "speak", actor: a.id, dur, envelope: env });
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
      dialogueCam = true;
      if (inp.aspect < 1) cues.push({ t: Math.max(0, l.start - 0.1), type: "camera", focus: a.id, zoom: 1.12, dur: 0.6, ease: "inOut" });
      else if (actors.length > 1) cues.push({ t: Math.max(0, l.start - 0.1), type: "camera", x: WORLD_W / 2 + (me.slot - WORLD_W / 2) * 0.3, zoom: 1.1, dur: 0.8, ease: "inOut" });
    }
  });
  if (dialogueCam && inp.lines.length) cues.push({ t: Math.min(D, inp.lines[inp.lines.length - 1].end + 0.2), type: "camera", x: WORLD_W / 2, zoom: 1, dur: 1, ease: "inOut" });

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
