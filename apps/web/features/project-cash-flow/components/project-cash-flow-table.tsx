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
import { formatMoneyAmount, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

function colorClass(v: string) {
  if (isZeroMoneyAmount(v)) return "text-muted-foreground";
  if (isPositiveMoneyAmount(v)) return "text-emerald-600 dark:text-emerald-400";
  return "text-red-600 dark:text-red-400";
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
    <TableScroll>
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
                  {formatMoneyAmount(p.inflows)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                  {formatMoneyAmount(p.outflows)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-mono font-medium ${colorClass(p.netCashFlow)}`}
                >
                  {formatMoneyAmount(p.netCashFlow)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-mono ${colorClass(p.cumulativeNetCashFlow)}`}
                >
                  {formatMoneyAmount(p.cumulativeNetCashFlow)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="px-4 py-2 text-xs text-muted-foreground border-t">
          El acumulado corresponde al rango filtrado.
        </p>
    </TableScroll>
  );
}
