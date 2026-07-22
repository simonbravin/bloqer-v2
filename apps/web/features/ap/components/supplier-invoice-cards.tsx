import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { SupplierInvoiceStatusBadge } from "./supplier-invoice-status-badge";
import { PayableStatusBadge } from "./payable-status-badge";
import type { SupplierInvoiceListItem } from "./supplier-invoice-list";

const PAYABLE_OPEN = new Set(["OPEN", "PARTIAL", "OVERDUE"]);

export function SupplierInvoiceCards({
  invoices,
  hrefPrefix,
  payableHrefPrefix,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
  payableHrefPrefix?: string;
}) {
  if (invoices.length === 0) {
    return (
      <ListEmptyState message="No hay facturas de proveedor registradas." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {invoices.map((inv) => {
        const canPay =
          Boolean(payableHrefPrefix) &&
          inv.payableId &&
          inv.payableStatus &&
          PAYABLE_OPEN.has(inv.payableStatus);
        return (
          <div
            key={inv.id}
            className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <Link href={`${hrefPrefix}/${inv.id}`} className="flex flex-col min-w-0">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{inv.code}</span>
                <SupplierInvoiceStatusBadge status={inv.status} />
              </div>
              <p className="mt-2 font-semibold">{inv.supplierName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Vence {formatDate(inv.dueDate)}
              </p>
              <p className="mt-3 text-lg font-semibold tabular-nums">
                {Number(inv.totalAmount).toLocaleString("es-AR", {
                  style: "currency",
                  currency: inv.currency,
                })}
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
