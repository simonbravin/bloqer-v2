import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getKpiValueSizeClass } from "@/lib/kpi-value-size";
import { kpiIconAccentClass, resolveKpiStatIcon, type KpiStatTone } from "@/lib/kpi-stat-icon";
import { cn } from "@/lib/utils";

export type { KpiStatTone };

const toneValueClass: Record<KpiStatTone, string> = {
  default: "text-card-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger:  "text-destructive",
  muted:   "text-muted-foreground",
};

export interface KpiStatCardProps {
  label: string;
  value: string;
  href?: string;
  tone?: KpiStatTone;
  /** Stable KPI key for icon mapping (e.g. `ar_open`, `schedule_progress`). */
  iconKey?: string;
  /** Secondary metric line (e.g. currency code). */
  subtitle?: string;
  /** Explanatory helper below the value. */
  helper?: string;
  variant?: "default" | "highlight";
  /** Shorter cards for dense dashboards (e.g. aging buckets). */
  compact?: boolean;
  className?: string;
}

export function KpiStatCard({
  label,
  value,
  href,
  tone = "default",
  iconKey,
  subtitle,
  helper,
  variant = "default",
  compact = false,
  className,
}: KpiStatCardProps) {
  const { Icon, accent } = resolveKpiStatIcon({ iconKey, label, tone });
  const accentClass = kpiIconAccentClass[accent];

  const inner = (
    <Card
      className={cn(
        "flex h-full flex-col rounded-xl border border-border bg-card shadow-sm transition-shadow duration-200",
        compact ? "min-h-[4.75rem]" : "min-h-[8.5rem]",
        variant === "highlight" && "border-primary/30 bg-primary/5",
        className,
      )}
    >
      <CardHeader className={cn("flex-none space-y-0 pb-0", compact ? "pt-3" : "pt-5")}>
        <div className="flex items-start justify-between gap-3">
          <CardTitle
            className={cn(
              "min-w-0 flex-1 font-medium leading-snug text-muted-foreground line-clamp-2",
              compact ? "min-h-0 text-xs" : "min-h-[2.5rem] text-sm",
            )}
          >
            {label}
          </CardTitle>
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg",
              compact ? "h-8 w-8" : "h-9 w-9",
              accentClass.container,
            )}
            aria-hidden
          >
            <Icon className={cn(compact ? "h-4 w-4" : "h-[18px] w-[18px]", accentClass.icon)} />
          </div>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "flex flex-1 flex-col justify-end space-y-1",
          compact ? "pb-3 pt-1.5" : "pb-5 pt-3",
        )}
      >
        <p
          className={cn(
            getKpiValueSizeClass(value, { compact }),
            "w-full min-w-0 font-semibold tabular-nums leading-tight tracking-tight",
            !compact && "break-all",
            toneValueClass[tone],
          )}
        >
          {value}
        </p>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        {helper ? <p className="text-xs leading-snug text-muted-foreground/90">{helper}</p> : null}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full rounded-xl outline-none ring-offset-background transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
