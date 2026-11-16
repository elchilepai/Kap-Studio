"use client";
import { useActionState } from "react";
import { changePassword, type FormState } from "@/server/auth-actions";

export default function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, null);
  return (
    <form action={action} className="stack">
      <div className="field"><label htmlFor="cur">Contraseña actual</label><input id="cur" name="current" type="password" autoComplete="current-password" required /></div>
      <div className="field"><label htmlFor="new">Nueva contraseña (mín. 12 caracteres)</label><input id="new" name="next" type="password" autoComplete="new-password" minLength={12} required /></div>
      <div className="field"><label htmlFor="again">Repite la nueva contraseña</label><input id="again" name="again" type="password" autoComplete="new-password" minLength={12} required /></div>
      {state?.error && <div className="notice err" role="alert">{state.error}</div>}
      {state?.ok && <div className="notice ok" role="status">{state.ok}</div>}
      <div className="row"><button className={`btn primary${pending ? " pending" : ""}`} disabled={pending}>{pending && <span className="spin" />}Cambiar contraseña</button></div>
    </form>
  );
}
