import { Database, Download, KeyRound, PlaySquare, Save, ShieldCheck } from "lucide-react";
import { getProviders, DATA_DIR } from "@/server/providers";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { saveSettings } from "@/server/actions";
import { youtubeStatus } from "@/server/queries";
import { KAP_CONFIG } from "@/lib/config";
import { requireAdmin } from "@/server/auth/guard";
import { revokeOtherSessions } from "@/server/auth-actions";
import { Notice } from "@/components/ui";
import PasswordForm from "./PasswordForm";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ sesiones?: string }> }) {
  const user = await requireAdmin();
  const q = await searchParams;
  const sessions = await getProviders().auth.countSessions(user.id, Date.now());
  const s = (await getProviders().storage.settings.get("settings")) ?? { channelName: "KAP", channelUrl: "", publishWeekday: 5 };
  const yt = youtubeStatus();
  return (
    <>
      <PageHeader title="Configuración" sub="Canal, publicación y datos" />
      {q.sesiones !== undefined && <Notice kind="ok">Se cerraron {q.sesiones} sesiones en otros dispositivos.</Notice>}
      <div className="grid">
        <div className="card stack"><h2><KeyRound className="i" />Cuenta de administrador</h2>
          <p className="small muted">Usuario: <b style={{ color: "var(--text)" }}>{user.username}</b> · Sesiones activas: {sessions}</p>
          <PasswordForm />
          <form action={revokeOtherSessions}><SubmitButton className="btn sm">Cerrar sesión en los demás dispositivos</SubmitButton></form></div>
        <div className="card stack"><h2><Save className="i" />Canal</h2>
          <form action={saveSettings} className="stack">
            <div className="field"><label htmlFor="cn">Nombre del canal</label><input id="cn" name="channelName" defaultValue={s.channelName} required /></div>
            <div className="field"><label htmlFor="cu">URL del canal</label><input id="cu" name="channelUrl" type="url" defaultValue={s.channelUrl} placeholder="https://youtube.com/@…" /></div>
            <div className="field"><label htmlFor="wd">Día de publicación semanal</label>
              <select id="wd" name="publishWeekday" defaultValue={String(s.publishWeekday)}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></div>
            <div className="row"><SubmitButton className="btn primary">Guardar</SubmitButton></div>
          </form></div>
        <div className="card stack"><h2><ShieldCheck className="i" />Modo de publicación</h2>
          <span className="badge ok">{KAP_CONFIG.publishMode}</span>
          <p className="muted small">Ningún vídeo pasa a «aprobado» ni se publica sin tu decisión en el Centro de aprobación. Este modo está fijado por diseño.</p></div>
        <div className="card stack"><h2><PlaySquare className="i" />YouTube</h2>
          <span className="badge err">{yt.label}</span><p className="muted small">{yt.detail}</p>
          <p className="muted small">Variables previstas: <code>YOUTUBE_OAUTH_CLIENT_ID</code>, <code>YOUTUBE_OAUTH_CLIENT_SECRET</code> (ver .env.example).</p></div>
        <div className="card stack"><h2><Database className="i" />Datos</h2>
          <p className="muted small">Base de datos local SQLite y archivos en <code>{DATA_DIR}</code>. Los datos persisten entre reinicios.</p>
          <div className="row"><a className="btn" href="/api/backup"><Download className="i" />Descargar copia (JSON)</a><a className="btn" href="/actividad">Registro de actividad</a></div></div>
      </div>
    </>
  );
}
