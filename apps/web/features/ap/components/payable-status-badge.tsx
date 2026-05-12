import { Badge } from "@/components/ui/badge";

const MAP = {
  OPEN:      { label: "Pendiente",      variant: "secondary" },
  PARTIAL:   { label: "Pago parcial",   variant: "default" },
  PAID:      { label: "Pagado",         variant: "outline" },
  OVERDUE:   { label: "Vencido",        variant: "destructive" },
  CANCELLED: { label: "Cancelado",      variant: "destructive" },
} as const;

export function PayableStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant as "secondary" | "default" | "destructive" | "outline"}>{cfg.label}</Badge>;
}
