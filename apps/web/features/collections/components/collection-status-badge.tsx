import { Badge } from "@/components/ui/badge";
import type { CollectionStatus } from "@bloqer/database";

const CONFIG: Record<CollectionStatus, { label: string; variant: "default" | "destructive" }> = {
  CONFIRMED: { label: "Confirmada", variant: "default" },
  CANCELLED: { label: "Cancelada",  variant: "destructive" },
};

export function CollectionStatusBadge({ status }: { status: CollectionStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
