import { Badge } from "@/components/ui/badge";
import type { BudgetStatus } from "@bloqer/database";

const CONFIG: Record<BudgetStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:                 { label: "Borrador",            variant: "secondary" },
  IN_REVIEW:             { label: "En revisión",         variant: "default" },
  RETURNED_FOR_CHANGES:  { label: "Con observaciones",   variant: "outline" },
  APPROVED:              { label: "Aprobado",            variant: "default" },
  CLOSED:                { label: "Cerrado",             variant: "secondary" },
  CANCELLED:             { label: "Cancelado",           variant: "destructive" },
};

/** UI label (es-AR). Canonical enum stays English in DB/API. */
export function budgetStatusLabel(status: string): string {
  return CONFIG[status as BudgetStatus]?.label ?? status;
}

export function BudgetStatusBadge({ status }: { status: BudgetStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}

/** Principal = presupuesto sin padre. Adenda = presupuesto hijo (`parentBudgetId`). */
export function BudgetKindBadge({ isAddendum }: { isAddendum: boolean }) {
  if (isAddendum) return <Badge variant="outline">Adenda</Badge>;
  return <Badge variant="secondary">Principal</Badge>;
}

type ContractualBudgetOption = {
  id: string;
  name: string;
  status: string;
  versionNumber: number;
  parentBudgetId: string | null;
};

/** Selector label: name, kind, and Spanish status. */
export function budgetFilterOptionLabel(budget: {
  name: string;
  status: string;
  parentBudgetId: string | null;
}): string {
  const kind = budget.parentBudgetId ? "Adenda" : "Principal";
  return `${budget.name} · ${kind} (${budgetStatusLabel(budget.status)})`;
}

/**
 * Budget shown when the URL has no `budgetId`.
 * Same rule as `pickPrincipalContractualBudget` ([D-116]).
 */
export function defaultContractualBudgetId(
  budgets: ContractualBudgetOption[],
  currentId?: string,
): string {
  if (currentId && budgets.some((budget) => budget.id === currentId)) return currentId;
  const contractual = budgets.filter(
    (budget) => budget.status === "APPROVED" || budget.status === "CLOSED",
  );
  const pool = contractual.length > 0 ? contractual : budgets;
  const roots = pool.filter((budget) => budget.parentBudgetId == null);
  const approvedRoot = highestVersion(roots.filter((budget) => budget.status === "APPROVED"));
  if (approvedRoot) return approvedRoot.id;
  const closedRoot = highestVersion(roots.filter((budget) => budget.status === "CLOSED"));
  if (closedRoot) return closedRoot.id;
  return highestVersion(pool)?.id ?? "";
}

function highestVersion<T extends { versionNumber: number }>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => (row.versionNumber >= best.versionNumber ? row : best));
}
