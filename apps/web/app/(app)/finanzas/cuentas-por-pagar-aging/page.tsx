import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPayableAgingReport, parseAgingFilters } from "@bloqer/services";
import {
  AgingSummaryCards,
  AgingFilters,
  AgingTable,
} from "@/features/aging";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";

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

export default async function ApAgingPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const report = await getPayableAgingReport(parseAgingFilters(sp), ctx);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cuentas por pagar</h1>
          <p className="text-xs text-muted-foreground">Al {report.asOfDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportActions exportPath="/api/reports/finanzas/ap-aging.csv" params={sp} pdf />
          <ReportEmailSendDialog
            reportType="AP_AGING"
            supportsPdf
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <AgingFilters />
      <AgingSummaryCards report={report} currency={sp.currency} />
      <AgingTable report={report} />
    </PageShell>
  );
}
