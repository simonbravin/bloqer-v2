import { cn } from "@/lib/utils";

type KpiStatGridColumns = 2 | 3 | 4 | 5 | 7;

const columnClass: Record<KpiStatGridColumns, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5 max-lg:[&>*:nth-child(5)]:col-span-2",
  7: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7",
};

export function KpiStatGrid({
  title = "Indicadores",
  columns = 4,
  actions,
  children,
  className,
}: {
  title?: string | null;
  columns?: KpiStatGridColumns;
  /** Optional controls aligned with the section title (e.g. create buttons). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("grid grid-cols-1 gap-3 sm:gap-4 [&>*]:min-w-0", columnClass[columns])}>
        {children}
      </div>
    </section>
  );
}
