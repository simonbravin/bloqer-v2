import { Suspense } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { StockReportFilters } from "./stock-report-filters";

export function InventoryReportError({
  title,
  mode,
  message,
}: {
  title: string;
  mode: "balance" | "movements";
  message: string;
}) {
  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {message}
      </p>
      <Suspense>
        <StockReportFilters mode={mode} />
      </Suspense>
    </PageShell>
  );
}
