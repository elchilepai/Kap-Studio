"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/server/auth-actions";
import { useEffect, useState } from "react";
import {
  BarChart3, BookOpen, Cpu, LogOut, CheckCircle2, Clapperboard, Factory, Film, Library, LayoutDashboard, MoreHorizontal, Send, Settings, Smartphone,
} from "lucide-react";

const ITEMS = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard, short: "Inicio" },
  { href: "/universo", label: "Universo KAP", Icon: BookOpen, short: "Universo" },
  { href: "/episodios", label: "Episodios", Icon: Film, short: "Episodios" },
  { href: "/shorts", label: "Shorts", Icon: Smartphone, short: "Shorts" },
  { href: "/produccion", label: "Producción", Icon: Factory, short: "Producción" },
  { href: "/render", label: "Renderizador", Icon: Cpu, short: "Render" },
  { href: "/biblioteca", label: "Biblioteca", Icon: Library, short: "Biblioteca" },
  { href: "/aprobacion", label: "Centro de aprobación", Icon: CheckCircle2, short: "Aprobación", badge: true },
  { href: "/publicacion", label: "Publicación", Icon: Send, short: "Publicación" },
  { href: "/analitica", label: "Analítica", Icon: BarChart3, short: "Analítica" },
  { href: "/configuracion", label: "Configuración", Icon: Settings, short: "Ajustes" },
];
const MOBILE_MAIN = ["/", "/produccion", "/aprobacion", "/episodios"];

export default function Nav({ pending, username }: { pending: number; username: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const main = ITEMS.filter((i) => MOBILE_MAIN.includes(i.href));
  const more = ITEMS.filter((i) => !MOBILE_MAIN.includes(i.href));
  const moreActive = more.some((i) => active(i.href));

  return (
    <>
      <nav className="side" aria-label="Principal">
        <div className="brand"><span className="logo"><Clapperboard size={18} /></span>KAP STUDIO</div>
        {ITEMS.map(({ href, label, Icon, badge }) => (
          <Link key={href} href={href} className={`nav-link${active(href) ? " active" : ""}`}>
            <Icon className="i" />{label}
            {badge && pending > 0 && <span className="count">{pending}</span>}
          </Link>
        ))}
        <form action={logout} style={{ marginTop: "auto" }}>
          <div className="small muted" style={{ padding: "0 12px 6px" }}>Sesión: <b style={{ color: "var(--text)" }}>{username}</b></div>
          <button className="nav-link" style={{ width: "100%", background: "none", border: 0, font: "inherit", cursor: "pointer" }}><LogOut className="i" />Cerrar sesión</button>
        </form>
      </nav>
      <nav className="bottom" aria-label="Móvil">
        {main.map(({ href, short, Icon, badge }) => (
          <Link key={href} href={href} className={active(href) ? "active" : ""}>
            <Icon className="i" />{short}
            {badge && pending > 0 && <span className="count">{pending}</span>}
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className={moreActive ? "active" : ""} aria-expanded={open}><MoreHorizontal className="i" />Más</button>
      </nav>
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-label="Más secciones">
            <div className="grab" />
            {more.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className={`nav-link${active(href) ? " active" : ""}`}><Icon className="i" />{label}</Link>
            ))}
            <form action={logout}><button className="nav-link" style={{ width: "100%", background: "none", border: 0, font: "inherit", cursor: "pointer" }}><LogOut className="i" />Cerrar sesión ({username})</button></form>
          </div>
        </>
      )}
    </>
  );
}
