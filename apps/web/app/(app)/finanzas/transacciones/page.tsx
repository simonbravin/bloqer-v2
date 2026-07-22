import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { NewTransactionDialog } from "@/features/finance/components/new-transaction-dialog";
import { ReportExportActions } from "@/features/reports";
import { MovementFilters, MovementLedgerTable } from "@/features/treasury-reports";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  canViewCompanyAp,
  DEFAULT_CASH_DATE_RANGE_DAYS,
  DEFAULT_PAGE_SIZE,
  defaultDateRangeDays,
  getAccountMovementReport,
  getTenantModuleGate,
  listContacts,
  listProjects,
  listTreasuryAccounts,
  parseMovementReportFilters,
  ServiceError,
  type MovementReportRow,
} from "@bloqer/services";

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    view?: string;
    page?: string;
    status?: string;
    from?: string;
    to?: string;
    dateFrom?: string;
    dateTo?: string;
    accountId?: string;
    type?: string;
    sourceType?: string;
    currency?: string;
    includeInternalTransfers?: string;
    scope?: string;
    projectId?: string;
    register?: string;
  }>;
}

function wantsRegisterAp(sp: Awaited<PageProps["searchParams"]>): boolean {
  return sp.register === "ap";
}

function movementExportParams(sp: Awaited<PageProps["searchParams"]>): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {
    accountId: sp.accountId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    type: sp.type,
    sourceType: sp.sourceType,
    currency: sp.currency,
    scope: sp.scope,
    projectId: sp.projectId,
    includeInternalTransfers: sp.includeInternalTransfers ?? "false",
  };
  if (!params.accountId && (!params.dateFrom || !params.dateTo)) {
    const defaults = defaultDateRangeDays(DEFAULT_CASH_DATE_RANGE_DAYS);
    params.dateFrom = params.dateFrom ?? defaults.dateFrom;
    params.dateTo = params.dateTo ?? defaults.dateTo;
  }
  return params;
}

