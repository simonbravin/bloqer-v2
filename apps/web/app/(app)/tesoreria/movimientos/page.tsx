import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getAccountMovementReport, parseMovementReportFilters, ServiceError } from "@bloqer/services";
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
  if (!can(current.tenantCtx.roles, "VIEW", "TREASURY")) redirect("/dashboard");

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
  if (sp.sort) qs.set("sort", sp.sort);
  if (sp.dir) qs.set("dir", sp.dir);
  const accountingReturnPath = `/tesoreria/movimientos${qs.size ? `?${qs}` : ""}`;
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");

  let rows;
  try {
    ({ rows } = await getAccountMovementReport(parseMovementReportFilters(sp), ctx));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

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

      <div className="text-sm text-muted-foreground">
        {rows.length} movimiento{rows.length === 1 ? "" : "s"} encontrado
        {rows.length === 1 ? "" : "s"}.
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
