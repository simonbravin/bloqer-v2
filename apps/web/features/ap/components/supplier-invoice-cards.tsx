import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { SupplierInvoiceStatusBadge } from "./supplier-invoice-status-badge";
import type { SupplierInvoiceListItem } from "./supplier-invoice-list";

export function SupplierInvoiceCards({
  invoices,
  hrefPrefix,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
}) {
  if (invoices.length === 0) {
    return (
      <ListEmptyState message="No hay facturas de proveedor registradas." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {invoices.map((inv) => (
        <Link
          key={inv.id}
          href={`${hrefPrefix}/${inv.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
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
      ))}
    </div>
  );
}