function buildMovementFilters(
  sp: Awaited<PageProps["searchParams"]>,
  page: number,
): Parameters<typeof getAccountMovementReport>[0] {
  const parsed = parseMovementReportFilters(sp);
  const defaults = defaultDateRangeDays(DEFAULT_CASH_DATE_RANGE_DAYS);
  return {
    ...parsed,
    includeInternalTransfers: sp.includeInternalTransfers === "true",
    dateFrom: sp.dateFrom || defaults.dateFrom,
    dateTo: sp.dateTo || defaults.dateTo,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

export default async function FinanzasTransaccionesPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const gate = await getTenantModuleGate(ctx);
  const treasuryModuleOn = gate.isEnabled("TREASURY");
  const canTreasury = treasuryModuleOn && can(ctx.roles, "VIEW", "TREASURY");
  const canAp = gate.isEnabled("AP") && canViewCompanyAp(ctx.roles);
  const canViewProjects = gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS");
  const canEditAr = gate.isEnabled("AR") && can(ctx.roles, "EDIT", "AR");
  const canViewAr = gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR");

  if (!canTreasury && !canAp && !canViewAr) redirect("/dashboard");

  if (sp.tab || sp.view || sp.status || sp.from || sp.to) {
    const canonical = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (!value) continue;
      if (key === "tab" || key === "view" || key === "status" || key === "from" || key === "to") continue;
      canonical.set(key, value);
    }
    redirect(`/finanzas/transacciones?${canonical.toString()}`);
  }

  const canEditAp = gate.isEnabled("AP") && can(ctx.roles, "EDIT", "AP");
  const canEditTreasury = treasuryModuleOn && can(ctx.roles, "EDIT", "TREASURY");

  let suppliersForDialog: { id: string; label: string }[] = [];
  let clientsForDialog: { id: string; label: string }[] = [];
  let treasuryAccountsForDialog: { id: string; label: string; currency: string }[] = [];
  let projectOptions: { id: string; name: string }[] = [];

  if (canEditAp) {
    try {
      const suppliersResult = await listContacts(
        { role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 },
        ctx,
      );
      suppliersForDialog = suppliersResult.data.map((c) => ({
        id: c.id,
        label: c.fantasyName ?? c.legalName,
      }));
    } catch {
      // VIEW DIRECTORY may be missing; keep AP dialog usable without supplier list
    }
  }

  if (canEditTreasury || canEditAr) {
    try {
      const clientsResult = await listContacts(
        { role: "CLIENT", status: "ACTIVE", page: 1, pageSize: 200 },
        ctx,
      );
      clientsForDialog = clientsResult.data.map((c) => ({
        id: c.id,
        label: c.fantasyName ?? c.legalName,
      }));
    } catch {
      // VIEW DIRECTORY may be missing
    }
  }

  if (canEditTreasury) {
    try {
      const accountsResult = await listTreasuryAccounts(ctx, { page: 1, pageSize: 200 });
      treasuryAccountsForDialog = accountsResult.data
        .filter(
          (a) =>
            a.status === "ACTIVE" &&
            (!ctx.companyId || !a.companyId || a.companyId === ctx.companyId),
        )
        .map((a) => ({ id: a.id, label: a.name, currency: a.currency }));
    } catch {
      // omit accounts on failure
    }
  }

  if (canViewProjects) {
    try {
      const projectsResult = await listProjects(
        { status: "ACTIVE", page: 1, pageSize: 200 },
        ctx,
      );
      projectOptions = projectsResult.data.map((p) => ({ id: p.id, name: p.name }));
    } catch {
      // omit project filter options
    }
  }

  let movementTotal = 0;
  let movementRows: MovementReportRow[] = [];

  if (canTreasury) {
    try {
      const result = await getAccountMovementReport(buildMovementFilters(sp, page), ctx);
      movementRows = result.rows;
      movementTotal = result.total;
    } catch (err) {
      if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
      throw err;
    }
  }

  const treasuryQs = new URLSearchParams();
  if (sp.accountId) treasuryQs.set("accountId", sp.accountId);
  if (sp.dateFrom) treasuryQs.set("dateFrom", sp.dateFrom);
  if (sp.dateTo) treasuryQs.set("dateTo", sp.dateTo);
  if (sp.type) treasuryQs.set("type", sp.type);
  if (sp.sourceType) treasuryQs.set("sourceType", sp.sourceType);
  if (sp.currency) treasuryQs.set("currency", sp.currency);
  if (sp.scope) treasuryQs.set("scope", sp.scope);
  if (sp.projectId) treasuryQs.set("projectId", sp.projectId);
  const treasuryHref = `/tesoreria/reportes/movimientos${treasuryQs.size ? `?${treasuryQs}` : ""}`;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transacciones</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Ingresos y egresos de caja confirmados (obra y empresa). Para obligaciones pendientes ver{" "}
            <Link href="/finanzas/cuentas-por-pagar" className="underline underline-offset-2 text-foreground">
              Cuentas por pagar
            </Link>
            {" "}o{" "}
            <Link href="/finanzas/cuentas-por-cobrar" className="underline underline-offset-2 text-foreground">
              Cuentas por cobrar
            </Link>
            ; indicadores en{" "}
            <Link href="/finanzas" className="underline underline-offset-2 text-foreground">
              Resumen
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(canEditAp || canEditTreasury || canEditAr) && (
            <Suspense fallback={null}>
              <NewTransactionDialog
                suppliers={suppliersForDialog}
                clients={clientsForDialog}
                treasuryAccounts={treasuryAccountsForDialog}
                canAp={canEditAp}
                canTreasury={canEditTreasury}
                canAr={canEditAr}
                defaultOpen={wantsRegisterAp(sp)}
              />
            </Suspense>
          )}
        </div>
      </div>

      {canTreasury ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Movimientos confirmados (rango por defecto: {DEFAULT_CASH_DATE_RANGE_DAYS} días). Las transferencias
              internas se excluyen por defecto.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ReportExportActions
                exportPath="/api/reports/tesoreria/movimientos.csv"
                params={movementExportParams(sp)}
                pdf
              />
              <Button asChild variant="outline" size="sm">
                <Link href={treasuryHref}>Abrir en Tesorería</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <Suspense>
              <MovementFilters variant="finance" projects={projectOptions} />
            </Suspense>
          </div>

          <div className="text-sm text-muted-foreground">
            {movementTotal} movimiento{movementTotal !== 1 ? "s" : ""} encontrado{movementTotal !== 1 ? "s" : ""}.
          </div>

          <MovementLedgerTable
            rows={movementRows}
            showRunningBalance={false}
            showProjectColumn
            canLinkProjects={canViewProjects}
            canEditAccounting={false}
          />

          <Suspense fallback={null}>
            <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={movementTotal} />
          </Suspense>
        </>
      ) : (
        <div className="rounded-lg border bg-card px-6 py-8 space-y-4">
          <p className="text-sm text-muted-foreground">
            No tenés acceso al libro de caja consolidado. Podés registrar gastos o ingresos corporativos con el botón
            de arriba, o consultar:
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
            {canAp && (
              <>
                <li>
                  <Link href="/finanzas/cuentas-por-pagar" className="underline underline-offset-2 text-foreground">
                    Cuentas por pagar
                  </Link>
                </li>
                <li>
                  <Link
                    href="/finanzas/facturas-proveedor?status=DRAFT"
                    className="underline underline-offset-2 text-foreground"
                  >
                    Facturas borrador
                  </Link>
                </li>
              </>
            )}
            {treasuryModuleOn && !can(ctx.roles, "VIEW", "TREASURY") && (
              <li>Contactá a un administrador para permiso de Tesorería y ver movimientos de caja.</li>
            )}
            {!treasuryModuleOn && (
              <li>El módulo Tesorería no está habilitado para este tenant.</li>
            )}
          </ul>
        </div>
      )}
    </PageShell>
  );
}
