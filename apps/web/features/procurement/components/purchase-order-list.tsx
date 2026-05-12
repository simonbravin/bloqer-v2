"use client";

import Link from "next/link";
import { PurchaseOrderStatusBadge } from "./purchase-order-status-badge";

export type PurchaseOrderListItem = {
  id: string;
  code: string;
  supplierName: string;
  issueDate: Date;
  expectedDeliveryDate: Date | null;
  totalAmount: string;
  currency: string;
  status: string;
};

interface Props {
  orders: PurchaseOrderListItem[];
  projectId: string;
}

export function PurchaseOrderList({ orders, projectId }: Props) {
  if (orders.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay órdenes de compra registradas.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {orders.map((order) => (
        <div key={order.id} className="flex items-center justify-between px-2 py-3 hover:bg-muted/40">
          <div className="flex flex-col gap-0.5">
            <Link
              href={`/proyectos/${projectId}/ordenes-compra/${order.id}`}
              className="text-sm font-medium hover:underline"
            >
              {order.code}
            </Link>
            <span className="text-xs text-muted-foreground">{order.supplierName}</span>
          </div>
          <div className="flex items-center gap-4">
            {order.expectedDeliveryDate && (
              <span className="text-sm text-muted-foreground hidden sm:block">
                Entrega {new Date(order.expectedDeliveryDate).toLocaleDateString("es-AR")}
              </span>
            )}
            <span className="text-sm font-medium tabular-nums">
              {Number(order.totalAmount).toLocaleString("es-AR", { style: "currency", currency: order.currency })}
            </span>
            <PurchaseOrderStatusBadge status={order.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
