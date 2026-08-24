import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { PurchaseReceiptStatusBadge } from "./purchase-receipt-status-badge";
import type { PurchaseReceiptListItem } from "./purchase-receipt-list";

export function PurchaseReceiptCards({
  receipts,
  projectId,
}: {
  receipts: PurchaseReceiptListItem[];
  projectId: string;
}) {
  if (receipts.length === 0) {
    return <ListEmptyState message="No hay recepciones registradas." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {receipts.map((r) => (
        <Link
          key={r.id}
          href={`/proyectos/${projectId}/recepciones/${r.id}`}
          className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              OC {r.purchaseOrderCode}
            </span>
            <span className="shrink-0">
              <PurchaseReceiptStatusBadge status={r.status} />
            </span>
          </div>
          <p className="mt-2 truncate font-semibold" title={r.supplierName}>
            {r.supplierName}
          </p>
          {r.lineCount != null ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {r.lineCount === 1 ? "1 línea" : `${r.lineCount} líneas`}
              {r.quantitySummary ? ` · ${r.quantitySummary}` : ""}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            {formatDate(r.receiptDate)}
          </p>
          {r.receivedByName ? (
            <p className="mt-1 truncate text-sm text-muted-foreground" title={r.receivedByName}>
              Recibido por {r.receivedByName}
            </p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
