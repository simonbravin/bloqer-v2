import Link from "next/link";
import { formatDate } from "@/lib/format";
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
import { PurchaseReceiptStatusBadge } from "./purchase-receipt-status-badge";
import type { PurchaseReceiptListItem } from "./purchase-receipt-list";

export function PurchaseReceiptTable({
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
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Orden de compra</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Recibido por</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-sm">
                <Link
                  href={`/proyectos/${projectId}/recepciones/${r.id}`}
                  className="text-primary hover:underline"
                >
                  {r.purchaseOrderCode}
                </Link>
              </TableCell>
              <TableCell className={cn(tableNameCellClass, "font-medium")} title={r.supplierName}>
                {r.supplierName}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(r.receiptDate)}
              </TableCell>
              <TableCell
                className="max-w-[8rem] truncate text-sm text-muted-foreground"
                title={r.receivedByName ?? undefined}
              >
                {r.receivedByName ?? "—"}
              </TableCell>
              <TableCell>
                <PurchaseReceiptStatusBadge status={r.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
