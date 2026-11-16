import type { ZodType } from "zod";
import {
  BibleEntry, Character, Cost, Evolution, Place, Production, Relationship, StoryEvent,
} from "@/domain/types";
import type { Storage } from "@/ports";

export type FieldSpec = {
  name: string; label: string; wide?: boolean;
  type: "text" | "textarea" | "number" | "select" | "date" | "tags";
  required?: boolean; options?: { value: string; label: string }[]; placeholder?: string;
};

export type EntityDef = {
  key: string; collection: keyof Storage; label: string; plural: string;
  schema: ZodType; fields: FieldSpec[]; defaults?: Record<string, unknown>;
};

const text = (name: string, label: string, required = false, extra: Partial<FieldSpec> = {}): FieldSpec =>
  ({ name, label, type: "text", required, ...extra });
const area = (name: string, label: string): FieldSpec => ({ name, label, type: "textarea", wide: true });

export const ENTITIES: Record<string, EntityDef> = {
  character: {
    key: "character", collection: "characters", label: "personaje", plural: "Personajes", schema: Character,
    fields: [text("name", "Nombre", true), area("description", "Descripción"),
      { name: "traits", label: "Rasgos (separados por comas)", type: "tags" }, area("voiceNotes", "Notas de voz")],
  },
  relationship: {
    key: "relationship", collection: "relationships", label: "relación", plural: "Relaciones", schema: Relationship,
    fields: [
      { name: "fromId", label: "Personaje A", type: "select", required: true },
      { name: "toId", label: "Personaje B", type: "select", required: true },
      text("kind", "Tipo (aliado, rival, familia…)", true), area("note", "Notas")],
  },
  bible: {
    key: "bible", collection: "bible", label: "entrada de la biblia", plural: "Biblia narrativa", schema: BibleEntry,
    fields: [text("title", "Título", true), text("category", "Categoría", false, { placeholder: "Reglas, Tono, Mundo…" }), area("text", "Contenido")],
  },
  cronologia: {
    key: "cronologia", collection: "events", label: "hito", plural: "Cronología", schema: StoryEvent,
    defaults: { kind: "cronologia" },
    fields: [text("title", "Título", true), text("when", "Cuándo (año, fecha o etiqueta)"),
      { name: "order", label: "Orden", type: "number" },
      { name: "productionId", label: "Episodio relacionado", type: "select" }, area("description", "Descripción")],
  },
  acontecimiento: {
    key: "acontecimiento", collection: "events", label: "acontecimiento", plural: "Acontecimientos", schema: StoryEvent,
    defaults: { kind: "acontecimiento" },
    fields: [text("title", "Título", true), text("when", "Cuándo"),
      { name: "order", label: "Orden", type: "number" },
      { name: "productionId", label: "Episodio relacionado", type: "select" }, area("description", "Qué ocurre y qué cambia")],
  },
  place: {
    key: "place", collection: "places", label: "lugar", plural: "Lugares", schema: Place,
    fields: [text("name", "Nombre", true), area("description", "Descripción")],
  },
  evolution: {
    key: "evolution", collection: "evolution", label: "etapa", plural: "Evolución de KAP", schema: Evolution,
    fields: [text("title", "Etapa", true), { name: "order", label: "Orden", type: "number" },
      { name: "productionId", label: "Episodio donde ocurre", type: "select" }, area("description", "Cómo cambia KAP")],
  },
  cost: {
    key: "cost", collection: "costs", label: "coste", plural: "Costes", schema: Cost,
    fields: [text("concept", "Concepto", true), { name: "amountEur", label: "Importe (€)", type: "number", required: true },
      { name: "date", label: "Fecha", type: "date", required: true },
      { name: "productionId", label: "Producción", type: "select" }],
  },
  production: {
    key: "production", collection: "productions", label: "producción", plural: "Producciones", schema: Production,
    fields: [
      text("title", "Título", true), { name: "season", label: "Temporada", type: "number", required: true },
      { name: "number", label: "Número", type: "number", required: true },
      { name: "durationSec", label: "Duración (segundos)", type: "number" },
      { name: "producedAt", label: "Fecha de producción", type: "date" },
      { name: "plannedDate", label: "Fecha de publicación prevista", type: "date" },
      area("synopsis", "Sinopsis"), area("script", "Guion")],
  },
};

/** Convierte un FormData en un objeto según las especificaciones de campos. */
export function parseFields(def: EntityDef, fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const raw = fd.get(f.name);
    const v = typeof raw === "string" ? raw.trim() : "";
    if (f.type === "number") out[f.name] = v === "" ? undefined : Number(v);
    else if (f.type === "tags") out[f.name] = v.split(",").map((t) => t.trim()).filter(Boolean);
    else if (v === "" && !f.required && (f.type === "select" || f.type === "date")) out[f.name] = undefined;
    else out[f.name] = v;
  }
  return out;
}
