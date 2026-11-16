import Link from "next/link";
import { BookMarked, Clock, Dna, Map as MapIcon, Network, Sparkles, Users, Zap } from "lucide-react";
import { getProviders } from "@/server/providers";
import { allProductions, prodOptions } from "@/server/queries";
import EntityPanel from "@/components/EntityPanel";
import { Empty, PageHeader } from "@/components/ui";
import { saveStory } from "@/server/actions";
import SubmitButton from "@/components/SubmitButton";
import type { Character } from "@/domain/types";

const TABS = [
  ["estado", "Estado actual", Sparkles], ["biblia", "Biblia narrativa", BookMarked], ["personajes", "Personajes", Users],
  ["relaciones", "Relaciones", Network], ["cronologia", "Cronología", Clock], ["acontecimientos", "Acontecimientos", Zap],
  ["lugares", "Lugares", MapIcon], ["evolucion", "Evolución de KAP", Dna],
] as const;

function Graph({ chars, rels }: { chars: Character[]; rels: { fromId: string; toId: string; kind: string }[] }) {
  const W = 640, H = 420, cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 60;
  const pos = new Map(chars.map((c, i) => {
    const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
    return [c.id, { x: chars.length === 1 ? cx : cx + r * Math.cos(a), y: chars.length === 1 ? cy : cy + r * Math.sin(a) }];
  }));
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa de relaciones">
      {rels.map((e, i) => { const a = pos.get(e.fromId), b = pos.get(e.toId); if (!a || !b) return null;
        return <g key={i}><line className="edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><text className="lbl" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} textAnchor="middle">{e.kind}</text></g>; })}
      {chars.map((c) => { const p = pos.get(c.id)!; return (
        <g key={c.id}><circle cx={p.x} cy={p.y} r={24} fill="#242A34" stroke="#E9B949" strokeWidth={2} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" style={{ fontWeight: 700 }}>{c.name.slice(0, 2).toUpperCase()}</text>
          <text x={p.x} y={p.y + 42} textAnchor="middle">{c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name}</text></g>); })}
    </svg>
  );
}

export default async function Universo({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab ?? "estado";
  const { storage } = getProviders();
  const [chars, rels, events, places, evo, bible, story, prods] = await Promise.all([
    storage.characters.list(), storage.relationships.list(), storage.events.list(), storage.places.list(),
    storage.evolution.list(), storage.bible.list(), storage.story.get("story"), allProductions(),
  ]);
  const name = (id: string) => chars.find((c) => c.id === id)?.name ?? "?";
  const prodName = new Map(prodOptions(prods).map((o) => [o.value, o.label]));
  const here = `/universo?tab=${tab}`;
  const prodOpts = { productionId: prodOptions(prods) };
  const byOrder = <T extends { order: number }>(l: T[]) => [...l].sort((a, b) => a.order - b.order);
  const charOpts = chars.map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <PageHeader title="Universo KAP" sub="Biblia, personajes, cronología y estado de la historia" />
      <div className="tabs">{TABS.map(([k, l, Icon]) => <Link key={k} href={`/universo?tab=${k}`} className={`tab${tab === k ? " active" : ""}`}><Icon className="i" />{l}</Link>)}</div>

      {tab === "estado" && (
        <div className="cols">
          <div className="card stack">
            <h2>Dónde está ahora la historia</h2>
            <form action={saveStory} className="stack">
              <div className="field"><label htmlFor="summary">Resumen del estado actual</label>
                <textarea id="summary" name="summary" defaultValue={story?.summary ?? ""} placeholder="Qué ha pasado hasta ahora y en qué punto está KAP…" style={{ minHeight: 180 }} /></div>
              <div className="row"><SubmitButton className="btn primary">Guardar estado</SubmitButton></div>
            </form>
          </div>
          <div className="stack">
            <div className="card"><h2>Resumen del universo</h2>
              <ul className="list">{[["Personajes", chars.length, "personajes"], ["Relaciones", rels.length, "relaciones"], ["Lugares", places.length, "lugares"],
                ["Hitos de cronología", events.filter((e) => e.kind === "cronologia").length, "cronologia"], ["Entradas de biblia", bible.length, "biblia"]].map(([l, n, t]) =>
                <li key={String(l)}><Link href={`/universo?tab=${t}`} className="item"><span>{l}</span><b className="kap">{n}</b></Link></li>)}</ul></div>
            {evo.length > 0 && <div className="card"><h2>Etapa actual de KAP</h2><p className="t"><b>{byOrder(evo).at(-1)!.title}</b></p><p className="muted small">{byOrder(evo).at(-1)!.description}</p></div>}
          </div>
        </div>
      )}

      {tab === "biblia" && <EntityPanel entity="bible" items={bible} redirectTo={here} emptyText="La biblia narrativa está vacía. Añade las reglas, el tono y el mundo de KAP."
        render={(d) => <><div className="t">{String(d.title)}</div><div className="s">{String(d.category)}</div></>} />}

      {tab === "personajes" && <EntityPanel entity="character" items={chars} redirectTo={here}
        render={(d) => <><div className="t">{String(d.name)}</div><div className="s">{(d.traits as string[]).join(" · ") || String(d.description).slice(0, 80)}</div></>} />}

      {tab === "relaciones" && (
        <div className="stack">
          {chars.length < 2 ? <Empty text="Necesitas al menos dos personajes para crear relaciones."><Link className="btn primary sm" href="/universo?tab=personajes">Crear personajes</Link></Empty> : (
            <>
              {rels.length > 0 && <Graph chars={chars} rels={rels} />}
              <EntityPanel entity="relationship" items={rels} redirectTo={here} opts={{ fromId: charOpts, toId: charOpts }}
                render={(d) => <><div className="t">{name(String(d.fromId))} → {name(String(d.toId))}</div><div className="s">{String(d.kind)}</div></>} />
            </>)}
        </div>
      )}

      {tab === "cronologia" && (
        <div className="stack">
          <EntityPanel entity="cronologia" items={byOrder(events.filter((e) => e.kind === "cronologia"))} redirectTo={here} opts={prodOpts}
            render={(d) => <><div className="t">{String(d.title)}</div><div className="s">{String(d.when)}{d.productionId ? ` · ${prodName.get(String(d.productionId)) ?? ""}` : ""}</div></>} />
        </div>
      )}

      {tab === "acontecimientos" && <EntityPanel entity="acontecimiento" items={byOrder(events.filter((e) => e.kind === "acontecimiento"))} redirectTo={here} opts={prodOpts}
        render={(d) => <><div className="t">{String(d.title)}</div><div className="s">{String(d.when)}{d.productionId ? ` · ${prodName.get(String(d.productionId)) ?? ""}` : ""}</div></>} />}

      {tab === "lugares" && <EntityPanel entity="place" items={places} redirectTo={here}
        render={(d) => <><div className="t">{String(d.name)}</div><div className="s">{String(d.description).slice(0, 90)}</div></>} />}

      {tab === "evolucion" && <EntityPanel entity="evolution" items={byOrder(evo)} redirectTo={here} opts={prodOpts}
        render={(d) => <><div className="t">{String(d.order)}. {String(d.title)}</div><div className="s">{String(d.description).slice(0, 90)}</div></>} />}
    </>
  );
}
