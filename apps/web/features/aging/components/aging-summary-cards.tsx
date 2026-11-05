import type { AgingReport, AgingTotals } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { formatMoneyAmount } from "@/lib/format-money";
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
  return formatMoneyAmount(v);
}

type AgingCard = {
  label: string;
  value: string;
  borderClass: string;
  iconKey: string;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
};

function AgingCardRow({ cards, columns }: { cards: AgingCard[]; columns: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {cards.map(({ label, value, borderClass, iconKey, tone }) => (
        <KpiStatCard
          key={label}
          compact
          iconKey={iconKey}
          label={label}
          value={value}
          tone={tone}
          className={cn("border-2", borderClass)}
        />
      ))}
    </div>
  );
}

function AgingCurrencyCards({ totals, currency }: { totals: AgingTotals; currency?: string }) {
  const overdueAmount = Number(totals.totalOverdue);

  const primaryRow: AgingCard[] = [
    {
      label: "Al día",
      value: fmt(totals.current),
      borderClass: "border-emerald-500/40",
      iconKey: "aging_current",
      tone: "success",
    },
    {
      label: "Total vencido",
      value: fmt(totals.totalOverdue),
      borderClass: "border-destructive/40",
      iconKey: "aging_overdue",
      tone: overdueAmount > 0 ? "danger" : "muted",
    },
    {
      label: "Saldo total",
      value: fmt(totals.totalBalance),
      borderClass: "border-muted",
      iconKey: "aging_balance",
    },
  ];

  const bucketRow: AgingCard[] = [
    {
      label: "1–30 días",
      value: fmt(totals.bucket1_30),
      borderClass: "border-amber-500/40",
      iconKey: "aging_bucket",
      tone: Number(totals.bucket1_30) > 0 ? "warning" : "muted",
    },
    {
      label: "31–60 días",
      value: fmt(totals.bucket31_60),
      borderClass: "border-orange-500/40",
      iconKey: "aging_bucket",
      tone: Number(totals.bucket31_60) > 0 ? "warning" : "muted",
    },
    {
      label: "61–90 días",
      value: fmt(totals.bucket61_90),
      borderClass: "border-destructive/40",
      iconKey: "aging_bucket",
      tone: Number(totals.bucket61_90) > 0 ? "danger" : "muted",
    },
    {
      label: "+90 días",
      value: fmt(totals.bucket90Plus),
      borderClass: "border-destructive/60",
      iconKey: "aging_overdue",
      tone: Number(totals.bucket90Plus) > 0 ? "danger" : "muted",
    },
  ];

  return (
    <section className="space-y-3">
      {currency ? <h2 className="text-sm font-semibold">Saldos en {currency}</h2> : null}
      <AgingCardRow cards={primaryRow} columns={3} />
      <AgingCardRow cards={bucketRow} columns={4} />
    </section>
  );
}

export function AgingSummaryCards({ report, currency }: Props) {
  const groups: [string | undefined, AgingTotals][] = currency
    ? [[currency, report.byCurrency[currency] ?? EMPTY_TOTALS]]
    : Object.entries(report.byCurrency);
  if (groups.length === 0) groups.push([undefined, report.totals ?? EMPTY_TOTALS]);
  return <div className="space-y-5">{groups.map(([code, totals]) => <AgingCurrencyCards key={code ?? "empty"} totals={totals} currency={code} />)}</div>;
}
