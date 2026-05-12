import { Badge } from "@/components/ui/badge";
import type { ReceivableStatus } from "@bloqer/database";

const CONFIG: Record<ReceivableStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  OPEN:      { label: "Abierta",   variant: "default" },
  PARTIAL:   { label: "Parcial",   variant: "secondary" },
  PAID:      { label: "Cobrada",   variant: "outline" },
  OVERDUE:   { label: "Vencida",   variant: "destructive" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
};

export function ReceivableStatusBadge({ status }: { status: ReceivableStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
