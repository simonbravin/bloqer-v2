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

export function BudgetStatusBadge({ status }: { status: BudgetStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
