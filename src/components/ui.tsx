import Link from "next/link";
import { Inbox } from "lucide-react";
import type { ProductionStatus } from "@/domain/types";
import { PIPELINE, STATUS_LABEL, progressOf } from "@/domain/workflow";
import SubmitButton from "./SubmitButton";

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{children && <div className="row">{children}</div>}</div>;
}

export function Empty({ text, Icon = Inbox, children }: { text: string; Icon?: typeof Inbox; children?: React.ReactNode }) {
  return <div className="empty"><Icon className="i" /><p>{text}</p>{children}</div>;
}

export function Notice({ kind, children }: { kind?: "err" | "ok"; children: React.ReactNode }) {
  return <div className={`notice ${kind ?? ""}`}>{children}</div>;
}

export function StatusBadge({ status }: { status: ProductionStatus }) {
  const k = status === "PUBLISHED" || status === "APPROVED" ? "ok" : status === "REJECTED" ? "err" : status === "REVIEW" ? "kap" : "info";
  return <span className={`badge ${k}`}>{STATUS_LABEL[status]}</span>;
}

export function Progress({ value }: { value: number }) {
  return <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div>;
}

export function Pipeline({ status }: { status: ProductionStatus }) {
  const cur = PIPELINE.indexOf(status);
  return (
    <div>
      <div className="pipe">{PIPELINE.map((s, i) => <i key={s} className={i < cur ? "done" : i === cur ? "cur" : ""} title={STATUS_LABEL[s]} />)}</div>
      <div className="stages">{PIPELINE.map((s, i) => <span key={s} className={i === cur ? "cur" : ""}>{STATUS_LABEL[s]}</span>)}</div>
    </div>
  );
}

export function ProdLink({ p, children }: { p: { id: string; kind: string }; children: React.ReactNode }) {
  return <Link href={p.kind === "short" ? `/shorts/${p.id}` : `/episodios/${p.id}`}>{children}</Link>;
}

export function ActionForm({ action, fields, children, className = "btn", confirm }: {
  action: (fd: FormData) => void | Promise<void>; fields?: Record<string, string>;
  children: React.ReactNode; className?: string; confirm?: string;
}) {
  return (
    <form action={action}>
      {Object.entries(fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton className={className} confirm={confirm}>{children}</SubmitButton>
    </form>
  );
}

export { progressOf };
