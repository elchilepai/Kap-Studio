/**
 * MEMORIA NARRATIVA — esquemas. Todo cambio de memoria es un `Change` tipado y validado: lo producen las reglas locales, las
 * directivas del guion, el usuario a mano y (en el futuro) un modelo de IA con salida estructurada. Nada entra en el canon
 * sin pasar por el mismo esquema y sin la confirmación del usuario.
 */
import { z } from "zod";

const Name = z.string().trim().min(1).max(80);
const Text = z.string().trim().min(1).max(400);
const Opt = z.string().trim().max(400).optional();

export const Change = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("character.add"), name: Name, note: Opt }),
  z.object({ kind: z.literal("character.status"), name: Name, status: z.enum(["active", "absent", "dead"]), note: Opt }),
  z.object({ kind: z.literal("character.location"), name: Name, location: Name }),
  z.object({ kind: z.literal("character.outfit"), name: Name, outfit: Text, accessories: z.array(Name).max(8).optional() }),
  z.object({ kind: z.literal("character.knows"), name: Name, fact: Text }),
  z.object({ kind: z.literal("relationship.set"), a: Name, b: Name, relation: Name, trust: z.number().int().min(-2).max(2).optional(), note: Opt }),
  z.object({ kind: z.literal("object.introduce"), name: Name, owner: Name.optional(), location: Name.optional(), note: Opt }),
  z.object({ kind: z.literal("object.update"), name: Name, status: z.enum(["intact", "damaged", "destroyed", "lost"]).optional(), owner: Name.nullable().optional(), location: Name.optional(), note: Opt }),
  z.object({ kind: z.literal("thread.open"), title: Text, involves: z.array(Name).max(10).optional(), note: Opt }),
  z.object({ kind: z.literal("thread.close"), title: Text, note: Opt }),
  z.object({ kind: z.literal("fact.add"), text: Text, key: Name.optional(), value: Name.optional(), knownBy: z.array(Name).max(12).optional(), supersede: z.boolean().optional() }),
  z.object({ kind: z.literal("rule.add"), text: Text }),
  z.object({ kind: z.literal("place.update"), name: Name, note: Opt }),
  z.object({ kind: z.literal("event.add"), title: Text, summary: Opt, participants: z.array(Name).max(12).optional() }),
  // --- serie serializada: protagonista, etapas de vida, hitos del arco y evolución del personaje ---
  z.object({ kind: z.literal("series.set"), protagonist: Name, title: Opt }),
  z.object({ kind: z.literal("stage.define"), key: Name, title: Name, order: z.number().int().min(0).max(99), facets: z.array(Name).max(24) }),
  z.object({ kind: z.literal("milestone.define"), key: Name, title: Text, stage: Name, order: z.number().int().min(0).max(999) }),
  z.object({ kind: z.literal("milestone.progress"), key: Name, status: z.enum(["in_progress", "achieved"]), note: Opt }),
  z.object({ kind: z.literal("character.stage"), name: Name, stage: Name, note: Opt }),
  z.object({ kind: z.literal("character.age"), name: Name, age: z.number().int().min(0).max(120), note: Opt }),
  z.object({ kind: z.literal("character.profile"), name: Name, facet: Name, value: Text }),
  z.object({ kind: z.literal("character.trait"), name: Name, trait: Name, level: z.number().int().min(0).max(10), note: Opt }),
  z.object({ kind: z.literal("character.appearance"), name: Name, description: Text, designVersion: z.number().int().min(1).max(999).optional() }),
]);
export type Change = z.infer<typeof Change>;
export type ChangeKind = Change["kind"];

/** Cómo se originó una propuesta: reglas locales, directiva del guion, edición manual o (futuro) modelo de IA. */
export type Origin = "rules" | "declared" | "manual" | "llm";
export type Decision = "pending" | "accepted" | "rejected";
export type ProposedChange = { id: string; change: Change; origin: Origin; decision: Decision; scene?: number; text: string };

