import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { ReceivableStatusBadge } from "./receivable-status-badge";
import type { ReceivableListItem } from "./receivable-list";

function fmtMoney(value: string, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value)) + " " + currency;
}

export function ReceivableCards({
  receivables,
  projectId,
}: {
  receivables: ReceivableListItem[];
  projectId: string;
}) {
  if (receivables.length === 0) {
    return (
      <ListEmptyState message="Sin cuentas por cobrar. Se crean automáticamente al emitir una factura." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {receivables.map((r) => (
        <Link
          key={r.id}
          href={`/proyectos/${projectId}/cuentas-por-cobrar/${r.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">Vence {formatDate(r.dueDate)}</span>
            <ReceivableStatusBadge status={r.status} />
          </div>
          <h3 className="mt-2 font-semibold leading-snug">{r.clientName}</h3>
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-medium">{fmtMoney(r.balanceDue, r.currency)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
