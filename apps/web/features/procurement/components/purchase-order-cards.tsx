import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { PurchaseOrderStatusBadge } from "./purchase-order-status-badge";
import { PurchaseOrderReceiptBadge } from "./purchase-order-receipt-badge";
import { Badge } from "@/components/ui/badge";
import type { PurchaseOrderListItem } from "./purchase-order-list";
import { purchaseOrderDeliveryOverdueDays } from "../lib/purchase-delivery-overdue";

export function PurchaseOrderCards({
  orders,
  projectId,
}: {
  orders: PurchaseOrderListItem[];
  projectId: string;
}) {
  if (orders.length === 0) {
    return <ListEmptyState message="No hay órdenes de compra registradas." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/proyectos/${projectId}/ordenes-compra/${order.id}`}
          className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{order.code}</span>
            <span className="shrink-0">
              <PurchaseOrderStatusBadge status={order.status} />
            </span>
          </div>
          <p className="mt-2 truncate font-semibold" title={order.supplierName}>
            {order.supplierName}
          </p>
          {order.approvedByName ? (
            <p className="mt-1 truncate text-sm text-muted-foreground" title={order.approvedByName}>
              Aprobado por {order.approvedByName}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Recepción</span>
            <PurchaseOrderReceiptBadge status={order.status} />
          </div>
          {order.expectedDeliveryDate ? (
            (() => {
              const overdue = purchaseOrderDeliveryOverdueDays(
                order.status,
                order.expectedDeliveryDate,
              );
              return (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Entrega prevista {formatDate(order.expectedDeliveryDate)}</span>
                  {overdue > 0 ? (
                    <Badge variant="destructive" className="whitespace-nowrap">
                      Vencida {overdue} d
                    </Badge>
                  ) : null}
                </p>
              );
            })()
          ) : null}
          <p className="mt-3 text-lg font-semibold tabular-nums">
            {formatMoneyAmount(order.totalAmount, order.currency)}
          </p>
        </Link>
      ))}
    </div>
  );
}
