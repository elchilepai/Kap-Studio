import Link from "next/link";
import { notFound } from "next/navigation";
import { getProviders } from "@/server/providers";
import { label } from "@/server/queries";
import { buildPreviews } from "@/server/animation/preview";
import { Empty, PageHeader } from "@/components/ui";
import { StageFrames } from "@/components/StagePlayer";

export const metadata = { title: "Storyboard" };

/** Storyboard: tres fotogramas por escena (inicio, mitad, final) generados por el mismo motor 2D que el render final. */
export default async function Storyboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { storage } = getProviders();
  const p = await storage.productions.get(id); if (!p || p.kind !== "episode") notFound();
  const previews = await buildPreviews(p, storage, { width: 854, height: 480 });
  return (
    <>
      <p className="small"><Link href={`/episodios/${p.id}/escenas`} className="muted">← Editor de escenas</Link></p>
      <PageHeader title="Storyboard" sub={`${label(p)} · ${p.scenes.length} escenas`} />
      {previews.length === 0 ? <Empty text="No hay escenas. Analiza el guion o genera el episodio primero." /> : (
        <div className="grid">{p.scenes.map((s, i) => { const v = previews.find((x) => x.sceneId === s.id)!; const d = v.stage.duration;
          return (
            <div key={s.id} className="card stack">
              <div className="row between"><h3>{i + 1}. {s.title || "Escena"}</h3><span className="badge">{s.durationSec.toFixed(1)} s</span></div>
              <StageFrames stage={v.stage} images={v.images} times={[d * 0.12, d * 0.5, d * 0.88]} />
              <div className="small muted">{s.location || "Sin lugar"} · {v.stage.actors.map((a) => a.name).join(", ") || "sin personajes"} · {v.stage.set.preset}/{v.stage.set.timeOfDay}</div>
              {s.directions.length > 0 && <div className="small">{s.directions.map((d2, k) => <div key={k}>↳ {d2}</div>)}</div>}
              {v.provisional.length > 0 && <div className="small" style={{ color: "var(--kap)" }}>Aspecto provisional: {v.provisional.join(", ")}</div>}
            </div>);
        })}</div>
      )}
    </>
  );
}
