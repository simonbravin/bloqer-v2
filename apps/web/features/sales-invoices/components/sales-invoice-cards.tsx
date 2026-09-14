import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { SalesInvoiceStatusBadge } from "./sales-invoice-status-badge";
import type { SalesInvoiceListItem } from "./sales-invoice-list";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatInvoiceLetterBadge } from "@bloqer/domain";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { FiscalDocumentKindBadge } from "@/features/finance/components/fiscal-document-kind-badge";

export function SalesInvoiceCards({
  invoices,
  projectId,
  emptyTitle,
  emptyDescription,
  emptyMessage = "Sin facturas. Cree la primera manualmente o desde una certificación aprobada.",
}: {
  invoices: SalesInvoiceListItem[];
  projectId: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyMessage?: string;
}) {
  if (invoices.length === 0) {
    return (
      <ListEmptyState
        title={emptyTitle}
        description={emptyDescription}
        message={emptyTitle ? undefined : emptyMessage}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {invoices.map((inv) => {
        const letter = formatInvoiceLetterBadge(inv.invoiceLetter);
        return (
          <Link
            key={inv.id}
            href={`/proyectos/${projectId}/facturas/${inv.id}`}
            className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {inv.code}
                {letter ? ` · ${letter}` : ""}
              </span>
              <span className="shrink-0">
                <SalesInvoiceStatusBadge status={inv.status} />
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <FiscalDocumentKindBadge documentKind={inv.documentKind} />
              {inv.classLabel ? (
                <DocumentClassBadge
                  classLabel={inv.classLabel}
                  classFamily={inv.classFamily}
                />
              ) : null}
            </div>
            <h3 className="mt-2 truncate font-semibold leading-snug" title={inv.clientName}>
              {inv.clientName}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(inv.issueDate)} · vto. {formatDate(inv.dueDate)}
            </p>
            <p className="mt-3 text-lg font-semibold tabular-nums">
              {formatMoneyAmount(inv.totalAmount)} {inv.currency}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
