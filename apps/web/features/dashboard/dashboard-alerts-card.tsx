import type { DashboardModuleWarning } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardAlertsCard({ warnings }: { warnings: DashboardModuleWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {warnings.map((w, i) => (
          <div
            key={`${w.module}-${i}`}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              w.module === "TENANT" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/30",
            )}
          >
            <p className="font-medium">{w.label}</p>
            <p className="mt-0.5 text-muted-foreground">{w.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
