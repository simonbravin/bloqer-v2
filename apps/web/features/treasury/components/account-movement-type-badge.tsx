import { Badge } from "@/components/ui/badge";
import type { AccountMovementType } from "@bloqer/database";

const CONFIG: Record<AccountMovementType, { label: string; variant: "default" | "secondary" | "outline" }> = {
  INFLOW:        { label: "Ingreso",          variant: "default" },
  OUTFLOW:       { label: "Egreso",           variant: "secondary" },
  TRANSFER_IN:   { label: "Transfer. entrada", variant: "default" },
  TRANSFER_OUT:  { label: "Transfer. salida",  variant: "secondary" },
  ADJUSTMENT:    { label: "Ajuste",            variant: "outline" },
};

export function AccountMovementTypeBadge({ type }: { type: AccountMovementType }) {
  const { label, variant } = CONFIG[type];
  return <Badge variant={variant}>{label}</Badge>;
}
