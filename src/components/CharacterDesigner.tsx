"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import StagePlayer from "./StagePlayer";
import { syntheticEnvelope } from "@/animation/director";
import type { Appearance, Cue, Expression, StageSpec } from "@/animation/types";
import { saveCharacterDesign } from "@/server/animation-actions";

type Outfit = { id: string; name: string; top: string; bottom: string; shoes: string; accent: string; accessory: Appearance["accessory"] };
export type DesignDraft = { skin: string; hairStyle: Appearance["hairStyle"]; hairColor: string; eyeColor: string; height: number; build: number; body: NonNullable<Appearance["body"]>; eyeStyle: NonNullable<Appearance["eyeStyle"]>; outfits: Outfit[] };

const ACTIONS = [["idle", "Reposo"], ["walk", "Caminar"], ["run", "Correr"], ["talk", "Hablar"], ["wave", "Saludar"], ["think", "Pensar"], ["arms_crossed", "Brazos cruzados"], ["hands_hips", "Manos en la cintura"], ["pointing", "Señalar"], ["facepalm", "Mano en la cara"], ["cheer", "Celebrar"], ["shrug", "Encogerse de hombros"]] as const;
const EXPRS: [Expression, string][] = [["neutral", "Neutral"], ["happy", "Feliz"], ["sad", "Triste"], ["angry", "Enfadado"], ["surprised", "Sorprendido"], ["worried", "Preocupado"], ["thinking", "Pensativo"]];
const HAIR: [string, string][] = [["short", "Corto"], ["long", "Largo"], ["spiky", "De punta"], ["bun", "Moño"], ["ponytail", "Coleta"], ["curly", "Rizado"], ["cap", "Gorra"], ["bald", "Calvo"]];
const ACC: [string, string][] = [["none", "Ninguno"], ["glasses", "Gafas"], ["scarf", "Bufanda"], ["hat", "Sombrero"], ["backpack", "Mochila"], ["headphones", "Auriculares"], ["cape", "Capa"], ["tie", "Corbata"]];

