import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getStockBalanceReport } from "@bloqer/services";
import { StockBalanceTable, StockReportFilters } from "@/features/inventory-reports";
import { ReportCsvExportLink } from "@/features/reports/report-csv-export-link";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  searchParams: Promise<{
    warehouseId?: string;
    productId?: string;
    companyId?: string;
    projectId?: string;
    includeZeroStock?: string;
  }>;
}

export default async function StockReportPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const rows = await getStockBalanceReport(
    {
      warehouseId: sp.warehouseId || undefined,
      productId: sp.productId || undefined,
      companyId: sp.companyId || undefined,
      projectId: sp.projectId || undefined,
      includeZeroStock: sp.includeZeroStock === "true",
    },
    ctx,
  );

  const negative = rows.filter((r) => r.flags.negativeStock).length;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <PageBackLink href="/inventario/reportes" label="Reportes" />
          <h1 className="text-2xl font-bold tracking-tight">Stock actual</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportCsvExportLink exportPath="/api/reports/inventario/stock.csv" params={sp} />
          <ReportEmailSendDialog
            reportType="INVENTORY_STOCK"
            supportsPdf={false}
            params={sp}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <StockReportFilters mode="balance" />
        </Suspense>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          {rows.length} fila{rows.length !== 1 ? "s" : ""}
        </span>
        {negative > 0 && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            {negative} con stock negativo
          </span>
        )}
      </div>

      <StockBalanceTable rows={rows} />
    </PageShell>
  );
}
