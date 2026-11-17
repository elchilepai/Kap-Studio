import Link from "next/link";
import { AlertTriangle, Brain, Check, CircleAlert, Info, RotateCcw, Undo2, X } from "lucide-react";
import type { Production } from "@/domain/types";
import { getProviders } from "@/server/providers";
import { contextForProduction, memoryStatus } from "@/server/memory/service";
import { memoryDecide, refreshMemory, retractMemoryAction } from "@/server/memory-actions";
import { ACT_LABEL, REQUIRED_ACTS, SEVERITY_LABEL, epLabel, type Finding, type Severity } from "@/memory";
import SubmitButton from "./SubmitButton";
import { Notice } from "./ui";

const SEV: Record<Severity, { cls: string; Icon: typeof Info }> = { error: { cls: "err", Icon: CircleAlert }, warning: { cls: "kap", Icon: AlertTriangle }, info: { cls: "info", Icon: Info } };
const KIND: Record<string, string> = { "character.add": "Personajes", "character.status": "Personajes", "character.location": "Personajes", "character.outfit": "Ropa", "character.knows": "Información conocida",
  "relationship.set": "Relaciones", "object.introduce": "Objetos", "object.update": "Objetos", "thread.open": "Hilos narrativos", "thread.close": "Hilos narrativos", "fact.add": "Hechos y reglas", "rule.add": "Hechos y reglas", "place.update": "Lugares", "event.add": "Acontecimientos" };
const ORIGIN: Record<string, string> = { rules: "deducido", declared: "del guion", manual: "manual", llm: "IA" };

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <p className="small muted">Sin hallazgos de continuidad.</p>;
  return (
    <ul className="list">{findings.map((f) => { const { cls, Icon } = SEV[f.severity]; return (
      <li key={f.id} className="item"><span className={`badge ${cls}`} title={SEVERITY_LABEL[f.severity]}><Icon className="i" />{f.severity === "error" ? "Crítico" : f.severity === "warning" ? "Aviso" : "Nuevo"}</span>
        <span className="t" style={{ whiteSpace: "normal" }}>{f.text}{f.sceneTitle ? <span className="muted"> · escena {(f.scene ?? 0) + 1} «{f.sceneTitle}»</span> : null}</span></li>); })}</ul>
  );
}

