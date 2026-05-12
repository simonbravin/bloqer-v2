import { Badge } from "@/components/ui/badge";

const CONFIG = {
  CONFIRMED: { label: "Confirmada", variant: "secondary"    as const },
  CANCELLED: { label: "Cancelada",  variant: "destructive"  as const },
};

export function WarehouseTransferStatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as keyof typeof CONFIG] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
