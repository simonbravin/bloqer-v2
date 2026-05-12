"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountBalanceSummary } from "@bloqer/services";

function fmtMoney(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

interface TreasurySummaryCardsProps {
  summaries: AccountBalanceSummary[];
}

export function TreasurySummaryCards({ summaries }: TreasurySummaryCardsProps) {
  const totalARS = summaries
    .filter((s) => s.currency === "ARS" && s.status === "ACTIVE")
    .reduce((acc, s) => acc + parseFloat(s.balance), 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {summaries.map((s) => (
        <Card key={s.accountId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {s.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              {fmtMoney(s.balance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{s.currency}</p>
          </CardContent>
        </Card>
      ))}

      {summaries.some((s) => s.currency === "ARS" && s.status === "ACTIVE") && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total ARS (cuentas activas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              {fmtMoney(totalARS.toFixed(2))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">ARS</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
