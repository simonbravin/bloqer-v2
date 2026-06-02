import { Badge } from "@/components/ui/badge";

const MAP = {
  DRAFT:              { label: "—",           variant: "outline" as const },
  CONFIRMED:          { label: "Pendiente",   variant: "secondary" as const },
  ISSUED:             { label: "Pendiente",   variant: "secondary" as const },
  PARTIALLY_RECEIVED: { label: "Parcial",     variant: "outline" as const },
  RECEIVED:           { label: "Recibida",    variant: "default" as const },
  CANCELLED:          { label: "—",           variant: "outline" as const },
};

export function PurchaseOrderReceiptBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? { label: "—", variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className={cfg.label === "—" ? "text-muted-foreground font-normal" : undefined}>
      {cfg.label}
    </Badge>
  );
}
