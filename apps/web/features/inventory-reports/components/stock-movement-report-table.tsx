import { formatDate } from "@/lib/format";
import type { StockMovementReportRow } from "@bloqer/services";
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

const TYPE_LABELS: Record<string, string> = {
  IN: "Ingreso",
  OUT: "Egreso",
  TRANSFER_IN: "Transferencia entrada",
  TRANSFER_OUT: "Transferencia salida",
  ADJUSTMENT: "Ajuste",
};

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

function fmtQty(v: string, unit: string) {
  const n = parseFloat(v);
  return (n >= 0 ? "+" : "") + formatAmount(v) + (unit ? ` ${unit}` : "");
}

interface Props {
  rows: StockMovementReportRow[];
  showProduct?: boolean;
  showWarehouse?: boolean;
}

export function StockMovementReportTable({
  rows,
  showProduct = true,
  showWarehouse = true,
}: Props) {
  if (rows.length === 0) {
    return <ListEmptyState message="No hay movimientos para los filtros seleccionados." />;
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <TableScroll className="border-0 rounded-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              {showProduct && <TableHead>Producto</TableHead>}
              {showWarehouse && <TableHead>Depósito</TableHead>}
              <TableHead>Tipo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Proyecto / WBS</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Costo unit.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const signed = parseFloat(m.signedQuantity);
              const isAdj = m.type === "ADJUSTMENT";
              return (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(m.movementDate)}</TableCell>
                  {showProduct && (
                    <TableCell>
                      <span className="font-medium">{m.productName}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{m.productUnit}</span>
                    </TableCell>
                  )}
                  {showWarehouse && (
                    <TableCell className="text-muted-foreground">{m.warehouseName}</TableCell>
                  )}
                  <TableCell>
                    <span className={isAdj ? "text-yellow-600 dark:text-yellow-400 text-xs" : ""}>
                      {TYPE_LABELS[m.type] ?? m.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.sourceLabel}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.projectName ?? ""}
                    {m.projectName && m.wbsNodeName ? " · " : ""}
                    {m.wbsNodeName ?? ""}
                    {!m.projectName && !m.wbsNodeName ? "—" : ""}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-mono ${
                      isAdj
                        ? "text-yellow-600 dark:text-yellow-400"
                        : signed >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {isAdj ? `${formatAmount(m.quantity)}⚠` : fmtQty(m.signedQuantity, m.productUnit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground text-xs">
                    {m.unitCost ? formatAmount(m.unitCost) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableScroll>
    </div>
  );
}
