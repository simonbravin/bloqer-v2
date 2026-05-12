import { Badge } from "@/components/ui/badge";
import type { SubcontractStatus } from "@bloqer/database";

const config: Record<SubcontractStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:     { label: "Borrador",   variant: "outline" },
  ACTIVE:    { label: "Activo",     variant: "default" },
  COMPLETED: { label: "Completado", variant: "secondary" },
  CANCELLED: { label: "Anulado",    variant: "destructive" },
};

export function SubcontractStatusBadge({ status }: { status: SubcontractStatus }) {
  const { label, variant } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}
