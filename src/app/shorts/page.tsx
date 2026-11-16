import { Plus, ChevronRight } from "lucide-react";
import { allProductions, episodes, shorts, label } from "@/server/queries";
import { EntityForm } from "@/components/EntityPanel";
import ProductionList from "@/components/ProductionList";
import { PageHeader } from "@/components/ui";

export default async function Shorts() {
  const [shs, eps, all] = await Promise.all([shorts(), episodes(), allProductions()]);
  const nextNum = Math.max(0, ...shs.map((s) => s.number)) + 1;
  return (
    <>
      <PageHeader title="Shorts" sub={`${shs.length} Shorts · cada uno puede asociarse a un episodio`} />
      <details className="acc" style={{ marginBottom: 20 }}>
        <summary><Plus className="i kap" />Nuevo Short<ChevronRight className="i chev" /></summary>
        <div className="body"><EntityForm entity="production" doc={{ id: "", season: eps.at(-1)?.season ?? 1, number: nextNum, durationSec: 45 } as never}
          hidden={{ _kind: "short" }} opts={{}} redirectTo="/shorts" submit="Crear Short" />
          <p className="muted small" style={{ marginTop: 10 }}>Después podrás asociarlo a un episodio desde su ficha{eps.length ? ` (${label(eps[0])}…)` : ""}, o crearlo directamente desde el episodio.</p>
        </div>
      </details>
      <ProductionList items={shs} base="/shorts" />
      {void all}
    </>
  );
}
