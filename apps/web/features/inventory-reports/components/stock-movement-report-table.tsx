import { formatDate, formatDateTime } from "@/lib/format";
import type { StockMovementReportRow } from "@bloqer/services";

const TYPE_LABELS: Record<string, string> = {
  IN:           "Ingreso",
  OUT:          "Egreso",
  TRANSFER_IN:  "Transferencia entrada",
  TRANSFER_OUT: "Transferencia salida",
  ADJUSTMENT:   "Ajuste",
};

function fmtDate(d: string) {
  return formatDate(d );
}

function fmtQty(v: string, unit: string) {
  const n = parseFloat(v);
  return (n >= 0 ? "+" : "") + n.toLocaleString("es-AR", { minimumFractionDigits: 2 }) + (unit ? ` ${unit}` : "");
}

interface Props {
  rows: StockMovementReportRow[];
  showProduct?:   boolean;
  showWarehouse?: boolean;
}

export function StockMovementReportTable({ rows, showProduct = true, showWarehouse = true }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        No hay movimientos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
            {showProduct   && <th className="px-4 py-2.5 text-left font-medium">Producto</th>}
            {showWarehouse && <th className="px-4 py-2.5 text-left font-medium">Depósito</th>}
            <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
            <th className="px-4 py-2.5 text-left font-medium">Origen</th>
            <th className="px-4 py-2.5 text-left font-medium">Proyecto / WBS</th>
            <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
            <th className="px-4 py-2.5 text-right font-medium">Costo unit.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const signed = parseFloat(m.signedQuantity);
            const isAdj  = m.type === "ADJUSTMENT";
            return (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(m.movementDate)}</td>
                {showProduct && (
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{m.productName}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{m.productUnit}</span>
                  </td>
                )}
                {showWarehouse && (
                  <td className="px-4 py-2.5 text-muted-foreground">{m.warehouseName}</td>
                )}
                <td className="px-4 py-2.5">
                  <span className={isAdj ? "text-yellow-600 dark:text-yellow-400 text-xs" : ""}>
                    {TYPE_LABELS[m.type] ?? m.type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.sourceLabel}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {m.projectName ?? ""}
                  {m.projectName && m.wbsNodeName ? " · " : ""}
                  {m.wbsNodeName ?? ""}
                  {!m.projectName && !m.wbsNodeName ? "—" : ""}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${
                  isAdj
                    ? "text-yellow-600 dark:text-yellow-400"
                    : signed >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}>
                  {isAdj
                    ? parseFloat(m.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 }) + "⚠"
                    : fmtQty(m.signedQuantity, m.productUnit)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground text-xs">
                  {m.unitCost
                    ? parseFloat(m.unitCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