// ------------------------------------------------------------------ estado del canon (materializado)
/** Evolución del personaje: etapa de vida, edad aproximada, rasgos del perfil y atributos, siempre con su historial (cada valor sale del anterior). */
export type Hist<T> = { ep: number; value: T }[];
export type CharState = {
  key: string; name: string; status: "active" | "absent" | "dead"; statusSince?: number; location?: string; outfit?: string; accessories: string[]; knows: string[]; firstSeen: number; lastSeen: number; notes: string[];
  stage?: string; stageHistory?: Hist<string>; age?: number; ageHistory?: Hist<number>;
  profile?: Record<string, { value: string; history: Hist<string> }>; traits?: Record<string, { level: number; history: Hist<number> }>;
  appearance?: { description: string; designVersion?: number; ep: number; history: Hist<string> };
};
export type StageDef = { key: string; title: string; order: number; facets: string[] };
export type MilestoneState = { key: string; title: string; stage: string; order: number; status: "pending" | "in_progress" | "achieved"; startedIn?: number; achievedIn?: number; episodes: number[]; notes: string[] };
export type RelState = { key: string; a: string; b: string; relation: string; trust: number; note?: string; since: number; history: { ep: number; relation: string; trust: number }[] };
export type ObjStatus = "intact" | "damaged" | "destroyed" | "lost";
export type ObjState = { key: string; name: string; status: ObjStatus; owner?: string; lastOwner?: string; location?: string; introducedIn: number; lastChangedIn: number; notes: string[] };
export type ThreadState = { key: string; title: string; status: "open" | "closed"; openedIn: number; closedIn?: number; involves: string[]; notes: string[] };
export type FactState = { key: string; text: string; k?: string; v?: string; ep: number; knownBy: string[] };
export type PlaceState = { key: string; name: string; notes: string[]; firstSeen: number; lastSeen: number };
export type EventState = { id: string; ep: number; title: string; summary?: string; participants: string[] };
export type RuleState = { key: string; text: string; ep: number };
export type CanonState = {
  asOf: number;                                   // orden del último episodio incorporado (0 = solo canon base)
  characters: Record<string, CharState>; relationships: Record<string, RelState>; objects: Record<string, ObjState>;
  threads: Record<string, ThreadState>; places: Record<string, PlaceState>;
  facts: FactState[]; rules: RuleState[]; events: EventState[];
  /** Serie serializada: protagonista, plantillas de etapa y hitos del arco (se definen en el canon base; el progreso lo escriben los episodios aprobados). */
  series?: { protagonist: string; title?: string };
  stages?: Record<string, StageDef>; milestones?: Record<string, MilestoneState>;
};

// ------------------------------------------------------------------ continuidad
export type Severity = "error" | "warning" | "info";
export const SEVERITY_LABEL: Record<Severity, string> = { error: "Error crítico", warning: "Advertencia", info: "Información nueva (pendiente de confirmar)" };
export type Finding = { id: string; severity: Severity; rule: string; text: string; scene?: number; sceneTitle?: string; subject?: string };

export type ActKind = "inicio" | "conflicto" | "desarrollo" | "emocional" | "resolucion" | "gancho";
export const ACT_LABEL: Record<ActKind, string> = { inicio: "Inicio", conflicto: "Conflicto", desarrollo: "Desarrollo", emocional: "Punto emocional o de tensión", resolucion: "Resolución parcial", gancho: "Gancho para el siguiente episodio" };
export type Act = { kind: ActKind; text: string; scene?: number };
export type LastShot = { scene: string; location: string; characters: string[]; text: string; directions: string[] };

/** Propuesta de cambios de memoria de UN episodio. Es un borrador: no es canon hasta que el usuario la confirma. */
export type MemoryProposal = {
  id: string;                                     // = id de la producción
  productionId: string; season: number; number: number; order: number; title: string;
  contentSig: string;                             // firma del contenido en el que se basa; si cambia, la propuesta queda desfasada
  status: "pending" | "committed";
  summary: string; logline: string; present: string[]; summaryEdited?: boolean;   // summaryEdited: el usuario corrigió el resumen; no se sobrescribe al recalcular
  acts?: Act[]; hook?: string;                    // estructura narrativa declarada (inicio…gancho) y el gancho del episodio
  durationSec?: number;
  lastShot: LastShot; endingNote: string;         // endingNote: texto del usuario; si está vacío se deriva del estado final
  warnings?: string[];                            // avisos del proveedor de IA (si lo hubo)
  changes: ProposedChange[];
  createdAt: string; updatedAt: string; committedAt?: string;
};

/** Episodio incorporado al canon (tras aprobar y confirmar). Las instantáneas se pueden recalcular desde `accepted`. */
export type EpisodeMemory = {
  id: string; productionId: string; season: number; number: number; order: number; title: string;
  contentSig: string;
  summary: string; logline: string; present: string[];
  accepted: ProposedChange[]; rejected: ProposedChange[];
  startState: CanonState; endState: CanonState;
  introducedObjects: string[]; modifiedObjects: string[]; relationshipChanges: string[];
  eventsText: string[]; threadsOpened: string[]; threadsClosed: string[];
  lastShot: LastShot; endingSituation: string;
  acts?: Act[]; hook?: string; durationSec?: number;
  continuesFrom?: number;
  committedAt: string; committedBy: string;
};

/** Canon base: reglas del universo, hechos y estados iniciales que escribe el usuario (su acto de escribirlos es la confirmación). */
export type CanonBase = { id: "base"; changes: ProposedChange[]; updatedAt: string };

// ------------------------------------------------------------------ petición y contexto
export type EpisodeRequest = {
  text: string; number: number; season: number;
  continuesFrom?: number;                          // orden del episodio del que se continúa
  exact: boolean;                                  // «exactamente donde terminó»: el último plano es obligatorio
  cast: string[];                                  // personajes mencionados en la petición
  notes: string;
};
export type ContextSection = { id: string; title: string; priority: number; required: boolean; items: string[] };
export type ContextPack = {
  request: EpisodeRequest;
  budgetTokens: number; usedTokens: number; overBudget?: boolean;   // overBudget: ni lo imprescindible cabe (presupuesto demasiado pequeño)
  sections: { id: string; title: string; text: string; tokens: number; itemsTotal: number; itemsIncluded: number }[];
  dropped: { section: string; items: number }[];
  relevantCharacters: string[];
  text: string;                                   // listo para entregar a un modelo (Markdown en español)
};
