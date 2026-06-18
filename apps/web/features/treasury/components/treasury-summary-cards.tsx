"use client";

import type { AccountBalanceSummary } from "@bloqer/services";
import { KpiStatCard, type KpiStatTone } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";

function fmtMoney(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

interface TreasurySummaryCardsProps {
  summaries: AccountBalanceSummary[];
}

function treasuryBalanceTone(raw: string): KpiStatTone {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n === 0) return "muted";
  return n > 0 ? "success" : "danger";
}

export function TreasurySummaryCards({ summaries }: TreasurySummaryCardsProps) {
  const totalARS = summaries
    .filter((s) => s.currency === "ARS" && s.status === "ACTIVE")
    .reduce((acc, s) => acc + parseFloat(s.balance), 0);

  return (
    <KpiStatGrid title={null} columns={3}>
      {summaries.map((s) => (
        <KpiStatCard
          key={s.accountId}
          iconKey="treasury_balance"
          label={s.name}
          value={fmtMoney(s.balance)}
          subtitle={s.currency}
          tone={treasuryBalanceTone(s.balance)}
        />
      ))}

      {summaries.some((s) => s.currency === "ARS" && s.status === "ACTIVE") && (
        <KpiStatCard
          iconKey="treasury_balance"
          label="Total ARS (cuentas activas)"
          value={fmtMoney(totalARS.toFixed(2))}
          subtitle="ARS"
          variant="highlight"
          tone={treasuryBalanceTone(String(totalARS))}
        />
      )}
    </KpiStatGrid>
  );
}
