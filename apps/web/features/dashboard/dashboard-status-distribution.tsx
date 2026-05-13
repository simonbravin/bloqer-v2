import type { DashboardProjectStatusSlice } from "@bloqer/services";

export function DashboardStatusDistribution({ slices }: { slices: DashboardProjectStatusSlice[] }) {
  if (slices.length === 0) return null;
  const max = Math.max(...slices.map((s) => s.count), 1);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Proyectos por estado</h2>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <ul className="space-y-3">
          {slices.map((s) => {
            const pct = (s.count / max) * 100;
            return (
              <li key={s.status}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-foreground">{s.label}</span>
                  <span className="tabular-nums text-muted-foreground">{s.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