/** Diseñador de personajes con vista previa EN VIVO (mismo motor 2D que la exportación). Guarda un diseño versionado. */
export default function CharacterDesigner({ characterId, name, initial, version, hasDesign, log }: { characterId: string; name: string; initial: DesignDraft; version: number; hasDesign: boolean; log: { version: number; note: string; at: string }[] }) {
  const [d, setD] = useState<DesignDraft>(initial); const [oid, setOid] = useState(initial.outfits[0].id);
  const [action, setAction] = useState<(typeof ACTIONS)[number][0]>("walk"); const [expr, setExpr] = useState<Expression>("neutral"); const [note, setNote] = useState("");
  const outfit = d.outfits.find((o) => o.id === oid) ?? d.outfits[0];
  const patch = (p: Partial<DesignDraft>) => setD((x) => ({ ...x, ...p }));
  const patchOutfit = (p: Partial<Outfit>) => setD((x) => ({ ...x, outfits: x.outfits.map((o) => (o.id === outfit.id ? { ...o, ...p } : o)) }));

  const stage: StageSpec = useMemo(() => {
    const dur = 4, app: Appearance = { skin: d.skin, hairStyle: d.hairStyle, hairColor: d.hairColor, eyeColor: d.eyeColor, top: outfit.top, bottom: outfit.bottom, shoes: outfit.shoes, accent: outfit.accent, accessory: outfit.accessory, height: d.height, build: d.build, body: d.body, eyeStyle: d.eyeStyle };
    const cues: Cue[] = [{ t: 0, type: "expression", actor: "a", value: expr }];
    if (action === "walk" || action === "run") cues.push({ t: 0, type: "move", actor: "a", x: 11, dur: 2, run: action === "run" }, { t: 2, type: "move", actor: "a", x: 5, dur: 2, run: action === "run" });
    if (action === "talk") cues.push({ t: 0.2, type: "speak", actor: "a", dur: 3.6, envelope: syntheticEnvelope("Hola, soy yo. Este es mi aspecto en todos los episodios.", 3.6, 30) });
    if (action === "wave") cues.push({ t: 0.3, type: "gesture", actor: "a", value: "wave", dur: 3 });
    if (action === "think") cues.push({ t: 0.3, type: "gesture", actor: "a", value: "think", dur: 3 });
    if (["arms_crossed", "hands_hips", "pointing", "facepalm", "cheer", "shrug"].includes(action)) cues.push({ t: 0.05, type: "pose", actor: "a", value: action as never });
    return { v: 1, width: 640, height: 400, fps: 30, duration: dur, seed: 1, warnings: [], set: { preset: "abstract", timeOfDay: "night", seed: 5 }, style: { ink: "#0d0f14", line: 0.045, grade: "none", vignette: 0.25, shadow: true },
      props: [], actors: [{ id: "a", name, appearance: app, slot: action === "walk" || action === "run" ? 5 : 8, facing: 1, presentAtStart: true }], cues };
  }, [d, outfit, action, expr, name]);

  const Color = ({ label, v, on }: { label: string; v: string; on: (c: string) => void }) => (
    <label className="field" style={{ minWidth: 0 }}><span style={{ fontSize: 13, color: "var(--muted)" }}>{label}</span><input type="color" value={v} onChange={(e) => on(e.target.value)} style={{ padding: 2, height: 44 }} /></label>);
  return (
    <form action={saveCharacterDesign} className="stack">
      <input type="hidden" name="characterId" value={characterId} /><input type="hidden" name="design" value={JSON.stringify(d)} />
      <StagePlayer stage={stage} autoPlay label={`Vista previa de ${name}`} />
      <div className="form">
        <div className="field"><label htmlFor={`act-${characterId}`}>Acción de la vista previa</label><select id={`act-${characterId}`} value={action} onChange={(e) => setAction(e.target.value as typeof action)}>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor={`ex-${characterId}`}>Expresión</label><select id={`ex-${characterId}`} value={expr} onChange={(e) => setExpr(e.target.value as Expression)}>{EXPRS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <h3>Rasgos base <span className="small muted">(no cambian entre episodios)</span></h3>
      <div className="form">
        <Color label="Piel" v={d.skin} on={(c) => patch({ skin: c })} /><Color label="Pelo" v={d.hairColor} on={(c) => patch({ hairColor: c })} /><Color label="Ojos" v={d.eyeColor} on={(c) => patch({ eyeColor: c })} />
        <div className="field"><label htmlFor={`hs-${characterId}`}>Peinado</label><select id={`hs-${characterId}`} value={d.hairStyle} onChange={(e) => patch({ hairStyle: e.target.value as DesignDraft["hairStyle"] })}>{HAIR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor={`bt-${characterId}`}>Cuerpo</label><select id={`bt-${characterId}`} value={d.body} onChange={(e) => patch({ body: e.target.value as DesignDraft["body"] })}><option value="slim">Delgado</option><option value="regular">Normal</option><option value="broad">Corpulento</option></select></div>
        <div className="field"><label htmlFor={`es-${characterId}`}>Ojos</label><select id={`es-${characterId}`} value={d.eyeStyle} onChange={(e) => patch({ eyeStyle: e.target.value as DesignDraft["eyeStyle"] })}><option value="round">Redondos</option><option value="narrow">Rasgados</option><option value="big">Grandes</option></select></div>
        <div className="field"><label htmlFor={`h-${characterId}`}>Altura ({d.height.toFixed(2)})</label><input id={`h-${characterId}`} type="range" min={0.8} max={1.2} step={0.01} value={d.height} onChange={(e) => patch({ height: Number(e.target.value) })} style={{ minHeight: 0, padding: 0 }} /></div>
        <div className="field"><label htmlFor={`b-${characterId}`}>Complexión ({d.build.toFixed(2)})</label><input id={`b-${characterId}`} type="range" min={0.85} max={1.2} step={0.01} value={d.build} onChange={(e) => patch({ build: Number(e.target.value) })} style={{ minHeight: 0, padding: 0 }} /></div>
      </div>
      <h3>Guardarropa</h3>
      <div className="row">{d.outfits.map((o) => <button type="button" key={o.id} className={`tab${o.id === outfit.id ? " active" : ""}`} onClick={() => setOid(o.id)}>{o.name}</button>)}
        <button type="button" className="btn sm" onClick={() => { const id = `p${Date.now().toString(36)}`; setD((x) => ({ ...x, outfits: [...x.outfits, { ...outfit, id, name: `Prenda ${x.outfits.length + 1}` }] })); setOid(id); }}><Plus className="i" />Nueva prenda</button></div>
      <div className="form">
        <div className="field"><label htmlFor={`on-${characterId}`}>Nombre de la prenda</label><input id={`on-${characterId}`} value={outfit.name} onChange={(e) => patchOutfit({ name: e.target.value })} maxLength={60} /></div>
        <Color label="Parte superior" v={outfit.top} on={(c) => patchOutfit({ top: c })} /><Color label="Parte inferior" v={outfit.bottom} on={(c) => patchOutfit({ bottom: c })} />
        <Color label="Calzado" v={outfit.shoes} on={(c) => patchOutfit({ shoes: c })} /><Color label="Detalle" v={outfit.accent} on={(c) => patchOutfit({ accent: c })} />
        <div className="field"><label htmlFor={`ac-${characterId}`}>Accesorio</label><select id={`ac-${characterId}`} value={outfit.accessory} onChange={(e) => patchOutfit({ accessory: e.target.value as Outfit["accessory"] })}>{ACC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      {d.outfits.length > 1 && <div className="row"><button type="button" className="btn sm danger" onClick={() => { if (!window.confirm("¿Quitar esta prenda? Exigirá justificación al guardar.")) return; const rest = d.outfits.filter((o) => o.id !== outfit.id); setD({ ...d, outfits: rest }); setOid(rest[0].id); }}><Trash2 className="i" />Quitar prenda</button></div>}
      {hasDesign && <div className="field wide"><label htmlFor={`n-${characterId}`}>Justificación narrativa (obligatoria si cambias el aspecto base o editas una prenda existente)</label><textarea id={`n-${characterId}`} name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: se tiñe el pelo tras el incendio del episodio 3" style={{ minHeight: 70 }} /></div>}
      {!hasDesign && <input type="hidden" name="note" value="Diseño inicial" />}
      <div className="row"><button className="btn primary" type="submit">{hasDesign ? `Guardar cambios (v${version} → se versiona si cambia el aspecto)` : "Guardar diseño"}</button></div>
      {log.length > 0 && <details className="acc"><summary className="small">Historial de cambios ({log.length})</summary><div className="body"><ul className="list">{log.map((l, i) => <li key={i} className="item"><div><div className="t">v{l.version}</div><div className="s">{l.note} · {new Date(l.at).toLocaleDateString("es-ES")}</div></div></li>)}</ul></div></details>}
    </form>
  );
}
