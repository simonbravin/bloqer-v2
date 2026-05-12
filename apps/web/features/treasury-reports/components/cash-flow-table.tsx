import type { CashFlowCurrency } from "@bloqer/services";

function fmt(value: string) {
  const n = parseFloat(value);
  if (n === 0) return "—";
  return (n >= 0 ? "" : "") + n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function fmtNet(value: string) {
  const n = parseFloat(value);
  const formatted = n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
  return n >= 0 ? `+${formatted}` : formatted;
}

interface Props {
  data: CashFlowCurrency;
}

export function CashFlowTable({ data }: Props) {
  const { currency, openingBalance, closingBalance, buckets } = data;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {currency}
        </span>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>
            Saldo inicial:{" "}
            <span className="font-mono font-medium text-foreground">
              {parseFloat(openingBalance).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </span>
          <span>
            Saldo final:{" "}
            <span className="font-mono font-medium text-foreground">
              {parseFloat(closingBalance).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </span>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Período</th>
              <th className="px-4 py-2.5 text-right font-medium">Ingresos</th>
              <th className="px-4 py-2.5 text-right font-medium">Egresos</th>
              <th className="px-4 py-2.5 text-right font-medium">Neto operativo</th>
              <th className="px-4 py-2.5 text-right font-medium">Transf. entrada</th>
              <th className="px-4 py-2.5 text-right font-medium">Transf. salida</th>
              <th className="px-4 py-2.5 text-right font-medium">Ajustes</th>
              <th className="px-4 py-2.5 text-right font-medium">Neto total</th>
            </tr>
          </thead>
          <tbody>
            {buckets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  Sin movimientos en el período.
                </td>
              </tr>
            ) : (
              buckets.map((b) => {
                const netOp  = parseFloat(b.netOperatingCashFlow);
                const netAll = parseFloat(b.netCashFlow);
                return (
                  <tr key={b.period} className="border-t">
                    <td className="px-4 py-2.5 font-mono text-xs">{b.period}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                      {fmt(b.inflow)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                      {fmt(b.outflow)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-mono font-medium ${netOp >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmtNet(b.netOperatingCashFlow)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">
                      {fmt(b.internalTransferIn)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">
                      {fmt(b.internalTransferOut)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">
                      {fmt(b.adjustments)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-mono font-medium ${netAll >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmtNet(b.netCashFlow)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
