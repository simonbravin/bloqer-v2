import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  currentOverheadPeriod,
  getAutoWeightOverheadPreviewForPeriod,
  getCompanies,
  getCompanyOverheadSettings,
  getTenantModuleGate,
  listActiveProjectsForOverhead,
  listProjectOverheadAllocations,
  ServiceError,
} from "@bloqer/services";
import { OverheadAllocationsPanel } from "@/features/finance/overhead-allocations-panel";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

const MOVIMIENTOS_CORP =
  "/tesoreria/reportes/movimientos?sourceType=PAYMENT&type=OUTFLOW&corporateApPayments=true";

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
  if (!gate.isEnabled("AP") || !can(current.tenantCtx.roles, "VIEW", "AP")) {
    redirect("/finanzas");
  }

  const canEditAp = can(current.tenantCtx.roles, "EDIT", "AP");
  const canTreasury =
    gate.isEnabled("TREASURY") && can(current.tenantCtx.roles, "VIEW", "TREASURY");

  const companies = await getCompanies(ctx);
  const companyId = ctx.companyId ?? companies[0]?.id;

  let overheadPanel: ReactNode = null;
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
      const initialAutoPreview =
        settings.overheadAllocationMode === "AUTO_WEIGHT"
          ? await getAutoWeightOverheadPreviewForPeriod(companyId, currentOverheadPeriod(), ctx)
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
      if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gastos generales</h1>
          <p className="text-sm text-muted-foreground max-w-prose">
            Facturas corporativas sin proyecto, imputación de GG a obra (manual, % empresa o
            prorrateo automático por peso del CD) y flujo de pago desde tesorería.
          </p>
        </div>
        <PageBackLink href="/finanzas" label="Resumen Finanzas" />
      </div>

      {overheadPanel}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Asistente de facturas corporativas</CardTitle>
          <CardDescription>
            Cargá gastos sin proyecto, emití la cuenta por pagar y pagá desde tesorería.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <span className="font-medium text-foreground">Crear borrador</span> — proveedor, líneas
              y fechas.
            </li>
            <li>
              <span className="font-medium text-foreground">Emitir factura</span> — genera la cuenta
              por pagar corporativa.
            </li>
            <li>
              <span className="font-medium text-foreground">Pagar</span> — desde cuentas por pagar
              de empresa.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            {canEditAp ? (
              <Button asChild>
                <Link href="/finanzas/gastos-generales/nueva">Nueva factura de gasto</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/finanzas/facturas-proveedor">Ver facturas empresa</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/finanzas/transacciones?tab=obligaciones">Obligaciones pendientes</Link>
            </Button>
          </div>
        </CardContent>
        {canTreasury ? (
          <CardFooter className="border-t bg-muted/20">
            <Button asChild variant="secondary" size="sm">
              <Link href={MOVIMIENTOS_CORP}>Ver movimientos de tesorería (pagos corporativos)</Link>
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </PageShell>
  );
}
