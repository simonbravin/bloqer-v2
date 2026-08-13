"use client";

import { addDecimal, serializeMoney } from "@bloqer/utils";
import type { AccountBalanceSummary } from "@bloqer/services";
import { KpiStatCard, type KpiStatTone } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

interface TreasurySummaryCardsProps {
  summaries: AccountBalanceSummary[];
}

function treasuryBalanceTone(raw: string): KpiStatTone {
  if (isZeroMoneyAmount(raw)) return "muted";
  return isPositiveMoneyAmount(raw) ? "success" : "danger";
}

export function TreasurySummaryCards({ summaries }: TreasurySummaryCardsProps) {
  const totalARS = serializeMoney(
    summaries
      .filter((s) => s.currency === "ARS" && s.status === "ACTIVE")
      .reduce((acc, s) => addDecimal(acc, s.balance), "0"),
  );

  return (
    <KpiStatGrid title={null} columns={3}>
      {summaries.map((s) => (
        <KpiStatCard
          key={s.accountId}
          iconKey="treasury_balance"
          label={s.name}
          value={formatMoneyAmount(s.balance)}
          subtitle={s.currency}
          tone={treasuryBalanceTone(s.balance)}
        />
      ))}

      {summaries.some((s) => s.currency === "ARS" && s.status === "ACTIVE") && (
        <KpiStatCard
          iconKey="treasury_balance"
          label="Total ARS (cuentas activas)"
          value={formatMoneyAmount(totalARS)}
          subtitle="ARS"
          variant="highlight"
          tone={treasuryBalanceTone(totalARS)}
        />
      )}
    </KpiStatGrid>
  );
}
