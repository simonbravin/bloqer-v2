import type { AgingReport } from "@bloqer/services";

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
    { label: "Al día",       value: totals.current,      className: "border-green-300  dark:border-green-800" },
    { label: "1–30 días",    value: totals.bucket1_30,   className: "border-yellow-300 dark:border-yellow-800" },
    { label: "31–60 días",   value: totals.bucket31_60,  className: "border-orange-300 dark:border-orange-800" },
    { label: "61–90 días",   value: totals.bucket61_90,  className: "border-red-300    dark:border-red-800" },
    { label: "+90 días",     value: totals.bucket90Plus, className: "border-red-400    dark:border-red-700" },
    { label: "Total vencido",value: totals.totalOverdue, className: "border-muted" },
    { label: "Saldo total",  value: totals.totalBalance, className: "border-muted font-semibold" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map(({ label, value, className }) => (
        <div key={label} className={`rounded-lg border-2 bg-card p-3 ${className}`}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{fmt(value)}</p>
        </div>
      ))}
    </div>
  );
}
