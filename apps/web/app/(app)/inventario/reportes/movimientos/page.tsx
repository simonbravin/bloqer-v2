import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getStockMovementReport } from "@bloqer/services";
import { StockMovementReportTable, StockReportFilters } from "@/features/inventory-reports";
import { ReportCsvExportLink } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  searchParams: Promise<{
    warehouseId?: string;
    productId?: string;
    projectId?: string;
    wbsNodeId?: string;
    companyId?: string;
    sourceType?: string;
    movementType?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

export default async function MovimientosInventarioPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const rows = await getStockMovementReport(
    {
      warehouseId: sp.warehouseId || undefined,
      productId: sp.productId || undefined,
      projectId: sp.projectId || undefined,
      wbsNodeId: sp.wbsNodeId || undefined,
      companyId: sp.companyId || undefined,
      sourceType: sp.sourceType || undefined,
      movementType: sp.movementType || undefined,
      dateFrom: sp.dateFrom || undefined,
      dateTo: sp.dateTo || undefined,
    },
    ctx,
  );

  return (
    <PageShell variant="wide" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <PageBackLink href="/inventario/reportes" label="Reportes" />
          <h1 className="text-2xl font-bold tracking-tight">Movimientos de inventario</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportCsvExportLink exportPath="/api/reports/inventario/movimientos.csv" params={sp} />
          <ReportEmailSendDialog
            reportType="INVENTORY_MOVEMENTS"
            supportsPdf={false}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <StockReportFilters mode="movements" />
        </Suspense>
      </div>

      <div className="text-sm text-muted-foreground">
        {rows.length} movimiento{rows.length !== 1 ? "s" : ""} confirmado
        {rows.length !== 1 ? "s" : ""}.
      </div>

      <StockMovementReportTable rows={rows} showProduct showWarehouse />
    </PageShell>
  );
}
