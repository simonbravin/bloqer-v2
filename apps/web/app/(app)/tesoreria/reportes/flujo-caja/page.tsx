import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getCashFlowReport } from "@bloqer/services";
import { CashFlowTable, CashFlowChart, CashFlowFilters } from "@/features/treasury-reports";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    period?: string;
    currency?: string;
  }>;
}

export default async function FlujoCajaPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const validPeriods = ["day", "week", "month"] as const;
  const period = validPeriods.includes(sp.period as never)
    ? (sp.period as "day" | "week" | "month")
    : "month";

  const report = await getCashFlowReport(
    {
      dateFrom: sp.dateFrom || undefined,
      dateTo: sp.dateTo || undefined,
      period,
      currency: sp.currency || undefined,
    },
    ctx,
  );

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <PageBackLink href="/tesoreria/reportes" label="Reportes" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Flujo de caja</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Solo movimientos confirmados. Sin conversión de moneda.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportActions exportPath="/api/reports/tesoreria/flujo-caja.csv" params={sp} pdf />
          <ReportEmailSendDialog
            reportType="TREASURY_CASH_FLOW"
            supportsPdf={false}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <CashFlowFilters />
        </Suspense>
      </div>

      {report.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay movimientos para los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-10">
          {report.map((currencyData) => (
            <div key={currencyData.currency} className="space-y-4">
              <div className="rounded-lg border bg-card p-4">
                <CashFlowChart data={currencyData} />
              </div>
              <CashFlowTable data={currencyData} />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Ajustes (ADJUSTMENT): la convención de signo del módulo de ajuste manual está pendiente. Los
        ajustes se muestran como egresos por defecto.
      </p>
    </PageShell>
  );
}
