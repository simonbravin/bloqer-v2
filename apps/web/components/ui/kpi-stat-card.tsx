import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getKpiValueSizeClass } from "@/lib/kpi-value-size";
import { cn } from "@/lib/utils";

export type KpiStatTone = "default" | "success" | "warning" | "danger" | "muted";

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
  subtitle,
  helper,
  variant = "default",
  compact = false,
  className,
}: KpiStatCardProps) {
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
        <CardTitle
          className={cn(
            "font-medium leading-snug text-muted-foreground line-clamp-2",
            compact ? "min-h-0 text-xs" : "min-h-[2.5rem] text-sm",
          )}
        >
          {label}
        </CardTitle>
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
