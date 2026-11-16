import { episodes, shorts } from "@/server/queries";
import { EntityForm } from "@/components/EntityPanel";
import ProductionList from "@/components/ProductionList";
import { PageHeader } from "@/components/ui";
import { Plus, ChevronRight } from "lucide-react";
import type { Production } from "@/domain/types";

export default async function Episodios({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const [eps, shs, q] = await Promise.all([episodes(), shorts(), searchParams]);
  const shortsOf = new Map<string, Production[]>();
  for (const s of shs) if (s.parentId) shortsOf.set(s.parentId, [...(shortsOf.get(s.parentId) ?? []), s]);
  const nextNum = Math.max(0, ...eps.map((e) => e.number)) + 1;
  return (
    <>
      <PageHeader title="Episodios" sub={`${eps.length} episodios · objetivo ≈ 5 min`} />
      <details className="acc" open={q.nuevo === "1"} style={{ marginBottom: 20 }}>
        <summary><Plus className="i kap" />Nuevo episodio<ChevronRight className="i chev" /></summary>
        <div className="body"><EntityForm entity="production" doc={{ id: "", season: eps.at(-1)?.season ?? 1, number: nextNum, durationSec: 300 } as never} hidden={{ _kind: "episode" }} redirectTo="/episodios" submit="Crear episodio" /></div>
      </details>
      <ProductionList items={eps} shortsOf={shortsOf} base="/episodios" />
    </>
  );
}
