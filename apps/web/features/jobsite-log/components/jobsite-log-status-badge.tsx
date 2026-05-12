import { Badge } from "@/components/ui/badge";
import type { JobsiteLogStatus } from "@bloqer/database";

const config: Record<JobsiteLogStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:     { label: "Borrador",  variant: "outline" },
  SUBMITTED: { label: "Enviado",   variant: "default" },
  APPROVED:  { label: "Aprobado",  variant: "secondary" },
  CANCELLED: { label: "Anulado",   variant: "destructive" },
};

export function JobsiteLogStatusBadge({ status }: { status: JobsiteLogStatus }) {
  const { label, variant } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}
