import Link from "next/link";
import type { DashboardFinanceSummary } from "@bloqer/services";
import { formatDashboardMoney } from "@bloqer/services/dashboard-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  // Only render when treasury movements were loaded for this viewer.
  // AR/AP-only financeSummary is covered by KPI cards elsewhere on the dashboard.
  if (finance.recentMovements === undefined) return null;

  const movements = finance.recentMovements;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Link href="/tesoreria/movimientos" className="hover:underline">
            Movimientos recientes
          </Link>
        </CardTitle>
      </CardHeader>
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
    </Card>
  );
}
