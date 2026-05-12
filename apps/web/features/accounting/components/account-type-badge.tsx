import { Badge } from "@/components/ui/badge";
import type { AccountType } from "@bloqer/database";

const CONFIG: Record<AccountType, { label: string; variant: "default" | "secondary" | "outline" }> = {
  ASSET:     { label: "Activo",     variant: "default" },
  LIABILITY: { label: "Pasivo",     variant: "secondary" },
  EQUITY:    { label: "Patrimonio", variant: "outline" },
  INCOME:    { label: "Ingreso",    variant: "secondary" },
  EXPENSE:   { label: "Gasto",      variant: "outline" },
};

export function AccountTypeBadge({ type }: { type: AccountType }) {
  const { label, variant } = CONFIG[type];
  return <Badge variant={variant}>{label}</Badge>;
}
