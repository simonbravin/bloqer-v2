import type { AgingReport } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";

interface Props {
  report: AgingReport;
  currency?: string;
}

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

export function AgingSummaryCards({ report, currency }: Props) {
  const totals = currency && report.byCurrency[currency]
    ? report.byCurrency[currency]
    : report.totals;

  const cards = [
    { label: "Al día",        value: fmt(totals.current),       borderClass: "border-emerald-500/40" },
    { label: "1–30 días",     value: fmt(totals.bucket1_30),    borderClass: "border-amber-500/40" },
    { label: "31–60 días",    value: fmt(totals.bucket31_60),   borderClass: "border-orange-500/40" },
    { label: "61–90 días",    value: fmt(totals.bucket61_90),   borderClass: "border-destructive/40" },
    { label: "+90 días",      value: fmt(totals.bucket90Plus),  borderClass: "border-destructive/60" },
    { label: "Total vencido", value: fmt(totals.totalOverdue),  borderClass: "border-muted" },
    { label: "Saldo total",   value: fmt(totals.totalBalance),  borderClass: "border-muted" },
  ];

  return (
    <KpiStatGrid title={null} columns={7}>
      {cards.map(({ label, value, borderClass }) => (
        <KpiStatCard
          key={label}
          label={label}
          value={value}
          className={`border-2 ${borderClass}`}
        />
      ))}
    </KpiStatGrid>
  );
}
