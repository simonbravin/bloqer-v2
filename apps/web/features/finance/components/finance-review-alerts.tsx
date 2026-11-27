import Link from "next/link";
import { Button } from "@/components/ui/button";

type ReviewAlert = {
  variant: "info" | "warning";
  message: string;
  context?: string;
  sources?: { label: string; href: string }[];
};

/** Shared presentation for the existing finance and transactions alerts. */
export function FinanceReviewAlerts({ alerts }: { alerts: ReviewAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="Avisos para revisar" className="space-y-2">
      <h2 className="text-sm font-semibold">Avisos para revisar</h2>
      {alerts.map((alert) => (
        <div key={alert.message} role="note" className={alert.variant === "warning"
          ? "min-w-0 rounded-md border border-destructive/35 bg-destructive/5 p-3 text-sm"
          : "min-w-0 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground"}>
          <p className="break-words">{alert.message}</p>
          {alert.context && <p className="mt-2 break-words text-xs text-muted-foreground">{alert.context}</p>}
          {alert.sources && alert.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {alert.sources.map((source) => (
                <Button key={source.href} asChild variant="outline" size="sm" className="min-h-11 h-auto whitespace-normal text-left">
                  <Link href={source.href}>{source.label}</Link>
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
