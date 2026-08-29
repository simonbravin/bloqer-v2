import Link from "next/link";
import type { ReactNode } from "react";
import type { ScheduledReportCatalogOption } from "./scheduled-report-form";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  hint: string;
  catalog: ScheduledReportCatalogOption[];
  /** Optional footer note / CTA (e.g. link to company-level jobsite daily). */
  footer?: ReactNode;
  className?: string;
};

export function ScheduledReportCatalogPanel({
  title,
  hint,
  catalog,
  footer,
  className,
}: Props) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-3", className)}>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
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
            <div key={group} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group === "financial" ? "Financieros" : "Operativos"}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {items.map((c) => (
                  <li
                    key={c.reportKey}
                    className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-foreground"
                  >
                    {c.labelEs}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
      {footer ? <div className="pt-1 border-t text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

/** Shared CTA: jobsite daily lives on tenant schedules, not project ones. */
export function JobsiteDailyScheduleHint({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground leading-relaxed", className)}>
      El <span className="font-medium text-foreground">parte diario de libro de obra</span> se
      programa a nivel <span className="font-medium text-foreground">empresa</span> (multi-obra), no
      por un solo proyecto.{" "}
      <Link
        href="/configuracion/reportes/nuevo"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Crear envío empresa
      </Link>
    </p>
  );
}
