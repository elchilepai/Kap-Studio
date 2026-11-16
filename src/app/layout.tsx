import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "KAP Studio", description: "Estudio de producción del canal KAP" };

const NAV = [
  ["/", "Panel"], ["/episodios", "Episodios"], ["/shorts", "Shorts"], ["/personajes", "Personajes"],
  ["/escenas", "Escenas"], ["/recursos", "Recursos"], ["/calendario", "Calendario"],
  ["/revision", "Revisión"], ["/estadisticas", "Estadísticas"], ["/ajustes", "Ajustes"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="shell">
          <nav className="side">
            <div className="brand">KAP STUDIO</div>
            {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
