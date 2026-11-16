import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "KAP Studio", template: "%s · KAP Studio" }, description: "Estudio de producción del canal KAP", robots: { index: false, follow: false }, appleWebApp: { capable: true, title: "KAP Studio", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#111318" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="es"><body>{children}</body></html>);
}
