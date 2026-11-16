import { KAP_CONFIG } from "@/lib/config";

export default function Dashboard() {
  return (
    <>
      <h1>Panel</h1>
      <p className="sub">Canal {KAP_CONFIG.channel} · publicación semanal · modo {KAP_CONFIG.publishMode}</p>
      <div className="grid">
        <div className="card"><b>Fase 0</b><p>Arquitectura base lista. Los módulos se irán activando por fases (ver docs/PLAN.md).</p></div>
        <div className="card"><span className="tag">Pendiente de revisión</span><p>0 vídeos</p></div>
        <div className="card"><span className="tag">Próxima publicación</span><p>Sin planificar</p></div>
      </div>
    </>
  );
}
