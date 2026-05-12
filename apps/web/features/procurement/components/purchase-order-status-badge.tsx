import { Badge } from "@/components/ui/badge";

const MAP = {
  DRAFT:               { label: "Borrador",            variant: "secondary" },
  ISSUED:              { label: "Emitida",              variant: "default" },
  PARTIALLY_RECEIVED:  { label: "Recepción parcial",   variant: "outline" },
  RECEIVED:            { label: "Recibida",             variant: "default" },
  CANCELLED:           { label: "Anulada",              variant: "destructive" },
} as const;

export function PurchaseOrderStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant as "secondary" | "default" | "destructive" | "outline"}>{cfg.label}</Badge>;
}
