import Link from "next/link";
import type { DashboardFinanceSummary } from "@bloqer/services";
import { formatDashboardMoney } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

/** Align with treasury balance signs: only INFLOW / TRANSFER_IN are positive. */
function isTreasuryOutflowType(type: string): boolean {
  return type !== "INFLOW" && type !== "TRANSFER_IN";
}

function movementSignedAmount(type: string, amount: string, currency: string): string {
  const formatted = formatDashboardMoney(amount, currency);
  if (isTreasuryOutflowType(type)) return `− ${formatted}`;
  return `+ ${formatted}`;
}

export function DashboardFinanceOverview({ finance }: { finance: DashboardFinanceSummary }) {
  const hasAr =
    finance.receivablesTotal != null ||
    finance.receivablesMulticurrency ||
    (finance.overdueReceivablesCount ?? 0) > 0 ||
    (finance.receivablesDueSoonCount ?? 0) > 0 ||
    (finance.receivablesOpenByCurrency?.length ?? 0) > 0;
  const hasAp =
    finance.payablesTotal != null ||
    finance.payablesMulticurrency ||
    (finance.overduePayablesCount ?? 0) > 0 ||
    (finance.payablesDueSoonCount ?? 0) > 0 ||
    (finance.payablesOpenByCurrency?.length ?? 0) > 0;
  const hasTr =
    finance.recentMovements !== undefined ||
    Boolean(finance.cashByCurrency && Object.keys(finance.cashByCurrency).length > 0);

  const movements = finance.recentMovements ?? [];
  const showFooter = hasAr || hasAp || hasTr;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Finanzas y tesorería</CardTitle>
      </CardHeader>
      {finance.recentMovements !== undefined ? (
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos recientes.</p>
          ) : (
            <ul className="divide-y">
              {movements.map((m) => (
                <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={m.href} className="group flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:underline">
                        {m.description || m.accountName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(m.movementDate)}
                        {m.description ? ` · ${m.accountName}` : null}
                      </p>
                    </div>
                    <span
                      className={
                        isTreasuryOutflowType(m.type)
                          ? "shrink-0 tabular-nums text-sm text-muted-foreground"
                          : "shrink-0 tabular-nums text-sm font-medium"
                      }
                    >
                      {movementSignedAmount(m.type, m.amount, m.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      ) : null}
      {showFooter ? (
        <CardFooter className="flex flex-wrap gap-2">
          {(hasAr || hasAp) && (
            <Button asChild variant="outline" size="sm">
              <Link href="/finanzas">Ver finanzas</Link>
            </Button>
          )}
          {hasTr && (
            <Button asChild variant="outline" size="sm">
              <Link href="/tesoreria">Ver tesorería</Link>
            </Button>
          )}
        </CardFooter>
      ) : null}
    </Card>
  );
}
