/**
 * KAP_REALISM_CHECK (módulo puro, revisión LIGERA tras generar el episodio). Responde a nueve preguntas sobre si el episodio se siente como
 * un capítulo real de KAP y no como texto generado que intenta ser una serie. No regenera nada: informa (y la reparación, si procede, ya
 * ocurrió línea a línea en la puerta de calidad). Son heurísticas léxicas y estructurales, no un juicio literario.
 */
import { norm } from "../memory/text.ts";
import { STOCK_CLOSE, closingProblem } from "./closing.ts";
import { checkRhyme, firstInterventionOf } from "./rhyme.ts";
import { ADULT_VOICE, MOTIVATIONAL, OPPOSITION, content, jac, reviewNarrative } from "./review.ts";
import { explainsTheme, isThoughtOnly, isValidation } from "./show.ts";

export type RealismScene = { location: string; title?: string; lines: { speaker?: string; text: string }[]; fn?: string; stage?: string; /** Lo que KAP hace en la escena y cómo queda (si el generador los declara; si no, esas tres comprobaciones no se hacen). */ kapDoes?: string; kapState?: string };
export type RealismInput = { scenes: RealismScene[]; protagonist?: string; /** Textos de la escena de apertura de los que debe nacer la rima (petición, lugar…). */ contextTerms?: string[] };
export type RealismId = "decision-real" | "decision-con-consecuencia" | "kap-no-explica-de-mas" | "sin-frases-de-adulto" | "interaccion-sin-validacion" | "conflicto-cambia-algo" | "final-nace-de-la-accion" | "primera-rima-espontanea" | "ninguna-escena-eliminable" | "kap-actua" | "estados-variados" | "no-demasiado-reflexivo";
export type RealismCheck = { id: RealismId; ok: boolean; note?: string };
export type RealismResult = { checks: RealismCheck[]; failed: RealismId[]; passed: number; total: number };

const DECIDE = /\b(?:voy a|decido|decid[ií]|me quedo|me voy|acepto|no acepto|rechazo|devuelvo|cojo|agarro|corro|salgo|abro|cierro|escondo|llamo|le digo|se lo digo|pago|vendo|entrego|tomo|me llevo|dejo|grabo|pido|rompo|tiro|guardo|decide|acepta|rechaza|devuelve|coge|agarra|corre|sale|abre|cierra|esconde|llama|paga|vende|entrega|toma|se lleva|deja|graba|pide|rompe|tira|guarda|se va|se lo dice)\b/i;
const text = (s: RealismScene) => s.lines.map((l) => l.text).join(" ");
const stems = (s: string) => new Set(content(s).map((x) => x.slice(0, 5)));

