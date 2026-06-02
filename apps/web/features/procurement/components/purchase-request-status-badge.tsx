import { Badge } from "@/components/ui/badge";

const MAP = {
  DRAFT:          { label: "Borrador",           variant: "secondary" },
  SUBMITTED:      { label: "Enviada",            variant: "default" },
  QUOTE_SELECTED: { label: "Cotización elegida", variant: "outline" },
  COMPLETED:      { label: "Completada",         variant: "default" },
  CANCELLED:      { label: "Anulada",            variant: "destructive" },
} as const;

export function PurchaseRequestStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? { label: status, variant: "outline" };
  return (
    <Badge variant={cfg.variant as "secondary" | "default" | "destructive" | "outline"}>
      {cfg.label}
    </Badge>
  );
}
