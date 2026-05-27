import { formatDate } from "@/lib/format";
import type { StockBalanceRow } from "@bloqer/services";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

function fmtQty(v: string, unit: string) {
  return formatAmount(v) + (unit ? ` ${unit}` : "");
}

interface Props {
  rows: StockBalanceRow[];
}

export function StockBalanceTable({ rows }: Props) {
  if (rows.length === 0) {
    return <ListEmptyState message="No hay stock para los filtros seleccionados." />;
  }

  return (
    <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Depósito</TableHead>
              <TableHead>Proyecto</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Último mov.</TableHead>
              <TableHead>Alertas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.productId}-${r.warehouseId}`}>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.productSku}</TableCell>
                <TableCell className="font-medium">{r.productName}</TableCell>
                <TableCell className="text-muted-foreground">{r.warehouseName}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{r.projectName ?? "—"}</TableCell>
                <TableCell
                  className={`text-right tabular-nums font-mono font-medium ${
                    r.flags.negativeStock
                      ? "text-red-600 dark:text-red-400"
                      : r.flags.zeroStock
                        ? "text-muted-foreground"
                        : ""
                  }`}
                >
                  {fmtQty(r.quantityOnHand, r.productUnit)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {r.lastMovementDate ? formatDate(r.lastMovementDate) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.flags.negativeStock && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        negativo
                      </span>
                    )}
                    {r.flags.zeroStock && !r.flags.negativeStock && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">
                        sin stock
                      </span>
                    )}
                    {r.flags.adjustmentPresent && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        ajuste
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </TableScroll>
  );
}
