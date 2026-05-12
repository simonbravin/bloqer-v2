import { Badge } from "@/components/ui/badge";
import type { SalesInvoiceStatus } from "@bloqer/database";

const CONFIG: Record<SalesInvoiceStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:     { label: "Borrador",  variant: "secondary" },
  ISSUED:    { label: "Emitida",   variant: "default" },
  CANCELLED: { label: "Anulada",   variant: "destructive" },
};

export function SalesInvoiceStatusBadge({ status }: { status: SalesInvoiceStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
