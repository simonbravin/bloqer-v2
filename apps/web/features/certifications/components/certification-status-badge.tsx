import { Badge } from "@/components/ui/badge";
import type { CertificationStatus } from "@bloqer/database";

const CONFIG: Record<CertificationStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:     { label: "Borrador",  variant: "secondary" },
  ISSUED:    { label: "Emitida",   variant: "default" },
  APPROVED:  { label: "Aprobada",  variant: "default" },
  REJECTED:  { label: "Rechazada", variant: "destructive" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
};

export function CertificationStatusBadge({ status }: { status: CertificationStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
