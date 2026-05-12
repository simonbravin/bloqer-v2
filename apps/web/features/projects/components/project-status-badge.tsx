import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@bloqer/database";

const CONFIG: Record<ProjectStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:     { label: "Borrador",   variant: "secondary" },
  ACTIVE:    { label: "Activo",     variant: "default" },
  ON_HOLD:   { label: "En pausa",   variant: "outline" },
  COMPLETED: { label: "Completado", variant: "secondary" },
  CANCELLED: { label: "Cancelado",  variant: "destructive" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
