import { ScrollText } from "lucide-react";
import { getProviders } from "@/server/providers";
import { Empty, PageHeader } from "@/components/ui";

export default async function Actividad() {
  const rows = await getProviders().storage.activity.recent(200);
  return (
    <>
      <PageHeader title="Registro de actividad" sub="Últimas 200 acciones registradas (solo lectura)" />
      {rows.length === 0 ? <Empty Icon={ScrollText} text="Aún no hay actividad registrada." /> : (
        <ul className="list">{rows.map((r) => (
          <li key={r.id} className="item"><div style={{ minWidth: 0 }}><div className="t">{r.action}{r.target ? ` · ${r.target}` : ""}</div>
            {r.detail && <div className="s">{r.detail}</div>}<div className="s">{new Date(r.ts).toLocaleString("es-ES")} · {r.actor}</div></div></li>))}</ul>
      )}
    </>
  );
}
