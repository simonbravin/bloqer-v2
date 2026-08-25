import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { Button } from "@/components/ui/button";
import { SupplierInvoiceStatusBadge } from "./supplier-invoice-status-badge";
import { PayableStatusBadge } from "./payable-status-badge";
import type { SupplierInvoiceListItem } from "./supplier-invoice-list";
import { formatInvoiceLetterBadge } from "@bloqer/domain";
import { formatMoneyAmount } from "@/lib/format-money";

const PAYABLE_OPEN = new Set(["OPEN", "PARTIAL", "OVERDUE"]);

export function SupplierInvoiceCards({
  invoices,
  hrefPrefix,
  payableHrefPrefix,
  canRegisterPayment = false,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
  payableHrefPrefix?: string;
  /** [D-069] Only show /pagar deep-link when the viewer may register AP payments. */
  canRegisterPayment?: boolean;
}) {
  if (invoices.length === 0) {
    return (
      <ListEmptyState
        title="No hay facturas de proveedor"
        description="Registrá un gasto o factura (con o sin OC). Para sueldos y reintegros, el payee es un Empleado del Directorio."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/ayuda/gasto-corporativo">Cómo cargar un gasto</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/ayuda/pagar-un-sueldo">Cómo pagar un sueldo</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {invoices.map((inv) => {
        const canPay =
          Boolean(canRegisterPayment) &&
          Boolean(payableHrefPrefix) &&
          inv.payableId &&
          inv.payableStatus &&
          PAYABLE_OPEN.has(inv.payableStatus);
        const letter = formatInvoiceLetterBadge(inv.invoiceLetter);
        return (
          <div
            key={inv.id}
            className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <Link href={`${hrefPrefix}/${inv.id}`} className="flex min-w-0 flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {inv.code}
                  {letter ? ` · ${letter}` : ""}
                </span>
                <span className="shrink-0">
                  <SupplierInvoiceStatusBadge status={inv.status} />
                </span>
              </div>
              <p className="mt-2 truncate font-semibold" title={inv.supplierName}>
                {inv.supplierName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Vence {formatDate(inv.dueDate)}
              </p>
              <p className="mt-3 text-lg font-semibold tabular-nums">
                {formatMoneyAmount(inv.totalAmount, inv.currency)}
              </p>
            </Link>
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Pago</span>
              {inv.payableId && inv.payableStatus ? (
                canPay ? (
                  <Link
                    href={`${payableHrefPrefix}/${inv.payableId}/pagar`}
                    className="hover:opacity-90"
                    title="Registrar pago (total o parcial)"
                  >
                    <PayableStatusBadge status={inv.payableStatus} />
                  </Link>
                ) : (
                  <PayableStatusBadge status={inv.payableStatus} />
                )
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
