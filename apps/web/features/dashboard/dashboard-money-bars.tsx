import { formatDashboardMoney } from "@bloqer/services";

export function DashboardMoneyBars({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; raw: string; currency: string }[];
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => Number(r.raw)), 1);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = max > 0 ? (Number(r.raw) / max) * 100 : 0;
          return (
            <li key={r.label}>
              <div className="mb-0.5 flex justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="tabular-nums font-medium">
                  {formatDashboardMoney(r.raw, r.currency.length === 3 ? r.currency : undefined)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
