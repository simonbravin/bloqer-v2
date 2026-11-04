import type { ProjectStatus } from "@bloqer/database";

/** Mirrors the existing planning guard: drafts and active projects allow budget planning. */
export function budgetProjectReadOnlyReason(status: ProjectStatus): string | null {
  if (status === "DRAFT" || status === "ACTIVE") return null;
  if (status === "ON_HOLD") return "La obra está pausada. Los presupuestos son de solo lectura hasta reanudarla.";
  return "La obra está finalizada o cancelada. Los presupuestos son de solo lectura.";
}
