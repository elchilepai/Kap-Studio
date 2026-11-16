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
