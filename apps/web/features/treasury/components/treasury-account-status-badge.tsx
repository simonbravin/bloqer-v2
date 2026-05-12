import { Badge } from "@/components/ui/badge";
import type { TreasuryAccountStatus } from "@bloqer/database";

const CONFIG: Record<TreasuryAccountStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  ACTIVE:   { label: "Activa",   variant: "default" },
  INACTIVE: { label: "Inactiva", variant: "secondary" },
  CLOSED:   { label: "Cerrada",  variant: "destructive" },
};

export function TreasuryAccountStatusBadge({ status }: { status: TreasuryAccountStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
