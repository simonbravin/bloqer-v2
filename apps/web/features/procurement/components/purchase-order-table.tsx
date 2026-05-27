import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { PurchaseOrderStatusBadge } from "./purchase-order-status-badge";
import type { PurchaseOrderListItem } from "./purchase-order-list";

export function PurchaseOrderTable({
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
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Emisión</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-sm">
                <Link
                  href={`/proyectos/${projectId}/ordenes-compra/${order.id}`}
                  className="text-primary hover:underline"
                >
                  {order.code}
                </Link>
              </TableCell>
              <TableCell className="font-medium">{order.supplierName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(order.issueDate)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {Number(order.totalAmount).toLocaleString("es-AR", {
                  style: "currency",
                  currency: order.currency,
                })}
              </TableCell>
              <TableCell>
                <PurchaseOrderStatusBadge status={order.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
