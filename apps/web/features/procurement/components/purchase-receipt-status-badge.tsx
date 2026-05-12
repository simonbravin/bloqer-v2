import { Badge } from "@/components/ui/badge";

const MAP = {
  DRAFT:     { label: "Borrador",   variant: "secondary" },
  CONFIRMED: { label: "Confirmada", variant: "default" },
  CANCELLED: { label: "Anulada",    variant: "destructive" },
} as const;

export function PurchaseReceiptStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant as "secondary" | "default" | "destructive" | "outline"}>{cfg.label}</Badge>;
}
