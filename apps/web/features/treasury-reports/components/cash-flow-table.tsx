import type { CashFlowCurrency } from "@bloqer/services";
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

function formatAmount(value: string) {
  if (isZeroMoneyAmount(value)) return "—";
  return formatMoneyAmount(value);
}

function fmtNet(value: string) {
  const formatted = formatMoneyAmount(value);
  if (isZeroMoneyAmount(value) || formatted.startsWith("-") || formatted.startsWith("+")) {
    return formatted;
  }
  return `+${formatted}`;
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
          {formatCurrencyDisplay(currency)}
        </span>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>
            Saldo inicial:{" "}
            <span className="font-mono font-medium text-foreground">
              {formatAmount(openingBalance)}
            </span>
          </span>
          <span>
            Saldo final:{" "}
            <span className="font-mono font-medium text-foreground">
              {formatAmount(closingBalance)}
            </span>
          </span>
        </div>
      </div>

      {buckets.length === 0 ? (
        <ListEmptyState message="Sin movimientos en el período." />
      ) : (
        <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Egresos</TableHead>
                  <TableHead className="text-right">Neto operativo</TableHead>
                  <TableHead className="text-right">Transf. entrada</TableHead>
                  <TableHead className="text-right">Transf. salida</TableHead>
                  <TableHead className="text-right">Ajustes</TableHead>
                  <TableHead className="text-right">Neto total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets.map((b) => {
                  const netOpPositive = isPositiveMoneyAmount(b.netOperatingCashFlow);
                  const netOpZero = isZeroMoneyAmount(b.netOperatingCashFlow);
                  const netAllPositive = isPositiveMoneyAmount(b.netCashFlow);
                  const netAllZero = isZeroMoneyAmount(b.netCashFlow);
                  return (
                    <TableRow key={b.period}>
                      <TableCell className="font-mono text-xs">{b.period}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                        {formatAmount(b.inflow)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                        {formatAmount(b.outflow)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-mono font-medium ${
                          netOpZero
                            ? "text-muted-foreground"
                            : netOpPositive
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {fmtNet(b.netOperatingCashFlow)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                        {formatAmount(b.internalTransferIn)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                        {formatAmount(b.internalTransferOut)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                        {formatAmount(b.adjustments)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-mono font-medium ${
                          netAllZero
                            ? "text-muted-foreground"
                            : netAllPositive
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {fmtNet(b.netCashFlow)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </TableScroll>
      )}
    </div>
  );
}
