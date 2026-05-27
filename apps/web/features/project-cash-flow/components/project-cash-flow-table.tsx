import type { ProjectCashFlowPeriod } from "@bloqer/services";
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
import { formatCurrencyDisplay } from "@/lib/format";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

function colorClass(v: string) {
  const n = parseFloat(v);
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

interface Props {
  periods: ProjectCashFlowPeriod[];
  currency: string;
}

export function ProjectCashFlowTable({ periods, currency }: Props) {
  if (periods.length === 0) {
    return <ListEmptyState message="Sin movimientos en el período seleccionado." />;
  }

  const currencyLabel = formatCurrencyDisplay(currency);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <TableScroll className="border-0 rounded-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Ingresos ({currencyLabel})</TableHead>
              <TableHead className="text-right">Egresos ({currencyLabel})</TableHead>
              <TableHead className="text-right">Neto</TableHead>
              <TableHead className="text-right">Acum.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((p) => (
              <TableRow key={p.periodKey}>
                <TableCell className="font-medium">{p.periodLabel}</TableCell>
                <TableCell className="text-right tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                  {formatAmount(p.inflows)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                  {formatAmount(p.outflows)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-mono font-medium ${colorClass(p.netCashFlow)}`}
                >
                  {formatAmount(p.netCashFlow)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-mono ${colorClass(p.cumulativeNetCashFlow)}`}
                >
                  {formatAmount(p.cumulativeNetCashFlow)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
      <p className="px-4 py-2 text-xs text-muted-foreground border-t">
        El acumulado corresponde al rango filtrado.
      </p>
    </div>
  );
}
