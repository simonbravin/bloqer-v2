import { cn } from "@/lib/utils";

type KpiStatGridColumns = 2 | 3 | 4 | 7;

const columnClass: Record<KpiStatGridColumns, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  7: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7",
};

export function KpiStatGrid({
  title = "Indicadores",
  columns = 4,
  children,
  className,
}: {
  title?: string | null;
  columns?: KpiStatGridColumns;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {title ? (
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      ) : null}
      <div className={cn("grid grid-cols-1 gap-4", columnClass[columns])}>{children}</div>
    </section>
  );
}
