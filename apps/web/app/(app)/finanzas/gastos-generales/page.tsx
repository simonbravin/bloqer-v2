import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditCompanyAp,
  canViewCompanyAp,
  currentOverheadPeriod,
  AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
  getAutoWeightOverheadPreviewForPeriod,
  getCompanies,
  getCompanyOverheadSettings,
  getTenantModuleGate,
  listActiveProjectsForOverhead,
  listCompanySupplierInvoices,
  listOverheadPeriodSummaries,
  listProjectOverheadAllocations,
  ServiceError,
} from "@bloqer/services";
import type { SupplierInvoiceListItem } from "@/features/ap";
import { OverheadAllocationsPanel } from "@/features/finance/overhead-allocations-panel";
import { CorporateGgRecentInvoices } from "@/features/finance/components/corporate-gg-recent-invoices";
import { OverheadPeriodSummaryPanel } from "@/features/finance/components/overhead-period-summary-panel";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default async function GastosGeneralesPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("AP") || !canViewCompanyAp(current.tenantCtx.roles)) {
    redirect("/finanzas");
  }

  const canEditAp = canEditCompanyAp(current.tenantCtx.roles);
  const companies = await getCompanies(ctx);
  const companyId = ctx.companyId ?? companies[0]?.id;

  let recentInvoices: SupplierInvoiceListItem[] = [];
  if (companyId) {
    try {
      const invResult = await listCompanySupplierInvoices(ctx, {
        page: 1,
        pageSize: 10,
        status: "ISSUED",
      });
      recentInvoices = invResult.data.map((inv) => ({
        id: inv.id,
        code: inv.code,
        supplierName: inv.supplierName,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        currency: inv.currency,
        status: inv.status,
      }));
    } catch (err) {
      if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
    }
  }

  let overheadPanel: ReactNode = null;
  let periodSummaries: Awaited<ReturnType<typeof listOverheadPeriodSummaries>> = [];
  let overheadLoadFailed = false;

  if (!companyId) {
    overheadPanel = (
      <p className="text-sm text-muted-foreground rounded-lg border bg-card p-4">
        Configurá al menos una empresa activa para imputar gastos generales a obra.
      </p>
    );
  } else {
    try {
      const [settings, allocations, projects] = await Promise.all([
        getCompanyOverheadSettings(companyId, ctx),
        listProjectOverheadAllocations({ companyId }, ctx),
        listActiveProjectsForOverhead(companyId, ctx),
      ]);

      if (settings.overheadAllocationMode === "AUTO_WEIGHT") {
        periodSummaries = await listOverheadPeriodSummaries(companyId, ctx, { limit: 12 });
      }

      const initialAutoPreview =
        settings.overheadAllocationMode === "AUTO_WEIGHT"
          ? await getAutoWeightOverheadPreviewForPeriod(
              companyId,
              currentOverheadPeriod(),
              ctx,
              AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
            )
          : null;

      overheadPanel = (
        <OverheadAllocationsPanel
          companyId={companyId}
          settings={settings}
          allocations={allocations}
          projects={projects}
          canEdit={canEditAp}
          initialAutoPreview={initialAutoPreview}
          calendarPeriod={currentOverheadPeriod()}
        />
      );
    } catch (err) {
      if (err instanceof ServiceError && err.code === "FORBIDDEN") {
        overheadLoadFailed = true;
      } else {
        throw err;
      }
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Gastos generales</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Facturas corporativas (sin obra) e imputación a proyectos para margen neto.
            Estos montos no se mezclan con EDT y costos de cada obra.
          </p>
        </div>
      </div>

      {canEditAp ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/finanzas/facturas-proveedor?create=1">Nueva factura de gasto</Link>
          </Button>
        </div>
      ) : null}

      {companyId && periodSummaries.length > 0 ? (
        <OverheadPeriodSummaryPanel
          companyId={companyId}
          periods={periodSummaries}
          canEdit={canEditAp}
        />
      ) : null}

      <CorporateGgRecentInvoices invoices={recentInvoices} />

      {overheadLoadFailed ? (
        <p className="text-sm text-muted-foreground rounded-lg border bg-card p-4">
          No tenés permisos para ver o editar la imputación de gastos generales a obra.
        </p>
      ) : (
        overheadPanel
      )}
    </PageShell>
  );
}
