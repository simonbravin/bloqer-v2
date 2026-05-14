import Link from "next/link";
import type { DashboardKpi } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const toneValue: Record<NonNullable<DashboardKpi["tone"]>, string> = {
  default: "text-card-foreground",
  success: "text-card-foreground",
  warning: "text-card-foreground",
  danger:  "text-destructive",
  muted:   "text-muted-foreground",
};

export function DashboardKpiCard({ kpi }: { kpi: DashboardKpi }) {
  const tone = kpi.tone ?? "default";
  const inner = (
    <Card className="rounded-xl border border-border bg-card shadow-sm transition-shadow duration-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", toneValue[tone])}>{kpi.value}</p>
        {kpi.helper ? <p className="text-xs text-muted-foreground">{kpi.helper}</p> : null}
      </CardContent>
    </Card>
  );

  if (kpi.href) {
    return (
      <Link
        href={kpi.href}
        className="block rounded-xl outline-none ring-offset-background transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
