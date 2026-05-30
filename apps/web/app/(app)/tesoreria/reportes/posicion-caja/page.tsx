import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCashPositionReport } from "@bloqer/services";
import { CashPositionTable } from "@/features/treasury-reports";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  searchParams: Promise<{ companyId?: string; currency?: string }>;
}

export default async function PosicionCajaPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const report = await getCashPositionReport(
    {
      companyId: sp.companyId || undefined,
      currency: sp.currency || undefined,
    },
    ctx,
  );

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <PageBackLink href="/tesoreria/reportes" label="Reportes" />
          <h1 className="text-2xl font-bold tracking-tight">Posición de caja</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportActions exportPath="/api/reports/tesoreria/posicion-caja.csv" params={sp} pdf />
          <ReportEmailSendDialog
            reportType="TREASURY_CASH_POSITION"
            supportsPdf={false}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <CashPositionTable report={report} />
    </PageShell>
  );
}
