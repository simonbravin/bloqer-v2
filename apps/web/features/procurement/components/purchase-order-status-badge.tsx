import { Badge } from "@/components/ui/badge";

const MAP = {
  DRAFT: {
    label: "Borrador",
    variant: "secondary",
    title: "Borrador: aún no enviada a aprobación",
  },
  SUBMITTED: {
    label: "Pend. aprobación",
    variant: "outline",
    title: "Pendiente de aprobación (control interno; todavía no reserva $)",
  },
  APPROVED: {
    label: "Aprobada",
    // Outline so Aprobada ≠ Confirmada (Comprometido) visually.
    variant: "outline",
    title: "Aprobada: control interno. Todavía no reserva $ — falta Confirmar al proveedor",
  },
  CONFIRMED: {
    label: "Confirmada",
    variant: "default",
    title: "Confirmada: Comprometido en EDT (ya reserva $)",
  },
  PARTIALLY_RECEIVED: {
    label: "Recepción parcial",
    variant: "outline",
    title: "Recepción parcial: parte de la mercadería ingresó",
  },
  RECEIVED: {
    label: "Recibida",
    variant: "default",
    title: "Recibida: mercadería completa (la CxP nace al emitir la factura)",
  },
  CANCELLED: {
    label: "Anulada",
    variant: "destructive",
    title: "Anulada",
  },
} as const;

export function PurchaseOrderStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status as keyof typeof MAP] ?? {
    label: status,
    variant: "outline" as const,
    title: status,
  };
  return (
    <Badge
      variant={cfg.variant as "secondary" | "default" | "destructive" | "outline"}
      title={cfg.title}
    >
      <span className="sr-only">{cfg.title}. </span>
      {cfg.label}
    </Badge>
  );
}
