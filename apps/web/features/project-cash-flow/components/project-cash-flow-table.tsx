import type { ProjectCashFlowPeriod } from "@bloqer/services";

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function colorClass(v: string) {
  const n = parseFloat(v);
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

interface Props {
  periods:  ProjectCashFlowPeriod[];
  currency: string;
}

export function ProjectCashFlowTable({ periods, currency }: Props) {
  if (periods.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin movimientos en el período seleccionado.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Período</th>
            <th className="px-4 py-2.5 text-right font-medium">Ingresos ({currency})</th>
            <th className="px-4 py-2.5 text-right font-medium">Egresos ({currency})</th>
            <th className="px-4 py-2.5 text-right font-medium">Neto</th>
            <th className="px-4 py-2.5 text-right font-medium">Acum.</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.periodKey} className="border-t">
              <td className="px-4 py-2.5 font-medium">{p.periodLabel}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                {fmt(p.inflows)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                {fmt(p.outflows)}
              </td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-mono font-medium ${colorClass(p.netCashFlow)}`}>
                {fmt(p.netCashFlow)}
              </td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${colorClass(p.cumulativeNetCashFlow)}`}>
                {fmt(p.cumulativeNetCashFlow)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-muted-foreground border-t">
        El acumulado corresponde al rango filtrado.
      </p>
    </div>
  );
}
