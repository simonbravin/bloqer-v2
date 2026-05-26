import { formatDate, formatDateTime } from "@/lib/format";
import type { StockBalanceRow } from "@bloqer/services";

function fmt(v: string, unit: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 }) + (unit ? ` ${unit}` : "");
}

function fmtDate(d: string) {
  return formatDate(d );
}

interface Props {
  rows: StockBalanceRow[];
}

export function StockBalanceTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        No hay stock para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">SKU</th>
            <th className="px-4 py-2.5 text-left font-medium">Producto</th>
            <th className="px-4 py-2.5 text-left font-medium">Depósito</th>
            <th className="px-4 py-2.5 text-left font-medium">Proyecto</th>
            <th className="px-4 py-2.5 text-right font-medium">Stock</th>
            <th className="px-4 py-2.5 text-left font-medium">Último mov.</th>
            <th className="px-4 py-2.5 text-left font-medium">Alertas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            return (
              <tr key={`${r.productId}-${r.warehouseId}`} className="border-t">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{r.productSku}</td>
                <td className="px-4 py-2.5 font-medium">{r.productName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.warehouseName}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.projectName ?? "—"}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-mono font-medium ${
                  r.flags.negativeStock
                    ? "text-red-600 dark:text-red-400"
                    : r.flags.zeroStock
                    ? "text-muted-foreground"
                    : ""
                }`}>
                  {fmt(r.quantityOnHand, r.productUnit)}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                  {r.lastMovementDate ? fmtDate(r.lastMovementDate) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 flex-wrap">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
