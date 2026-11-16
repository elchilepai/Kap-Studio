import Link from "next/link";
import { Film } from "lucide-react";
import type { Production } from "@/domain/types";
import { fmtDate, fmtDuration } from "@/lib/format";
import { Empty, StatusBadge } from "./ui";

export default function ProductionList({ items, shortsOf, base }: { items: Production[]; shortsOf?: Map<string, Production[]>; base: string }) {
  if (items.length === 0) return <Empty Icon={Film} text="Todavía no hay nada aquí." />;
  const seasons = [...new Set(items.map((p) => p.season))];
  return (
    <div className="stack">
      {seasons.map((s) => (
        <div key={s} className="stack">
          <h2>Temporada {s}</h2>
          <div className="grid">
            {items.filter((p) => p.season === s).map((p) => {
              const sh = shortsOf?.get(p.id) ?? [];
              return (
                <Link key={p.id} href={`${base}/${p.id}`} className="card stack">
                  <div className="row between"><span className="badge kap">{p.kind === "episode" ? `Episodio ${p.number}` : `Short ${p.number}`}</span><StatusBadge status={p.status} /></div>
                  <h3>{p.title}</h3>
                  <p className="muted small" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.synopsis || "Sin sinopsis."}</p>
                  <div className="row small muted"><span>⏱ {fmtDuration(p.durationSec)}</span><span>🎬 {fmtDate(p.producedAt)}</span>{p.kind === "episode" && <span>Shorts: {sh.length}</span>}</div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
