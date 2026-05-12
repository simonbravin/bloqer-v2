import { Badge } from "@/components/ui/badge";
import type { JournalEntryStatus } from "@bloqer/database";

const CONFIG: Record<JournalEntryStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  DRAFT:     { label: "Borrador",      variant: "secondary" },
  POSTED:    { label: "Contabilizado", variant: "default" },
  CANCELLED: { label: "Anulado",       variant: "destructive" },
};

export function JournalEntryStatusBadge({ status }: { status: JournalEntryStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
