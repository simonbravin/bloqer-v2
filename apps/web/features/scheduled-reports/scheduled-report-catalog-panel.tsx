import type { ScheduledReportCatalogOption } from "./scheduled-report-form";

type Props = {
  title: string;
  hint: string;
  catalog: ScheduledReportCatalogOption[];
};

export function ScheduledReportCatalogPanel({ title, hint, catalog }: Props) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {catalog.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay reportes disponibles con los módulos actuales.
        </p>
      ) : (
        (["financial", "operational"] as const).map((group) => {
          const items = catalog.filter((c) => c.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                {group === "financial" ? "Financieros" : "Operativos"}
              </p>
              <ul className="text-xs leading-5">
                {items.map((c) => (
                  <li key={c.reportKey}>{c.labelEs}</li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
