import { Badge } from "@/components/ui/badge";

const MAP = {
  DRAFT:      { label: "Borrador",   variant: "secondary" },
  RECEIVED:   { label: "Recibida",   variant: "default" },
  SELECTED:   { label: "Seleccionada", variant: "default" },
  REJECTED:   { label: "Rechazada",  variant: "destructive" },
  SUPERSEDED: { label: "Reemplazada", variant: "outline" },
} as const;

export function ProcurementQuoteStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? { label: status, variant: "outline" };
  return (
    <Badge variant={cfg.variant as "secondary" | "default" | "destructive" | "outline"}>
      {cfg.label}
    </Badge>
  );
}
