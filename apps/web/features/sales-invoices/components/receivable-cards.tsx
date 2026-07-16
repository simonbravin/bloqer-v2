import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { ObligationSettledCell } from "@/features/finance/components/obligation-settled-cell";
import { ReceivableStatusBadge } from "./receivable-status-badge";
import type { ReceivableListItem } from "./receivable-list";

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
}

type Props = {
  receivables: ReceivableListItem[];
  showProjectColumn?: boolean;
  invoicesHref?: string;
  invoicesActionLabel?: string;
};

export function ReceivableCards({
  receivables,
  showProjectColumn = false,
  invoicesHref,
  invoicesActionLabel = "Ir a facturas",
}: Props) {
  if (receivables.length === 0) {
    return (
      <ListEmptyState
        title="Sin cuentas por cobrar"
        description="Se crean automáticamente al emitir una factura de venta."
        action={
          invoicesHref ? (
            <Button asChild size="sm" variant="outline">
              <Link href={invoicesHref}>{invoicesActionLabel}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {receivables.map((r) => (
        <Link
          key={r.id}
          href={`/proyectos/${r.projectId}/cuentas-por-cobrar/${r.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">Vence {formatDate(r.dueDate)}</span>
            <div className="flex flex-col items-end gap-1">
              <ReceivableStatusBadge status={r.status} />
              <span className="text-xs text-muted-foreground">
                Cobrada: <ObligationSettledCell status={r.status} balanceDue={r.balanceDue} />
              </span>
            </div>
          </div>
          <h3 className="mt-2 font-semibold leading-snug">{r.clientName}</h3>
          {showProjectColumn && r.projectName ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {r.projectCode ? `${r.projectCode} · ` : ""}
              {r.projectName}
            </p>
          ) : null}
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-medium">{fmtMoney(r.balanceDue, r.currency)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
