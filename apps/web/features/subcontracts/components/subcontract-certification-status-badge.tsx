import { Badge } from "@/components/ui/badge";
import type { SubcontractCertificationStatus } from "@bloqer/database";

const config: Record<SubcontractCertificationStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:     { label: "Borrador",  variant: "outline" },
  ISSUED:    { label: "Emitida",   variant: "default" },
  APPROVED:  { label: "Aprobada",  variant: "secondary" },
  REJECTED:  { label: "Rechazada", variant: "destructive" },
  CANCELLED: { label: "Anulada",   variant: "destructive" },
};

export function SubcontractCertificationStatusBadge({ status }: { status: SubcontractCertificationStatus }) {
  const { label, variant } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}
