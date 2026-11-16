"use client";
import { useFormStatus } from "react-dom";

export default function SubmitButton({ children, className = "btn", confirm, name, value }: {
  children: React.ReactNode; className?: string; confirm?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} className={`${className}${pending ? " pending" : ""}`} disabled={pending}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {pending && <span className="spin" aria-hidden />}{children}
    </button>
  );
}
