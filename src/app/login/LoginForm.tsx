"use client";
import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { login, type FormState } from "@/server/auth-actions";

export default function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, null);
  return (
    <form action={action} className="stack">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="field"><label htmlFor="username">Usuario</label><input id="username" name="username" defaultValue={state?.username} autoComplete="username" autoCapitalize="none" autoCorrect="off" required autoFocus /></div>
      <div className="field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {state?.error && <div className="notice err" role="alert">{state.error}</div>}
      <button className={`btn primary${pending ? " pending" : ""}`} disabled={pending}>{pending ? <span className="spin" /> : <LogIn className="i" />}Entrar</button>
    </form>
  );
}
