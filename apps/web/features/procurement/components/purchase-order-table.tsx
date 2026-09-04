"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableNameCellClass,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useClientTableSort } from "@/hooks/use-client-table-sort";
import { PurchaseOrderStatusBadge } from "./purchase-order-status-badge";
import { PurchaseOrderReceiptBadge } from "./purchase-order-receipt-badge";
import { Badge } from "@/components/ui/badge";
import type { PurchaseOrderListItem } from "./purchase-order-list";
import { purchaseOrderDeliveryOverdueDays } from "../lib/purchase-delivery-overdue";

export function PurchaseOrderTable({
  orders,
  projectId,
}: {
  orders: PurchaseOrderListItem[];
  projectId: string;
}) {
  const accessors = useMemo(
    () => ({
      code: (o: PurchaseOrderListItem) => o.code,
      amount: (o: PurchaseOrderListItem) => {
        const n = Number(o.totalAmount);
        return Number.isFinite(n) ? n : null;
      },
    }),
    [],
  );

  const { sorted, sortKey, sortDir, toggleSort } = useClientTableSort(
    orders,
    accessors,
    "code",
  );

  if (orders.length === 0) {
    return <ListEmptyState message="No hay órdenes de compra registradas." />;
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              label="Código"
              sortKey="code"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <TableHead>Proveedor</TableHead>
            <TableHead>Emisión</TableHead>
            <TableHead>Entrega prevista</TableHead>
            <TableHead>Recepción</TableHead>
            <SortableTableHead
              align="right"
              label="Total"
              sortKey="amount"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <TableHead>Aprobado por</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-sm">
                <Link
                  href={`/proyectos/${projectId}/ordenes-compra/${order.id}`}
                  className="text-primary hover:underline"
                >
                  {order.code}
                </Link>
              </TableCell>
              <TableCell className={cn(tableNameCellClass, "font-medium")} title={order.supplierName}>
                {order.supplierName}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(order.issueDate)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {order.expectedDeliveryDate ? (
                  (() => {
                    const overdue = purchaseOrderDeliveryOverdueDays(
                      order.status,
                      order.expectedDeliveryDate,
                    );
                    return (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span>{formatDate(order.expectedDeliveryDate)}</span>
                        {overdue > 0 ? (
                          <Badge variant="destructive" className="whitespace-nowrap">
                            Vencida {overdue} d
                          </Badge>
                        ) : null}
                      </span>
                    );
                  })()
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <PurchaseOrderReceiptBadge status={order.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatMoneyAmount(order.totalAmount, order.currency)}
              </TableCell>
              <TableCell
                className="max-w-[8rem] truncate text-sm text-muted-foreground"
                title={order.approvedByName ?? undefined}
              >
                {order.approvedByName ?? "—"}
              </TableCell>
              <TableCell>
                <PurchaseOrderStatusBadge status={order.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
