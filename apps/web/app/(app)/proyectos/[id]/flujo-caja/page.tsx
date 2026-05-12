import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
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

interface PageProps {
  params:      Promise<{ id: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?:   string;
    period?:   string;
    currency?: string;
  }>;
}

function fmt(v: string, currency: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 }) + " " + currency;
}

function colorClass(v: string) {
  const n = parseFloat(v);
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "";
}

const PERIOD_LABELS: Record<string, string> = {
  day:   "Por día",
  week:  "Por semana",
  month: "Por mes",
};

export default async function FlujosDeCajaPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const period = (sp.period === "day" || sp.period === "week" || sp.period === "month")
    ? sp.period
    : undefined;

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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}`}>← {report.project.name}</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            Flujo de caja — {report.project.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportCsvExportLink exportPath={`/api/reports/proyectos/${id}/flujo-caja.csv`} params={sp} />
          <ReportEmailSendDialog
            reportType="PROJECT_CASH_FLOW"
            supportsPdf={false}
            projectId={id}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      {report.warnings.multiCurrency && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Este proyecto tiene movimientos en múltiples monedas. Cada moneda se muestra por separado; los totales no se consolidan.
        </div>
      )}

      {report.warnings.sectionsExcluded && report.warnings.sectionsExcluded.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-medium">Partes del informe omitidas (módulo deshabilitado para el tenant)</p>
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
        Período: {report.dateFrom} → {report.dateTo} · {PERIOD_LABELS[report.period] ?? report.period}
      </p>

      {report.currencies.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          Sin cobranzas ni pagos confirmados para los filtros seleccionados.
        </div>
      )}

      {report.currencies.map((cur) => (
        <div key={cur.currency} className="space-y-4">
          <h2 className="font-semibold text-lg">{cur.currency}</h2>

          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total ingresos</p>
              <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
                {fmt(cur.totalInflows, cur.currency)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total egresos</p>
              <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-red-600 dark:text-red-400">
                {fmt(cur.totalOutflows, cur.currency)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Flujo neto</p>
              <p className={`text-2xl font-bold font-mono tabular-nums mt-1 ${colorClass(cur.netCashFlow)}`}>
                {fmt(cur.netCashFlow, cur.currency)}
              </p>
            </div>
          </div>

          {/* Chart */}
          <ProjectCashFlowChart periods={cur.periods} currency={cur.currency} />

          {/* Period table */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm px-1">Flujo por período</h3>
            <ProjectCashFlowTable periods={cur.periods} currency={cur.currency} />
          </div>

          {/* Collections */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm px-1">
              Cobranzas ({cur.collections.length})
            </h3>
            <CollectionDetailTable collections={cur.collections} currency={cur.currency} />
          </div>

          {/* Payments */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm px-1">
              Pagos ({cur.payments.length})
            </h3>
            <PaymentDetailTable payments={cur.payments} currency={cur.currency} />
          </div>

          {report.currencies.length > 1 && <hr className="border-border" />}
        </div>
      ))}
    </div>
  );
}
