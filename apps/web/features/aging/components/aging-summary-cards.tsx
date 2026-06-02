import type { AgingReport, AgingTotals } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { formatDecimalAr } from "@/lib/format-money";
import { cn } from "@/lib/utils";

interface Props {
  report: AgingReport;
  currency?: string;
}

const EMPTY_TOTALS: AgingTotals = {
  current: "0",
  bucket1_30: "0",
  bucket31_60: "0",
  bucket61_90: "0",
  bucket90Plus: "0",
  totalOverdue: "0",
  totalBalance: "0",
};

function fmt(v: string) {
  const n = Number(v);
  return formatDecimalAr(Number.isFinite(n) ? n : 0);
}

function resolveTotals(report: AgingReport, currency?: string): AgingTotals {
  if (currency) {
    return report.byCurrency[currency] ?? EMPTY_TOTALS;
  }
  return report.totals;
}

type AgingCard = {
  label: string;
  value: string;
  borderClass: string;
};

function AgingCardRow({ cards, columns }: { cards: AgingCard[]; columns: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {cards.map(({ label, value, borderClass }) => (
        <KpiStatCard
          key={label}
          compact
          label={label}
          value={value}
          className={cn("border-2", borderClass)}
        />
      ))}
    </div>
  );
}

export function AgingSummaryCards({ report, currency }: Props) {
  const totals = resolveTotals(report, currency);

  const primaryRow: AgingCard[] = [
    { label: "Al día", value: fmt(totals.current), borderClass: "border-emerald-500/40" },
    { label: "Total vencido", value: fmt(totals.totalOverdue), borderClass: "border-muted" },
    { label: "Saldo total", value: fmt(totals.totalBalance), borderClass: "border-muted" },
  ];

  const bucketRow: AgingCard[] = [
    { label: "1–30 días", value: fmt(totals.bucket1_30), borderClass: "border-amber-500/40" },
    { label: "31–60 días", value: fmt(totals.bucket31_60), borderClass: "border-orange-500/40" },
    { label: "61–90 días", value: fmt(totals.bucket61_90), borderClass: "border-destructive/40" },
    { label: "+90 días", value: fmt(totals.bucket90Plus), borderClass: "border-destructive/60" },
  ];

  return (
    <section className="space-y-3">
      <AgingCardRow cards={primaryRow} columns={3} />
      <AgingCardRow cards={bucketRow} columns={4} />
    </section>
  );
}
