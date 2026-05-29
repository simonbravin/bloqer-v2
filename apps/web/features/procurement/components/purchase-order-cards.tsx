import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { PurchaseOrderStatusBadge } from "./purchase-order-status-badge";
import { PurchaseOrderReceiptBadge } from "./purchase-order-receipt-badge";
import type { PurchaseOrderListItem } from "./purchase-order-list";

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
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{order.code}</span>
            <PurchaseOrderStatusBadge status={order.status} />
          </div>
          <p className="mt-2 font-semibold">{order.supplierName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Recepción</span>
            <PurchaseOrderReceiptBadge status={order.status} />
          </div>
          {order.expectedDeliveryDate ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Entrega prevista {formatDate(order.expectedDeliveryDate)}
            </p>
          ) : null}
          <p className="mt-3 text-lg font-semibold tabular-nums">
            {Number(order.totalAmount).toLocaleString("es-AR", {
              style: "currency",
              currency: order.currency,
            })}
          </p>
        </Link>
      ))}
    </div>
  );
}
