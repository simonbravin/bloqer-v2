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
  /** Secondary metric line (e.g. currency code), not explanatory helper text. */
  subtitle?: string;
  variant?: "default" | "highlight";
  className?: string;
}

export function KpiStatCard({
  label,
  value,
  href,
  tone = "default",
  subtitle,
  variant = "default",
  className,
}: KpiStatCardProps) {
  const inner = (
    <Card
      className={cn(
        "flex h-full min-h-[8.5rem] flex-col rounded-xl border border-border bg-card shadow-sm transition-shadow duration-200",
        variant === "highlight" && "border-primary/30 bg-primary/5",
        className,
      )}
    >
      <CardHeader className="flex-none space-y-0 pb-0 pt-5">
        <CardTitle className="min-h-[2.5rem] text-sm font-medium leading-snug text-muted-foreground line-clamp-2">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end space-y-1 pb-5 pt-3">
        <p
          className={cn(
            getKpiValueSizeClass(value),
            "break-all font-semibold tabular-nums leading-none tracking-tight",
            toneValueClass[tone],
          )}
        >
          {value}
        </p>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
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
