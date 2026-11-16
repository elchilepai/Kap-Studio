import type { ProductionStatus } from "./types";

const NEXT: Record<ProductionStatus, ProductionStatus[]> = {
  IDEA: ["SCRIPTING", "REJECTED"],
  SCRIPTING: ["STORYBOARD", "REJECTED"],
  STORYBOARD: ["ASSETS", "SCRIPTING"],
  ASSETS: ["VOICE", "STORYBOARD"],
  VOICE: ["RENDER", "ASSETS"],
  RENDER: ["REVIEW"],
  REVIEW: ["APPROVED", "REJECTED", "SCRIPTING"],
  APPROVED: ["SCHEDULED"],
  SCHEDULED: ["PUBLISHED", "REVIEW"],
  PUBLISHED: [],
  REJECTED: ["IDEA"],
};

export function canTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  return NEXT[from].includes(to);
}

/** Regla del modo APPROVAL: solo se publica lo aprobado por el administrador. */
export function canPublish(status: ProductionStatus): boolean {
  return status === "APPROVED" || status === "SCHEDULED";
}

/** Etapas del pipeline, en orden, usadas para calcular el progreso. */
export const PIPELINE: ProductionStatus[] = [
  "IDEA", "SCRIPTING", "STORYBOARD", "ASSETS", "VOICE", "RENDER", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED",
];

export const STATUS_LABEL: Record<ProductionStatus, string> = {
  IDEA: "Idea", SCRIPTING: "Guion", STORYBOARD: "Storyboard", ASSETS: "Recursos", VOICE: "Voz",
  RENDER: "Render", REVIEW: "En revisión", APPROVED: "Aprobado", SCHEDULED: "Programado",
  PUBLISHED: "Publicado", REJECTED: "Rechazado",
};

/** 0..100. Rechazado = 0. */
export function progressOf(status: ProductionStatus): number {
  const i = PIPELINE.indexOf(status);
  return i < 0 ? 0 : Math.round((i / (PIPELINE.length - 1)) * 100);
}

export function allowedNext(status: ProductionStatus): ProductionStatus[] {
  return NEXT[status];
}

export function isOpen(status: ProductionStatus): boolean {
  return status !== "PUBLISHED" && status !== "REJECTED";
}