export function kapRealismCheck(inp: RealismInput): RealismResult {
  const S = inp.scenes, kap = norm(inp.protagonist ?? "KAP"), isKap = (l: { speaker?: string }) => norm(l.speaker ?? "") === kap, checks: RealismCheck[] = [], add = (id: RealismId, ok: boolean, note?: string) => checks.push({ id, ok, ...(note ? { note } : {}) });
  const kapLines = S.flatMap((s, i) => s.lines.filter(isKap).map((l) => ({ i, t: l.text })));
  // 1) ¿KAP hace al menos una decisión real? (la escena de decisión, o cualquiera si no hay etiquetas, tiene a KAP decidiendo o actuando)
  const tagged = S.some((s) => s.stage), cand = S.map((s, i) => ({ s, i })).filter((x) => (tagged ? x.s.stage === "decision" : true));
  const decided = cand.find(({ s }) => s.lines.some((l) => (isKap(l) && DECIDE.test(l.text)) || (!(l.speaker ?? "").trim() && /\bKAP\b/.test(l.text) && DECIDE.test(l.text))));
  add("decision-real", !!decided, decided ? undefined : "no se ve a KAP decidiendo ni actuando en la escena de decisión");
  // 2) ¿esa decisión produce una consecuencia? (después hay una escena con información nueva ligada a la decisión)
  let consequence = false; if (decided) { const before = new Set(S.slice(0, decided.i + 1).flatMap((s) => [...stems(text(s))])), dec = stems(text(decided.s));
    consequence = S.slice(decided.i + 1).some((s) => { const st = stems(text(s)); if (!st.size) return false; const fresh = [...st].filter((w) => !before.has(w)).length / st.size; return fresh >= 0.3 && [...st].some((w) => dec.has(w)); }); }
  add("decision-con-consecuencia", consequence, consequence ? undefined : "tras la decisión no hay una escena que muestre algo nuevo ligado a ella");
  // 3-4) ¿KAP explica demasiado lo que siente? ¿hay frases que podría decir igualmente un adulto?
  const explain = kapLines.filter((l) => explainsTheme(l.t)).length; add("kap-no-explica-de-mas", explain <= 1, explain > 1 ? `${explain} líneas de KAP explican el tema o sus emociones` : undefined);
  const adult = kapLines.filter((l) => ADULT_VOICE.test(l.t) || MOTIVATIONAL.test(l.t)).length; add("sin-frases-de-adulto", adult <= 1, adult > 1 ? `${adult} líneas de KAP suenan a eslogan o a adulto` : undefined);
  // 5) ¿hay al menos una interacción que no sea de validación o moraleja? (otro personaje pregunta, contradice o interrumpe, sin validar)
  const interaction = S.some((s) => new Set(s.lines.map((l) => norm(l.speaker ?? "")).filter(Boolean)).size >= 2 && s.lines.some((l) => (l.speaker ?? "").trim() && !isKap(l) && !isValidation(l.text) && (/\?/.test(l.text) || OPPOSITION.test(l.text) || /^\s*[—¡]/.test(l.text) || /…\s*$/.test(l.text))));
  add("interaccion-sin-validacion", interaction, interaction ? undefined : "ningún secundario pregunta, contradice ni interrumpe: solo validan o enseñan");
  // 6) ¿el conflicto cambia algo? y 9) ¿alguna escena podría eliminarse sin cambiar nada? (reutiliza la revisión narrativa)
  const rules = new Set(reviewNarrative({ scenes: S.map((s) => ({ location: s.location, title: s.title, lines: s.lines, fn: s.fn, stage: s.stage })) , protagonist: inp.protagonist }).map((f) => f.rule));
  add("conflicto-cambia-algo", !rules.has("narrativa-sin-conflicto") && !rules.has("narrativa-sin-consecuencia"), rules.has("narrativa-sin-conflicto") ? "no se aprecia un conflicto claro" : rules.has("narrativa-sin-consecuencia") ? "el final no muestra una consecuencia nueva" : undefined);
  // 7) ¿el final nace de la acción? (no es una frase de tráiler ni una reflexión y se apoya en lo que acaba de pasar)
  const last = S.at(-1), lastLines = last?.lines.filter((l) => l.text.trim()) ?? [], closing = last ? closingProblem(last.lines, inp.protagonist) : undefined, lastTxt = lastLines.at(-1)?.text ?? "";
  const around = new Set([...(last ? last.lines.slice(0, -1) : []).map((l) => l.text), ...S.slice(-3, -1).map(text)].flatMap((x) => [...stems(x)])), connected = stems(lastTxt).size < 3 || [...stems(lastTxt)].some((w) => around.has(w));
  add("final-nace-de-la-accion", !closing && !STOCK_CLOSE.test(lastTxt) && connected, closing?.reason ?? (!connected ? "el final no se apoya en lo ocurrido" : undefined));
  // 8) ¿la primera rima parece espontánea? (natural y de la escena; si el episodio no rima, no aplica)
  const iv = firstInterventionOf(S.flatMap((s) => s.lines)); let rhymeOk = true, rnote: string | undefined;
  if (iv.texts.length) { const c = checkRhyme({ lines: iv.texts, contextTerms: inp.contextTerms ?? [S[0] ? text(S[0]) : "", S[0]?.location ?? ""] }); if (c.exists) { rhymeOk = c.natural && c.contextual; if (!rhymeOk) rnote = c.reasons.slice(0, 2).join("; "); } else rnote = "el episodio no rima en la primera intervención de KAP"; }
  add("primera-rima-espontanea", rhymeOk, rnote);
  add("ninguna-escena-eliminable", !rules.has("narrativa-escena-sin-aporte") && !rules.has("narrativa-escena-repetida") && !rules.has("narrativa-bucle"), rules.has("narrativa-escena-sin-aporte") || rules.has("narrativa-escena-repetida") ? "hay escenas que no cambian nada o repiten otra" : undefined);
  // Conducta (solo si las escenas declaran lo que KAP hace y su estado): ¿KAP actúa?, ¿el estado emocional varía?, ¿el episodio no es demasiado reflexivo?
  if (S.some((x) => x.kapDoes !== undefined)) { const withKap = S.filter((x) => x.lines.some(isKap)), thought = withKap.filter((x) => isThoughtOnly(x.kapDoes ?? "")).length, share = withKap.length ? thought / withKap.length : 0;
    add("kap-actua", share < 0.4, share >= 0.4 ? `en ${thought} de ${withKap.length} escenas con KAP, lo que «hace» es solo pensar, recordar o dudar` : undefined);
    const st = S.map((x) => norm(x.kapState ?? "")); let run = 1, maxRun = 1; for (let i = 1; i < st.length; i++) { run = st[i] && st[i] === st[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
    add("estados-variados", maxRun < 3 && (S.length < 6 || new Set(st.filter(Boolean)).size >= 2), maxRun >= 3 ? `KAP está en el mismo estado durante ${maxRun} escenas seguidas` : S.length >= 6 && new Set(st.filter(Boolean)).size < 2 ? "KAP no cambia de estado en todo el episodio" : undefined);
    add("no-demasiado-reflexivo", share < 0.35, share >= 0.35 ? "el episodio es demasiado reflexivo: pocas escenas en las que KAP haga algo" : undefined); }
  const failed = checks.filter((c) => !c.ok).map((c) => c.id); void jac;
  return { checks, failed, passed: checks.length - failed.length, total: checks.length };
}
