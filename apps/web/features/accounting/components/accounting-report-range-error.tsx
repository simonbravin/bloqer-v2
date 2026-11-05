import { Suspense } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { AccountingReportFilters } from "./accounting-report-filters";

export function AccountingReportRangeError({ title, message }: { title: string; message: string }) {
  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="rounded-lg border bg-card p-4">
        <Suspense fallback={null}><AccountingReportFilters /></Suspense>
      </div>
      <p className="rounded-lg border bg-card p-4 text-sm text-destructive" role="alert">{message}</p>
    </PageShell>
  );
}
