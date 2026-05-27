import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { getCurrentUser } from "@/lib/auth";
import { getProjectCashFlowReport, ServiceError } from "@bloqer/services";
import {
  ProjectCashFlowFilters,
  ProjectCashFlowTable,
  ProjectCashFlowChart,
  CollectionDetailTable,
  PaymentDetailTable,
} from "@/features/project-cash-flow";
import { ReportCsvExportLink } from "@/features/reports/report-csv-export-link";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { formatMoneyAmount } from "@/lib/format-money";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    period?: string;
    currency?: string;
  }>;
}

const PERIOD_LABELS: Record<string, string> = {
  day: "Por día",
  week: "Por semana",
  month: "Por mes",
};

export default async function FlujosDeCajaPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const period =
    sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : undefined;

  let report;
  try {
    report = await getProjectCashFlowReport(
      id,
      { dateFrom: sp.dateFrom, dateTo: sp.dateTo, period, currency: sp.currency },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={report.project.name}
        title="Flujo de caja"
        subtitle="Cobros y pagos imputados a la obra"
        actions={
          <>
            <ReportCsvExportLink
              exportPath={`/api/reports/proyectos/${id}/flujo-caja.csv`}
              params={sp}
            />
            <ReportEmailSendDialog
              reportType="PROJECT_CASH_FLOW"
              supportsPdf={false}
              projectId={id}
              params={sp}
              defaultRecipientEmail={current.session.user?.email ?? null}
            />
          </>
        }
      />

      {report.warnings.multiCurrency && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Este proyecto tiene movimientos en múltiples monedas. Cada moneda se muestra por separado;
          los totales no se consolidan.
        </div>
      )}

      {report.warnings.sectionsExcluded && report.warnings.sectionsExcluded.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-medium">
            Partes del informe omitidas (módulo deshabilitado para el tenant)
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {report.warnings.sectionsExcluded.map((s, i) => (
              <li key={i}>
                {s.module} — {s.section} ({s.reason})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <ProjectCashFlowFilters />
        </Suspense>
      </div>

      <p className="text-xs text-muted-foreground">
        Período: {report.dateFrom} → {report.dateTo} ·{" "}
        {PERIOD_LABELS[report.period] ?? report.period}
      </p>

      {report.currencies.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          Sin cobranzas ni pagos confirmados para los filtros seleccionados.
        </div>
      )}

      {report.currencies.map((cur) => (
        <div key={cur.currency} className="space-y-4">
          <h2 className="font-semibold text-lg">{cur.currency}</h2>

          <KpiStatGrid title={null} columns={3}>
            <KpiStatCard
              label="Total ingresos"
              value={formatMoneyAmount(cur.totalInflows, cur.currency)}
              tone="success"
            />
            <KpiStatCard
              label="Total egresos"
              value={formatMoneyAmount(cur.totalOutflows, cur.currency)}
              tone="danger"
            />
            <KpiStatCard
              label="Flujo neto"
              value={formatMoneyAmount(cur.netCashFlow, cur.currency)}
              tone={
                parseFloat(cur.netCashFlow) > 0
                  ? "success"
                  : parseFloat(cur.netCashFlow) < 0
                    ? "danger"
                    : "muted"
              }
            />
          </KpiStatGrid>

          {/* Chart */}
          <ProjectCashFlowChart periods={cur.periods} currency={cur.currency} />

          {/* Period table */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm px-1">Flujo por período</h3>
            <ProjectCashFlowTable periods={cur.periods} currency={cur.currency} />
          </div>

          {/* Collections */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm px-1">Cobranzas ({cur.collections.length})</h3>
            <CollectionDetailTable collections={cur.collections} currency={cur.currency} />
          </div>

          {/* Payments */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm px-1">Pagos ({cur.payments.length})</h3>
            <PaymentDetailTable payments={cur.payments} currency={cur.currency} />
          </div>

          {report.currencies.length > 1 && <hr className="border-border" />}
        </div>
      ))}
    </PageShell>
  );
}
