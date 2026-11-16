import { Clapperboard } from "lucide-react";
import { safeLocalPath } from "@/lib/security";
import LoginForm from "./LoginForm";

export const metadata = { title: "Acceso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeLocalPath((await searchParams).next, "");
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card stack" style={{ width: "min(100%, 400px)", padding: 28 }}>
        <div className="brand" style={{ margin: 0 }}><span className="logo"><Clapperboard size={18} /></span>KAP STUDIO</div>
        <p className="muted small">Acceso privado del administrador.</p>
        <LoginForm next={next || undefined} />
      </div>
    </div>
  );
}
