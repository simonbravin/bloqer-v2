import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { SalesInvoiceStatusBadge } from "./sales-invoice-status-badge";
import type { SalesInvoiceListItem } from "./sales-invoice-list";
import { formatMoneyAmount } from "@/lib/format-money";

export function SalesInvoiceCards({
  invoices,
  projectId,
}: {
  invoices: SalesInvoiceListItem[];
  projectId: string;
}) {
  if (invoices.length === 0) {
    return (
      <ListEmptyState message="Sin facturas. Cree la primera manualmente o desde una certificación aprobada." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {invoices.map((inv) => (
        <Link
          key={inv.id}
          href={`/proyectos/${projectId}/facturas/${inv.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{inv.code}</span>
            <SalesInvoiceStatusBadge status={inv.status} />
          </div>
          <h3 className="mt-2 font-semibold leading-snug">{inv.clientName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(inv.issueDate)} · vto. {formatDate(inv.dueDate)}
          </p>
          <p className="mt-3 text-lg font-semibold tabular-nums">
            {formatMoneyAmount(inv.totalAmount)} {inv.currency}
          </p>
        </Link>
      ))}
    </div>
  );
}
