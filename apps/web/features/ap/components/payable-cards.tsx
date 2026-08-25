import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { ObligationSettledCell } from "@/features/finance/components/obligation-settled-cell";
import { PayableStatusBadge } from "./payable-status-badge";
import type { PayableListItem } from "./payable-list";

export function PayableCards({
  payables,
  hrefPrefix,
  supplierInvoiceHrefPrefix,
}: {
  payables: PayableListItem[];
  hrefPrefix: string;
  supplierInvoiceHrefPrefix?: string;
}) {
  if (payables.length === 0) {
    return (
      <ListEmptyState
        title="Sin cuentas por pagar"
        description="Se generan al emitir una factura de proveedor. También podés ver el circuito completo en Ayuda."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {supplierInvoiceHrefPrefix ? (
              <Button asChild size="sm" variant="outline">
                <Link href={supplierInvoiceHrefPrefix}>Ver facturas proveedor</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/ayuda/pagar-una-cuenta-por-pagar">Cómo se paga una CxP</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {payables.map((p) => (
        <Link
          key={p.id}
          href={`${hrefPrefix}/${p.id}`}
          className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Vence {formatDate(p.dueDate)}</span>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <PayableStatusBadge status={p.status} />
              <span className="text-xs text-muted-foreground">
                Pagada: <ObligationSettledCell status={p.status} balanceDue={p.balanceDue} />
              </span>
            </div>
          </div>
          <h3 className="mt-2 truncate font-semibold leading-snug" title={p.supplierName}>
            {p.supplierName}
          </h3>
          {p.supplierInvoiceCode && p.supplierInvoiceId && supplierInvoiceHrefPrefix ? (
            <p className="mt-1 text-xs text-muted-foreground">{p.supplierInvoiceCode}</p>
          ) : null}
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-medium">
              {formatMoneyAmount(p.balanceDue, p.currency)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
