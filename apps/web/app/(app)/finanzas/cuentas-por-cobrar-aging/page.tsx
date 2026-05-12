import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getReceivableAgingReport, parseAgingFilters } from "@bloqer/services";
import {
  AgingSummaryCards,
  AgingFilters,
  AgingTable,
} from "@/features/aging";
import { ReportCsvExportLink } from "@/features/reports/report-csv-export-link";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { ReportPdfExportLink } from "@/features/reports/report-pdf-export-link";

interface PageProps {
  searchParams: Promise<{
    search?:       string;
    currency?:     string;
    bucket?:       string;
    asOfDate?:     string;
    projectId?:    string;
    contactId?:    string;
    companyId?:    string;
    includePaid?:  string;
  }>;
}

export default async function ArAgingPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const report = await getReceivableAgingReport(parseAgingFilters(sp), ctx);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/finanzas">← Finanzas</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Aging — Cuentas por cobrar</h1>
            <p className="text-xs text-muted-foreground">Al {report.asOfDate}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportCsvExportLink exportPath="/api/reports/finanzas/ar-aging.csv" params={sp} />
          <ReportPdfExportLink exportPath="/api/reports/finanzas/ar-aging.csv" params={sp} />
          <ReportEmailSendDialog
            reportType="AR_AGING"
            supportsPdf
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <AgingFilters />
      <AgingSummaryCards report={report} currency={sp.currency} />
      <AgingTable report={report} />
    </div>
  );
}
