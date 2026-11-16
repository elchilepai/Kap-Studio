import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { ENTITIES, type FieldSpec } from "@/server/entities";
import { deleteEntity, saveEntity } from "@/server/actions";
import SubmitButton from "./SubmitButton";
import { Empty } from "./ui";

type Doc = Record<string, unknown> & { id: string };
type Opts = Record<string, { value: string; label: string }[]>;

function Field({ f, doc, opts }: { f: FieldSpec; doc?: Doc; opts?: Opts }) {
  const raw = doc?.[f.name];
  const val = Array.isArray(raw) ? raw.join(", ") : raw == null ? "" : String(raw);
  const id = `${doc?.id ?? "new"}-${f.name}`;
  return (
    <div className={`field${f.wide ? " wide" : ""}`}>
      <label htmlFor={id}>{f.label}{f.required ? " *" : ""}</label>
      {f.type === "textarea" ? <textarea id={id} name={f.name} defaultValue={val} />
        : f.type === "select" ? (
          <select id={id} name={f.name} defaultValue={val} required={f.required}>
            <option value="">{f.required ? "Selecciona…" : "— Ninguno —"}</option>
            {(opts?.[f.name] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : <input id={id} name={f.name} defaultValue={val} required={f.required} placeholder={f.placeholder}
            type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step={f.type === "number" ? "any" : undefined}
            inputMode={f.type === "number" ? "decimal" : undefined} />}
    </div>
  );
}

export function EntityForm({ entity, doc, opts, hidden, redirectTo, submit = "Guardar" }: {
  entity: string; doc?: Doc; opts?: Opts; hidden?: Record<string, string>; redirectTo?: string; submit?: string;
}) {
  const def = ENTITIES[entity];
  return (
    <form action={saveEntity} className="stack">
      <input type="hidden" name="_entity" value={entity} />
      {doc && <input type="hidden" name="_id" value={doc.id} />}
      {redirectTo && <input type="hidden" name="_redirect" value={redirectTo} />}
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="form">{def.fields.map((f) => <Field key={f.name} f={f} doc={doc} opts={opts} />)}</div>
      <div className="row"><SubmitButton className="btn primary">{submit}</SubmitButton></div>
    </form>
  );
}

/** Lista + alta + edición + borrado de cualquier entidad genérica. */
export default function EntityPanel({ entity, items, opts, hidden, redirectTo, render, emptyText, canAdd = true, addOpen }: {
  entity: string; items: Doc[]; opts?: Opts; hidden?: Record<string, string>; redirectTo?: string;
  render: (d: Doc) => React.ReactNode; emptyText?: string; canAdd?: boolean; addOpen?: boolean;
}) {
  const def = ENTITIES[entity];
  return (
    <div className="stack">
      {canAdd && (
        <details className="acc" open={addOpen}>
          <summary><Plus className="i kap" />Añadir {def.label}<ChevronRight className="i chev" /></summary>
          <div className="body"><EntityForm entity={entity} opts={opts} hidden={hidden} redirectTo={redirectTo} submit={`Crear ${def.label}`} /></div>
        </details>
      )}
      {items.length === 0 ? <Empty text={emptyText ?? `Aún no hay ${def.plural.toLowerCase()}.`} /> : items.map((d) => (
        <details className="acc" key={d.id}>
          <summary><span style={{ minWidth: 0, flex: 1 }}>{render(d)}</span><Pencil className="i chev" /></summary>
          <div className="body stack">
            <EntityForm entity={entity} doc={d} opts={opts} hidden={hidden} redirectTo={redirectTo} />
            <form action={deleteEntity.bind(null, entity, d.id, redirectTo)}>
              <SubmitButton className="btn danger sm" confirm={`¿Eliminar este ${def.label}?`}><Trash2 className="i" />Eliminar</SubmitButton>
            </form>
          </div>
        </details>
      ))}
    </div>
  );
}