/** Memoria narrativa del episodio: continuidad (reglas, sin IA), cambios propuestos y confirmación en el canon. Nada entra en el canon sin tu confirmación. */
export default async function MemoryCard({ p }: { p: Production }) {
  const { storage } = getProviders(); const st = await memoryStatus(storage, p.id); if (!st) return null;
  const { proposal, committed, findings } = st, here = `/episodios/${p.id}`;
  const errs = findings.filter((f) => f.severity === "error").length, warns = findings.filter((f) => f.severity === "warning").length;
  const groups = new Map<string, NonNullable<typeof proposal>["changes"]>();
  for (const c of proposal?.changes ?? []) { const g = KIND[c.change.kind] ?? "Otros"; groups.set(g, [...(groups.get(g) ?? []), c]); }
  const pack = await contextForProduction(storage, p);
  const hidden = <><input type="hidden" name="id" value={p.id} /><input type="hidden" name="_redirect" value={`${here}#memoria`} /><input type="hidden" name="_errorTo" value={here} />   {/* sin «#»: el mensaje de error viaja en ?error= y debe ir antes del fragmento */}</>;

  return (
    <div className="card stack" id="memoria">
      <div className="row between"><h2><Brain className="i" />Memoria y continuidad</h2>
        {committed && !st.stale ? <span className="badge ok">En el canon · {epLabel(committed.order)}</span> : st.stale ? <span className="badge kap">Desfasada</span> : <span className="badge info">Borrador (no es canon)</span>}</div>
      <p className="small muted">Solo lo aprobado por ti se convierte en canon. Esta propuesta es un borrador: nada entra en la memoria hasta que confirmes.</p>

      {pack && (
        <details className="acc"><summary className="small">Contexto de continuidad para este episodio · {pack.usedTokens}/{pack.budgetTokens} tokens{pack.dropped.length ? ` · ${pack.dropped.length} sección(es) recortada(s)` : ""}</summary>
          <div className="body"><pre className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{pack.text}</pre></div></details>
      )}

      <div><h3 style={{ marginBottom: 6 }}>Continuidad {errs ? <span className="badge err">{errs} crítico(s)</span> : null} {warns ? <span className="badge kap">{warns} aviso(s)</span> : null}</h3>
        <FindingsList findings={findings} />
        {errs > 0 && <p className="small" style={{ color: "var(--err)" }}>Hay errores críticos. No bloquean la aprobación: decides tú, pero conviene corregirlos o declarar la razón en el guion.</p>}
        {st.parseErrors.length > 0 && <Notice kind="err"><span>Directivas de memoria no entendidas: {st.parseErrors.join(" · ")}</span></Notice>}</div>

      {proposal?.acts && <div className="small"><b>Estructura del episodio:</b> <span className="row" style={{ gap: 6, display: "inline-flex", flexWrap: "wrap" }}>{REQUIRED_ACTS.map((k) => { const has = proposal.acts!.some((a) => a.kind === k); return <span key={k} className={`badge ${has ? "ok" : "kap"}`}>{has ? "✓" : "falta"} {ACT_LABEL[k]}</span>; })}</span>{proposal.hook ? <div className="muted">Gancho: «{proposal.hook}»</div> : null}{proposal.durationSec ? <div className="muted">Duración ≈ {Math.round(proposal.durationSec / 6) / 10} min (formato ≈ 5 min)</div> : null}</div>}

      {!proposal ? (
        <form action={refreshMemory} className="row">{hidden}<SubmitButton className="btn primary"><RotateCcw className="i" />Calcular propuesta de memoria</SubmitButton></form>
      ) : proposal.status === "committed" && !st.stale ? (<>
        <div className="card sub small stack" style={{ gap: 6 }}>
          <div><b>Resumen:</b> {proposal.summary}</div><div><b>Estado final:</b> {committed?.endingSituation}</div>
          <div><b>Último plano:</b> «{proposal.lastShot.scene}» en {proposal.lastShot.location || "—"} — {proposal.lastShot.text.replaceAll("\n", " · ")}</div>
          {committed && <div className="muted">{committed.accepted.length} cambio(s) aceptado(s) · {committed.rejected.length} rechazado(s) · objetos nuevos: {committed.introducedObjects.join(", ") || "—"} · hilos abiertos: {committed.threadsOpened.join(", ") || "—"} · cerrados: {committed.threadsClosed.join(", ") || "—"}</div>}
        </div>
        <form action={retractMemoryAction} className="row">{hidden}<SubmitButton className="btn sm" confirm="¿Retirar este episodio del canon? Los episodios posteriores dejarán de apoyarse en él."><Undo2 className="i" />Retirar del canon</SubmitButton></form>
      </>) : (
        <form action={memoryDecide} className="stack">{hidden}
          {st.stale && <Notice kind="err"><span>El episodio cambió desde que se calculó/confirmó esta propuesta. Recalcúlala para ver los cambios actuales.</span></Notice>}
          <h3 style={{ marginBottom: 0 }}>Cambios propuestos <span className="muted small">({proposal.changes.length}: {st.accepted} aceptados · {st.rejected} rechazados · {st.pendingDecisions} sin decidir)</span></h3>
          {proposal.changes.length === 0 && <p className="small muted">Este episodio no propone cambios. Puedes añadir alguno a mano abajo.</p>}
          {[...groups.entries()].map(([g, items]) => (
            <div key={g}><div className="small" style={{ fontWeight: 600, margin: "6px 0" }}>{g}</div>
              <ul className="list">{items.map((c) => (
                <li key={c.id} className="item" style={{ alignItems: "flex-start", gap: 10 }}>
                  <span className="t" style={{ whiteSpace: "normal", flex: 1 }}>{c.text} <span className="badge info" style={{ marginLeft: 6 }}>{ORIGIN[c.origin]}</span>{c.scene !== undefined ? <span className="muted small"> · esc. {c.scene + 1}</span> : null}</span>
                  <span className="row" style={{ gap: 10, flex: "none" }}>
                    {(["accepted", "rejected", "pending"] as const).map((v) => (<label key={v} className="small" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" name={`d:${c.id}`} value={v} defaultChecked={c.decision === v} />{v === "accepted" ? "Aceptar" : v === "rejected" ? "Rechazar" : "—"}</label>))}
                  </span></li>))}</ul></div>))}
          <div className="field wide"><label htmlFor="addManual">Añadir un cambio a mano</label>
            <textarea id="addManual" name="addManual" style={{ minHeight: 56 }} placeholder={"[obtiene: Alex, coche]   [destruye: teléfono]   [abre-hilo: deuda con Marcos | Alex, Marcos]"} />
            <div className="small muted">Mismas directivas que en el guion. Lo que escribes aquí queda aceptado.</div></div>
          <div className="field wide"><label htmlFor="logline">Resumen corto</label><input id="logline" name="logline" defaultValue={proposal.logline} /></div>
          <div className="field wide"><label htmlFor="summary">Resumen del episodio</label><textarea id="summary" name="summary" defaultValue={proposal.summary} style={{ minHeight: 90 }} /></div>
          <div className="field wide"><label htmlFor="endingNote">Situación exacta donde termina (opcional; si lo dejas vacío se deduce)</label><textarea id="endingNote" name="endingNote" defaultValue={proposal.endingNote} style={{ minHeight: 56 }} placeholder="Se calcula a partir de los cambios aceptados" /></div>
          <div className="small muted">Último plano: «{proposal.lastShot.scene}» en {proposal.lastShot.location || "—"} — {proposal.lastShot.text.replaceAll("\n", " · ")}</div>
          <div className="row">
            <SubmitButton className="btn ok" name="op" value="accept-all"><Check className="i" />Aceptar todo</SubmitButton>
            <SubmitButton className="btn" name="op" value="reject-all"><X className="i" />Rechazar todo</SubmitButton>
            <SubmitButton className="btn" name="op" value="save">Guardar decisiones</SubmitButton>
            <SubmitButton className="btn primary" name="op" value="commit" confirm="¿Confirmar estos cambios en el canon? Solo se aplicarán los aceptados."><Brain className="i" />Confirmar en el canon</SubmitButton>
          </div>
          {!st.approved && <p className="small muted">«Confirmar» solo funciona con el episodio <b>aprobado</b> (<Link href="/aprobacion" className="kap">Aprobación</Link>). Puedes ir decidiendo los cambios mientras tanto.</p>}
        </form>
      )}
      {proposal && <form action={refreshMemory} className="row">{hidden}<SubmitButton className="btn sm"><RotateCcw className="i" />Recalcular propuesta</SubmitButton></form>}
    </div>
  );
}
