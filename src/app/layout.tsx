import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import Nav from "@/components/Nav";
import { pendingReviewCount } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "KAP Studio", template: "%s · KAP Studio" }, description: "Estudio de producción del canal KAP", appleWebApp: { capable: true, title: "KAP Studio", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#111318" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await pendingReviewCount();
  return (
    <html lang="es">
      <body>
        <div className="shell">
          <Nav pending={pending} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
