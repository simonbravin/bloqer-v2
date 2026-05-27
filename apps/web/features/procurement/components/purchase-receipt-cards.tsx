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
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              OC {r.purchaseOrderCode}
            </span>
            <PurchaseReceiptStatusBadge status={r.status} />
          </div>
          <p className="mt-2 font-semibold">{r.supplierName}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {formatDate(r.receiptDate)}
          </p>
        </Link>
      ))}
    </div>
  );
}
