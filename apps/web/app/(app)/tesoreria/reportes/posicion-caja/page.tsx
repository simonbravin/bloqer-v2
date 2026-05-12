import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getCashPositionReport } from "@bloqer/services";
import { CashPositionTable } from "@/features/treasury-reports";
import { ReportCsvExportLink } from "@/features/reports/report-csv-export-link";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";

interface PageProps {
  searchParams: Promise<{ companyId?: string; currency?: string }>;
}

export default async function PosicionCajaPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const report = await getCashPositionReport(
    {
      companyId: sp.companyId || undefined,
      currency:  sp.currency || undefined,
    },
    ctx,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tesoreria/reportes">← Reportes</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Posición de caja</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportCsvExportLink exportPath="/api/reports/tesoreria/posicion-caja.csv" params={sp} />
          <ReportEmailSendDialog
            reportType="TREASURY_CASH_POSITION"
            supportsPdf={false}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <CashPositionTable report={report} />
    </div>
  );
}
