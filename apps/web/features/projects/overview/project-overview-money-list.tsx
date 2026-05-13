import type { ProjectOverviewMoneyRow } from "@bloqer/services";

function formatMoney(currency: string, amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function ProjectOverviewMoneyList({
  rows,
  emptyLabel,
}: {
  rows: ProjectOverviewMoneyRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.currency} className="flex justify-between gap-4 font-medium tabular-nums">
          <span className="text-muted-foreground">{r.currency}</span>
          <span>{formatMoney(r.currency, r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
