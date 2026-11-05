import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getStockMovementReport, parseStockMovementFilters, ServiceError } from "@bloqer/services";
import { InventoryReportError } from "@/features/inventory-reports/components/inventory-report-error";
import { StockMovementReportTable, StockReportFilters } from "@/features/inventory-reports";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";

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

  let rows;
  try {
    rows = await getStockMovementReport(parseStockMovementFilters(sp), ctx);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "VALIDATION")
      return (
        <InventoryReportError
          title="Movimientos de inventario"
          mode="movements"
          message={error.message}
        />
      );
    if (error instanceof ServiceError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      notFound();
    throw error;
  }
  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Movimientos de inventario</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportActions
            exportPath="/api/reports/inventario/movimientos.csv"
            params={sp}
            pdf
          />
          <ReportEmailSendDialog
            reportType="INVENTORY_MOVEMENTS"
            supportsPdf={false}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <div className="min-w-0 rounded-lg border bg-card p-4">
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
