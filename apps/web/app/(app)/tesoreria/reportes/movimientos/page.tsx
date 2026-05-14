import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getAccountMovementReport } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { MovementLedgerTable, MovementFilters } from "@/features/treasury-reports";
import { ReportCsvExportLink } from "@/features/reports/report-csv-export-link";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";

interface PageProps {
  searchParams: Promise<{
    accountId?:               string;
    dateFrom?:                string;
    dateTo?:                  string;
    type?:                    string;
    sourceType?:              string;
    currency?:                string;
    includeInternalTransfers?: string;
    corporateApPayments?:     string;
  }>;
}

export default async function MovimientosPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
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
  const accountingReturnPath = `/tesoreria/reportes/movimientos${qs.size ? `?${qs}` : ""}`;
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");

  const rows = await getAccountMovementReport(
    {
      accountId:               sp.accountId  || undefined,
      dateFrom:                sp.dateFrom   || undefined,
      dateTo:                  sp.dateTo     || undefined,
      type:                    sp.type       || undefined,
      sourceType:              sp.sourceType || undefined,
      currency:                sp.currency   || undefined,
      includeInternalTransfers: sp.includeInternalTransfers === "false" ? false : true,
      corporateApPaymentsOnly: sp.corporateApPayments === "true",
    },
    ctx,
  );

  const showRunningBalance = !!sp.accountId;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tesoreria/reportes">← Reportes</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportCsvExportLink exportPath="/api/reports/tesoreria/movimientos.csv" params={sp} />
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
        {rows.length} movimiento{rows.length !== 1 ? "s" : ""} encontrado{rows.length !== 1 ? "s" : ""}.
        {!sp.accountId && " Saldo acumulado disponible al filtrar por cuenta."}
        {sp.corporateApPayments === "true" && (
          <span className="mt-1 block text-foreground/90">
            Filtro activo: egresos por <strong>pago a proveedor</strong> cuya obligación es <strong>sin proyecto</strong>{" "}
            (gastos generales de empresa).
          </span>
        )}
      </div>

      <MovementLedgerTable
        rows={rows}
        showRunningBalance={showRunningBalance}
        accountingReturnPath={accountingReturnPath}
        canEditAccounting={canEditAccounting}
      />
    </div>
  );
}
