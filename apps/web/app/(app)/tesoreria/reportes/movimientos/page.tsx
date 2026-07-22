import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getAccountMovementReport, parseMovementReportFilters } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { MovementLedgerTable, MovementFilters } from "@/features/treasury-reports";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  searchParams: Promise<{
    accountId?: string;
    dateFrom?: string;
    dateTo?: string;
    type?: string;
    sourceType?: string;
    currency?: string;
    includeInternalTransfers?: string;
    corporateApPayments?: string;
    scope?: string;
    projectId?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function MovimientosPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const qs = new URLSearchParams();
  if (sp.accountId) qs.set("accountId", sp.accountId);
  if (sp.dateFrom) qs.set("dateFrom", sp.dateFrom);
  if (sp.dateTo) qs.set("dateTo", sp.dateTo);
  if (sp.type) qs.set("type", sp.type);
  if (sp.sourceType) qs.set("sourceType", sp.sourceType);
  if (sp.currency) qs.set("currency", sp.currency);
  if (sp.includeInternalTransfers === "false") qs.set("includeInternalTransfers", "false");
  if (sp.corporateApPayments === "true") qs.set("corporateApPayments", "true");
  if (sp.scope) qs.set("scope", sp.scope);
  if (sp.projectId) qs.set("projectId", sp.projectId);
  const accountingReturnPath = `/tesoreria/reportes/movimientos${qs.size ? `?${qs}` : ""}`;
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");

  const { rows } = await getAccountMovementReport(parseMovementReportFilters(sp), ctx);

  const showRunningBalance = !!sp.accountId;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportActions exportPath="/api/reports/tesoreria/movimientos.csv" params={sp} pdf />
          <ReportEmailSendDialog
            reportType="TREASURY_MOVEMENTS"
            supportsPdf={false}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <MovementFilters />
        </Suspense>
      </div>

      <div className="text-sm text-muted-foreground space-y-2">
        <p>
          {rows.length} movimiento{rows.length === 1 ? "" : "s"} encontrado
          {rows.length === 1 ? "" : "s"}.
          {!sp.accountId && " Saldo acumulado disponible al filtrar por cuenta."}
        </p>
        {sp.sourceType === "MANUAL_ADJUSTMENT" && (
          <p className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-foreground/90">
            Los movimientos con este origen son <strong>ingresos manuales de caja</strong> registrados desde{" "}
            <Link href="/finanzas/transacciones" className="font-medium underline underline-offset-4 hover:no-underline">
              Finanzas → Transacciones
            </Link>{" "}
            (tipo «Ingreso de caja»). Todavía no hay pantalla en Tesorería para egresos o ajustes libres por cuenta.
          </p>
        )}
        {sp.corporateApPayments === "true" && (
          <p className="text-foreground/90">
            Filtro activo: egresos por <strong>pago a proveedor</strong> cuya obligación es{" "}
            <strong>sin proyecto</strong> (gastos generales de empresa).
          </p>
        )}
      </div>

      <MovementLedgerTable
        rows={rows}
        showRunningBalance={showRunningBalance}
        showProjectColumn={Boolean(sp.scope || sp.projectId)}
        accountingReturnPath={accountingReturnPath}
        canEditAccounting={canEditAccounting}
      />
    </PageShell>
  );
}
