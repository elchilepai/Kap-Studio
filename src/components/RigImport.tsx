"use client";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, FileJson, XCircle } from "lucide-react";
import StagePlayer from "./StagePlayer";
import { saveRig, validateRig, type RigReport } from "@/server/animation-actions";
import type { Appearance, LayeredRig, StageSpec } from "@/animation/types";

const TEMPLATE = (ids: Record<string, string>) => JSON.stringify({
  kind: "layered", pxPerUnit: 300,
  parts: [
    { id: "torso", role: "torso", image: ids.torso ?? "ID_DEL_RECURSO", anchor: [120, 400], at: [0, -300], z: 1 },
    { id: "head", role: "head", image: ids.head ?? "ID_DEL_RECURSO", anchor: [100, 200], parent: "torso", at: [120, 0], z: 3 },
    { id: "armF", role: "armF", image: ids.armF ?? "ID_DEL_RECURSO", anchor: [30, 20], parent: "torso", at: [210, 40], z: 4 },
    { id: "armB", role: "armB", image: ids.armB ?? "ID_DEL_RECURSO", anchor: [30, 20], parent: "torso", at: [30, 40], z: 0 },
    { id: "legF", role: "legF", image: ids.legF ?? "ID_DEL_RECURSO", anchor: [30, 0], parent: "torso", at: [150, 400], z: 0 },
    { id: "legB", role: "legB", image: ids.legB ?? "ID_DEL_RECURSO", anchor: [30, 0], parent: "torso", at: [90, 400], z: 0 },
  ],
  animations: ["idle", "walk", "talk", "wave"],
}, null, 2);

/**
 * Asistente de importación: Personaje → capas PNG de la Biblioteca → rig (partes, puntos de giro, jerarquía) → animaciones.
 * Es la estructura preparada: valida el manifiesto, previsualiza con el MISMO motor y guarda el rig en el diseño versionado.
 */
export default function RigImport({ characterId, name, current, images }: { characterId: string; name: string; current?: LayeredRig; images: { id: string; name: string; w?: number; h?: number }[] }) {
  const [manifest, setManifest] = useState(current ? JSON.stringify(current, null, 2) : "");
  const [report, check, pending] = useActionState<RigReport, FormData>(validateRig, null);
  const [note, setNote] = useState("");
  const rig = useMemo<LayeredRig | null>(() => { try { const j = JSON.parse(manifest); return j?.kind === "layered" && Array.isArray(j.parts) ? (j as LayeredRig) : null; } catch { return null; } }, [manifest]);
  const urls = useMemo(() => Object.fromEntries(rig ? [...rig.parts.map((p) => p.image), ...Object.values(rig.face?.eyes ?? {}), ...Object.values(rig.face?.mouths ?? {})].map((id) => [id, `/api/media/${id}`]) : []), [rig]);
  const stage: StageSpec | null = useMemo(() => rig ? {
    v: 1, width: 640, height: 400, fps: 30, duration: 4, seed: 2, warnings: [], set: { preset: "abstract", timeOfDay: "dusk", seed: 5 }, style: { ink: "#0d0f14", line: 0.045, grade: "none", vignette: 0.2, shadow: true }, props: [],
    actors: [{ id: "a", name, appearance: { skin: "#f1c9a5", hairStyle: "short", hairColor: "#333333", eyeColor: "#336699", top: "#888888", bottom: "#444444", shoes: "#111111", accent: "#ffffff", accessory: "none", height: 1, build: 1, rig } as Appearance, slot: 5, facing: 1, presentAtStart: true }],
    cues: [{ t: 0, type: "move", actor: "a", x: 11, dur: 2 }, { t: 2, type: "move", actor: "a", x: 5, dur: 2 }, { t: 1, type: "gesture", actor: "a", value: "wave", dur: 1.5 }] } : null, [rig, name]);
  const guess = (role: string) => images.find((i) => i.name.toLowerCase().includes(role.toLowerCase()))?.id;
  return (
    <div className="stack">
      <p className="small muted">Para usar un personaje propio: sube sus capas PNG a la Biblioteca (torso, cabeza, brazos, piernas…), pega aquí el manifiesto con los puntos de giro y valídalo. El PNG ya está soportado; el SVG llegará cuando exista un saneado seguro (un SVG puede contener scripts).</p>
      <div className="row"><button type="button" className="btn sm" onClick={() => setManifest(TEMPLATE({ torso: guess("torso") ?? "", head: guess("head") ?? guess("cabeza") ?? "", armF: guess("armf") ?? guess("brazo") ?? "", armB: guess("armb") ?? "", legF: guess("legf") ?? guess("pierna") ?? "", legB: guess("legb") ?? "" } as never))}><FileJson className="i" />Insertar plantilla</button></div>
      <details className="acc"><summary className="small">Recursos de imagen disponibles ({images.length})</summary><div className="body"><ul className="list">{images.map((i) => <li key={i.id} className="item"><div style={{ minWidth: 0 }}><div className="t">{i.name}</div><div className="s" style={{ overflowWrap: "anywhere" }}>{i.id}{i.w ? ` · ${i.w}×${i.h}` : ""}</div></div></li>)}</ul></div></details>
      <form action={check} className="stack">
        <div className="field wide"><label htmlFor={`mf-${characterId}`}>Manifiesto del rig (JSON)</label><textarea id={`mf-${characterId}`} name="manifest" value={manifest} onChange={(e) => setManifest(e.target.value)} spellCheck={false} style={{ minHeight: 220, fontFamily: "ui-monospace, monospace", fontSize: 13 }} /></div>
        <div className="row"><button className="btn" disabled={pending || !manifest.trim()}>Validar rig</button></div>
      </form>
      {report && (report.ok ? <div className="notice ok"><CheckCircle2 className="i" /><span>Rig válido: {report.parts} partes.</span></div> : <div className="notice err" role="alert"><XCircle className="i" /><ul style={{ margin: 0, paddingLeft: 18 }}>{report.issues.map((m, k) => <li key={k}>{m}</li>)}</ul></div>)}
      {stage && report?.ok && <StagePlayer stage={stage} images={urls} autoPlay label={`Vista previa del rig de ${name}`} />}
      {report?.ok && (
        <form action={saveRig} className="stack"><input type="hidden" name="characterId" value={characterId} /><input type="hidden" name="manifest" value={manifest} />
          <div className="field wide"><label htmlFor={`rn-${characterId}`}>Justificación (obligatoria si el personaje ya tenía diseño: cambiar a rig propio cambia su aspecto)</label><textarea id={`rn-${characterId}`} name="note" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} /></div>
          <div className="row"><button className="btn primary" type="submit">Guardar rig por capas</button></div></form>)}
      {current && <p className="small" style={{ color: "var(--kap)" }}>Este personaje ya usa un rig por capas ({current.parts.length} partes).</p>}
    </div>
  );
}
