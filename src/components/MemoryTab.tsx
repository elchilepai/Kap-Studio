import Link from "next/link";
import { Brain, Plus, Trash2, Wand2 } from "lucide-react";
import { getProviders } from "@/server/providers";
import { canonUpTo, loadBase, staleEpisodes, validEpisodes } from "@/server/memory/service";
import { addBaseCanon, removeBaseCanon, requestEpisode } from "@/server/memory-actions";
import { getAi } from "@/server/ai/registry";
import { epLabel } from "@/memory";
import SubmitButton from "./SubmitButton";
import { Empty } from "./ui";

const STATUS: Record<string, string> = { active: "activo", absent: "ausente", dead: "muerto" };
const OBJ: Record<string, string> = { intact: "en buen estado", damaged: "dañado", destroyed: "destruido", lost: "perdido" };

/** Pestaña «Memoria» del Universo: el canon vigente (solo lo aprobado), el canon base que escribe el usuario y la petición de episodios. */
export default async function MemoryTab() {
  const { storage } = getProviders(); const [valid, stale, base, prods] = [await validEpisodes(storage), await staleEpisodes(storage), await loadBase(storage), await storage.productions.list()];
  const canon = await canonUpTo(storage, Infinity, valid), ai = getAi(), here = "/universo?tab=memoria";
  const chars = Object.values(canon.characters), rels = Object.values(canon.relationships), objs = Object.values(canon.objects), threads = Object.values(canon.threads), places = Object.values(canon.places);
  const prodOf = new Map(prods.map((p) => [p.id, p]));
  const hidden = <><input type="hidden" name="_redirect" value={here} /><input type="hidden" name="_errorTo" value={here} /></>;
  return (
    <div className="stack">
      <div className="card stack"><h2><Wand2 className="i" />Pedir un episodio</h2>
        <p className="small muted">Escribe la petición en lenguaje normal, p. ej. <i>«Crea el episodio 7 continuando exactamente donde terminó el episodio 6»</i>. KAP recupera lo que está en el canon, arma el contexto de continuidad y crea el borrador del episodio.
          {ai.author ? " El guion lo redacta la IA conectada (queda pendiente de tu revisión)." : " Todavía no hay IA conectada: tú escribes el guion y el contexto queda a la vista en la ficha del episodio."}</p>
        <form action={requestEpisode} className="stack">{hidden}<div className="field wide"><label htmlFor="req">Petición</label><textarea id="req" name="request" required style={{ minHeight: 72 }} placeholder="Crea el episodio 2 continuando exactamente donde terminó el episodio 1" /></div>
          <div className="row"><SubmitButton className="btn primary"><Plus className="i" />Crear episodio y ver el contexto</SubmitButton></div></form></div>

      <div className="card stack"><h2><Brain className="i" />Canon vigente</h2>
        <p className="small muted">Solo cuenta lo que has aprobado y confirmado. Incluye {valid.length} episodio(s){valid.length ? `: ${valid.map((e) => epLabel(e.order)).join(", ")}` : ""} y el canon base.</p>
        {stale.length > 0 && <p className="small" style={{ color: "var(--kap)" }}>Fuera del canon por haber cambiado o dejado de estar aprobados: {stale.map((e) => <Link key={e.id} href={`/episodios/${e.productionId}#memoria`} className="kap">{epLabel(e.order)} </Link>)}</p>}
        {!chars.length && !objs.length && !threads.length && !canon.rules.length ? <Empty text="El canon está vacío. Aprueba un episodio y confirma sus cambios, o escribe canon base abajo." /> : (<div className="stack">
          {chars.length > 0 && <div><h3>Personajes</h3><ul className="list">{chars.map((c) => <li key={c.key} className="item"><span className="t" style={{ whiteSpace: "normal" }}><b>{c.name}</b> — {STATUS[c.status]}{c.location ? `; en ${c.location}` : ""}{c.outfit ? `; lleva ${c.outfit}` : ""}{c.knows.length ? `; sabe: ${c.knows.join(" | ")}` : ""} <span className="muted">· visto {epLabel(c.firstSeen)}–{epLabel(c.lastSeen)}</span></span></li>)}</ul></div>}
          {rels.length > 0 && <div><h3>Relaciones</h3><ul className="list">{rels.map((r) => <li key={r.key} className="item"><span className="t" style={{ whiteSpace: "normal" }}>{r.a} ↔ {r.b}: {r.relation} (confianza {r.trust > 0 ? "+" : ""}{r.trust}) <span className="muted">· desde {epLabel(r.since)}</span></span></li>)}</ul></div>}
          {objs.length > 0 && <div><h3>Objetos importantes</h3><ul className="list">{objs.map((o) => <li key={o.key} className="item"><span className="t" style={{ whiteSpace: "normal" }}><b>{o.name}</b> — {OBJ[o.status]}{o.owner ? `; de ${o.owner}` : o.lastOwner ? `; era de ${o.lastOwner}` : ""}{o.location ? `; en ${o.location}` : ""} <span className="muted">· desde {epLabel(o.introducedIn)}</span></span></li>)}</ul></div>}
          {threads.length > 0 && <div><h3>Hilos narrativos</h3><ul className="list">{threads.map((t) => <li key={t.key} className="item"><span className="t" style={{ whiteSpace: "normal" }}><span className={`badge ${t.status === "open" ? "kap" : "ok"}`}>{t.status === "open" ? "abierto" : "cerrado"}</span> {t.title}{t.involves.length ? ` (${t.involves.join(", ")})` : ""} <span className="muted">· {epLabel(t.openedIn)}{t.closedIn ? ` → ${epLabel(t.closedIn)}` : ""}</span></span></li>)}</ul></div>}
          {places.length > 0 && <div><h3>Lugares</h3><ul className="list">{places.map((p) => <li key={p.key} className="item"><span className="t">{p.name}{p.notes.length ? ` — ${p.notes.join("; ")}` : ""}</span></li>)}</ul></div>}
          {(canon.rules.length > 0 || canon.facts.length > 0) && <div><h3>Reglas y hechos confirmados</h3><ul className="list">{canon.rules.map((r) => <li key={r.key} className="item"><span className="t" style={{ whiteSpace: "normal" }}><span className="badge info">regla</span> {r.text}</span></li>)}{canon.facts.map((f) => <li key={f.key} className="item"><span className="t" style={{ whiteSpace: "normal" }}>{f.text} <span className="muted">· {epLabel(f.ep)}</span></span></li>)}</ul></div>}
          {canon.events.length > 0 && <div><h3>Acontecimientos</h3><ul className="list">{[...canon.events].reverse().slice(0, 12).map((e) => <li key={e.id} className="item"><span className="t" style={{ whiteSpace: "normal" }}>{e.title} <span className="muted">· {epLabel(e.ep)}</span></span></li>)}</ul></div>}
        </div>)}
      </div>

      <div className="card stack"><h2>Canon base (escrito por ti)</h2>
        <p className="small muted">Reglas del universo, hechos y estados iniciales. Lo que escribes aquí es canon desde el primer momento (escribirlo es tu confirmación). Mismas directivas que en el guion.</p>
        {base.changes.length > 0 && <ul className="list">{base.changes.map((c) => (<li key={c.id} className="item"><span className="t" style={{ whiteSpace: "normal" }}>{c.text}</span>
          <form action={removeBaseCanon}>{hidden}<input type="hidden" name="changeId" value={c.id} /><SubmitButton className="btn sm" confirm="¿Quitar esto del canon base?"><Trash2 className="i" />Quitar</SubmitButton></form></li>))}</ul>}
        <form action={addBaseCanon} className="stack">{hidden}<div className="field wide"><label htmlFor="basetext">Añadir</label><textarea id="basetext" name="text" required style={{ minHeight: 72 }} placeholder={"[regla: nadie puede salir de la ciudad]\n[hecho: faro.estado = abandonado]\n[conoce: Alex, Laura]"} /></div>
          <div className="row"><SubmitButton className="btn"><Plus className="i" />Añadir al canon base</SubmitButton></div></form></div>

      <div className="card stack"><h2>Episodios en el canon</h2>
        {valid.length === 0 ? <p className="small muted">Ninguno todavía.</p> : <ul className="list">{valid.map((e) => <li key={e.id} className="item"><Link href={`/episodios/${e.productionId}#memoria`} className="t">{epLabel(e.order)} · {prodOf.get(e.productionId)?.title ?? e.title}</Link><span className="s small muted">{e.logline}</span></li>)}</ul>}</div>
    </div>
  );
}
