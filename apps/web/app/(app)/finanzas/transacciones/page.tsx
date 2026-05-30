import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { Pagination } from "@/components/ui/pagination";
import { TransaccionesDateFilters } from "@/features/finance/components/transacciones-date-filters";
import { TransaccionesTabNav } from "@/features/finance/components/transacciones-tab-nav";
import { NewTransactionDialog } from "@/features/finance/components/new-transaction-dialog";
import { ReportExportActions } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import {
  PayableListSection,
  SupplierInvoiceListSection,
  type PayableListItem,
  type SupplierInvoiceListItem,
} from "@/features/ap";
import { MovementFilters, MovementLedgerTable } from "@/features/treasury-reports";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { canViewCompanyAp } from "@bloqer/services";
import {
  getTenantModuleGate,
  listFinancialActivity,
  listContacts,
  listTreasuryAccounts,
  ServiceError,
  type MovementReportRow,
} from "@bloqer/services";

const PAGE_SIZE = 20;
const CASH_DEFAULT_RANGE_DAYS = 90;
const TABS = ["caja", "operaciones", "obligaciones"] as const;
type Tab = (typeof TABS)[number];

const PAYABLE_STATUSES = ["OPEN", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const;
const INVOICE_STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;

interface PageProps {
  searchParams: Promise<{
    tab?: string;
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
    corporateApPayments?: string;
  }>;
}

function resolveTab(raw?: string): Tab {
  if (raw && (TABS as readonly string[]).includes(raw)) return raw as Tab;
  return "caja";
}

function defaultCashDateRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - CASH_DEFAULT_RANGE_DAYS);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

function movementExportParams(sp: Awaited<PageProps["searchParams"]>): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {
    accountId: sp.accountId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    type: sp.type,
    sourceType: sp.sourceType,
    currency: sp.currency,
    includeInternalTransfers: sp.includeInternalTransfers,
    corporateApPayments: sp.corporateApPayments,
  };
  if (!params.accountId && (!params.dateFrom || !params.dateTo)) {
    const defaults = defaultCashDateRange();
    params.dateFrom = params.dateFrom ?? defaults.dateFrom;
    params.dateTo = params.dateTo ?? defaults.dateTo;
  }
  return params;
}

export default async function FinanzasTransaccionesPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const tab = resolveTab(sp.tab);
  const page = Math.max(1, Number(sp.page ?? 1));

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const gate = await getTenantModuleGate(ctx);
  const canTreasury = gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY");
  const canAp = gate.isEnabled("AP") && canViewCompanyAp(ctx.roles);

  const canEditAp = gate.isEnabled("AP") && can(ctx.roles, "EDIT", "AP");
  const canEditTreasury = gate.isEnabled("TREASURY") && can(ctx.roles, "EDIT", "TREASURY");

  let suppliersForDialog: { id: string; label: string }[] = [];
  let treasuryAccountsForDialog: { id: string; label: string; currency: string }[] = [];

  if (canEditAp || canEditTreasury) {
    try {
      if (canEditAp) {
        const suppliersResult = await listContacts(
          { role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 },
          ctx,
        );
        suppliersForDialog = suppliersResult.data.map((c) => ({
          id: c.id,
          label: c.fantasyName ?? c.legalName,
        }));
      }
      if (canEditTreasury) {
        const accountsResult = await listTreasuryAccounts(ctx, { page: 1, pageSize: 200 });
        treasuryAccountsForDialog = accountsResult.data
          .filter(
            (a) =>
              a.status === "ACTIVE" &&
              (!ctx.companyId || a.companyId === ctx.companyId),
          )
          .map((a) => ({ id: a.id, label: a.name, currency: a.currency }));
      }
    } catch {
      // omit dialog data on failure
    }
  }

  if (!canTreasury && !canAp) redirect("/dashboard");

  const tabLinks = [
    ...(canTreasury
      ? [{ href: "/finanzas/transacciones?tab=caja", label: "Caja", title: "Movimientos de tesorería" }]
      : []),
    ...(canAp
      ? [
          {
            href: "/finanzas/transacciones?tab=operaciones",
            label: "Operaciones",
            title: "Facturas y gastos corporativos",
          },
          {
            href: "/finanzas/transacciones?tab=obligaciones",
            label: "Obligaciones",
            title: "Cuentas por pagar pendientes",
          },
        ]
      : []),
  ];

  const activeTab =
    tab === "caja" && canTreasury
      ? "caja"
      : tab === "operaciones" && canAp
        ? "operaciones"
        : tab === "obligaciones" && canAp
          ? "obligaciones"
          : canTreasury
            ? "caja"
            : "operaciones";

  if (!sp.tab || (sp.tab === "caja" && !canTreasury) || ((sp.tab === "operaciones" || sp.tab === "obligaciones") && !canAp)) {
    const canonical = new URLSearchParams();
    canonical.set("tab", activeTab);
    redirect(`/finanzas/transacciones?${canonical.toString()}`);
  }

  function tabQuery(nextTab: Tab, extra?: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    p.set("tab", nextTab);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v) p.set(k, v);
      }
    }
    return `?${p.toString()}`;
  }

  const showAllPayableStates = sp.status === "ALL";
  const payableStatus =
    sp.status && !showAllPayableStates && (PAYABLE_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof PAYABLE_STATUSES)[number])
      : undefined;
  const pendingPayablesOnly = !showAllPayableStates && !payableStatus;

  const invoiceStatus =
    sp.status && (INVOICE_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof INVOICE_STATUSES)[number])
      : undefined;

  let movementTotal = 0;
  let movementRows: MovementReportRow[] = [];
  let payables: PayableListItem[] = [];
  let payablesTotal = 0;
  let invoices: SupplierInvoiceListItem[] = [];
  let invoicesTotal = 0;

  try {
    if (activeTab === "caja" && canTreasury) {
      const result = await listFinancialActivity(ctx, {
        grain: "CASH",
        scope: "COMPANY",
        accountId: sp.accountId || undefined,
        dateFrom: sp.dateFrom || undefined,
        dateTo: sp.dateTo || undefined,
        type: sp.type || undefined,
        sourceType: sp.sourceType || undefined,
        currency: sp.currency || undefined,
        includeInternalTransfers: sp.includeInternalTransfers === "false" ? false : true,
        corporateApPaymentsOnly: sp.corporateApPayments === "true",
        page,
        pageSize: PAGE_SIZE,
      });
      if (result.grain === "CASH") {
        movementRows = result.data;
        movementTotal = result.total;
      }
    }

    if (activeTab === "obligaciones" && canAp) {
      const result = await listFinancialActivity(ctx, {
        grain: "OBLIGATIONS",
        scope: "COMPANY",
        status: payableStatus,
        pendingOnly: pendingPayablesOnly,
        dueDateFrom: sp.from,
        dueDateTo: sp.to,
        page,
        pageSize: PAGE_SIZE,
      });
      if (result.grain === "OBLIGATIONS") {
        payablesTotal = result.total;
        payables = result.data.map((p) => ({
          id: p.id,
          supplierName: p.supplierName,
          dueDate: p.dueDate,
          status: p.status,
          originalAmount: p.originalAmount,
          paidAmount: p.paidAmount,
          balanceDue: p.balanceDue,
          currency: p.currency,
          supplierInvoiceId: p.supplierInvoiceId,
          supplierInvoiceCode: p.supplierInvoiceCode,
        }));
      }
    }

    if (activeTab === "operaciones" && canAp) {
      const result = await listFinancialActivity(ctx, {
        grain: "OPERATIONS",
        scope: "COMPANY",
        status: invoiceStatus ?? "ISSUED",
        issueDateFrom: sp.from,
        issueDateTo: sp.to,
        page,
        pageSize: PAGE_SIZE,
      });
      if (result.grain === "OPERATIONS") {
        invoicesTotal = result.total;
        invoices = result.data.map((inv) => ({
          id: inv.id,
          code: inv.code,
          supplierName: inv.supplierName,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          totalAmount: inv.totalAmount,
          currency: inv.currency,
          status: inv.status,
        }));
      }
    }
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const treasuryQs = new URLSearchParams();
  if (sp.accountId) treasuryQs.set("accountId", sp.accountId);
  if (sp.dateFrom) treasuryQs.set("dateFrom", sp.dateFrom);
  if (sp.dateTo) treasuryQs.set("dateTo", sp.dateTo);
  if (sp.type) treasuryQs.set("type", sp.type);
  if (sp.sourceType) treasuryQs.set("sourceType", sp.sourceType);
  if (sp.currency) treasuryQs.set("currency", sp.currency);
  if (sp.includeInternalTransfers === "false") treasuryQs.set("includeInternalTransfers", "false");
  if (sp.corporateApPayments === "true") treasuryQs.set("corporateApPayments", "true");
  const treasuryHref = `/tesoreria/reportes/movimientos${treasuryQs.size ? `?${treasuryQs}` : ""}`;

  const statusLabel: Record<string, string> = {
    OPEN: "Abiertas",
    PARTIAL: "Parcial",
    PAID: "Pagadas",
    OVERDUE: "Vencidas",
    CANCELLED: "Canceladas",
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transacciones</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Vista unificada de caja, operaciones y obligaciones de la empresa sin imputar a obra.{" "}
            <Link href="/finanzas" className="underline underline-offset-2 text-foreground">
              Indicadores y proyección en Resumen
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(canEditAp || canEditTreasury) && (
            <NewTransactionDialog
              suppliers={suppliersForDialog}
              treasuryAccounts={treasuryAccountsForDialog}
              canAp={canEditAp}
              canTreasury={canEditTreasury}
            />
          )}
          <Suspense fallback={null}>
            <ListViewToggle storageKey={`finanzas-transacciones-${activeTab}`} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}><TransaccionesTabNav links={tabLinks} defaultTab={activeTab} /></Suspense>

      {activeTab === "caja" && canTreasury && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Últimos movimientos confirmados (rango por defecto: 90 días si no filtrás fechas).
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
              <MovementFilters preserveParams={["tab"]} />
            </Suspense>
          </div>

          <div className="text-sm text-muted-foreground">
            {movementTotal} movimiento{movementTotal !== 1 ? "s" : ""} encontrado{movementTotal !== 1 ? "s" : ""}.
          </div>

          <MovementLedgerTable rows={movementRows} showRunningBalance={false} canEditAccounting={false} />

          <Suspense fallback={null}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={movementTotal} />
          </Suspense>
        </>
      )}

      {activeTab === "operaciones" && canAp && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Facturas de proveedor corporativas emitidas. Para borradores o alta, usá{" "}
              <Link href="/finanzas/facturas-proveedor" className="underline underline-offset-2 text-foreground">
                Facturas y gastos
              </Link>
              .
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ReportExportActions
                exportPath="/api/reports/finanzas/facturas-proveedor-corporativo.csv"
                params={{
                  status: invoiceStatus ?? "ISSUED",
                  from: sp.from,
                  to: sp.to,
                }}
                pdf
              />
              <Button asChild variant="outline" size="sm">
                <Link href="/finanzas/facturas-proveedor/nueva">Nueva factura</Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Estado:</span>
            {INVOICE_STATUSES.map((s) => (
              <Button
                key={s}
                asChild
                variant={(invoiceStatus ?? "ISSUED") === s ? "secondary" : "outline"}
                size="sm"
              >
                <Link
                  href={`/finanzas/transacciones${tabQuery("operaciones", {
                    status: s,
                    from: sp.from,
                    to: sp.to,
                  })}`}
                >
                  {s === "DRAFT" ? "Borrador" : s === "ISSUED" ? "Emitidas" : "Anuladas"}
                </Link>
              </Button>
            ))}
          </div>

          <Suspense fallback={null}>
            <TransaccionesDateFilters preserveParams={["tab", "status"]} />
          </Suspense>

          {invoices.length === 0 ? (
            <div className="rounded-lg border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
              No hay facturas con los filtros actuales.
            </div>
          ) : (
            <Suspense fallback={<ListSectionSkeleton />}>
              <SupplierInvoiceListSection
                invoices={invoices}
                hrefPrefix="/finanzas/facturas-proveedor"
              />
            </Suspense>
          )}

          <Suspense fallback={null}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={invoicesTotal} />
          </Suspense>
        </>
      )}

      {activeTab === "obligaciones" && canAp && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Obligaciones pendientes de empresa. Para aging y saldos por proveedor, ver{" "}
              <Link
                href="/finanzas/cuentas-por-pagar-aging"
                className="underline underline-offset-2 text-foreground"
              >
                Cuentas por pagar
              </Link>
              .
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ReportExportActions
                exportPath="/api/reports/finanzas/cxp-corporativo.csv"
                params={{
                  status: showAllPayableStates ? "ALL" : payableStatus,
                  from: sp.from,
                  to: sp.to,
                }}
                pdf
              />
              <Button asChild variant="outline" size="sm">
                <Link href="/finanzas/pagos-proveedor">Ver pagos registrados</Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Estado:</span>
            <Button
              asChild
              variant={pendingPayablesOnly ? "secondary" : "outline"}
              size="sm"
            >
              <Link href={`/finanzas/transacciones${tabQuery("obligaciones", { from: sp.from, to: sp.to })}`}>
                Pendientes
              </Link>
            </Button>
            <Button asChild variant={showAllPayableStates ? "secondary" : "outline"} size="sm">
              <Link
                href={`/finanzas/transacciones${tabQuery("obligaciones", {
                  status: "ALL",
                  from: sp.from,
                  to: sp.to,
                })}`}
              >
                Todos los estados
              </Link>
            </Button>
            {PAYABLE_STATUSES.map((s) => (
              <Button key={s} asChild variant={payableStatus === s ? "secondary" : "outline"} size="sm">
                <Link
                  href={`/finanzas/transacciones${tabQuery("obligaciones", {
                    status: s,
                    from: sp.from,
                    to: sp.to,
                  })}`}
                >
                  {statusLabel[s] ?? s}
                </Link>
              </Button>
            ))}
          </div>

          <Suspense fallback={null}>
            <TransaccionesDateFilters preserveParams={["tab", "status"]} />
          </Suspense>

          <Suspense fallback={<ListSectionSkeleton />}>
            <PayableListSection
              payables={payables}
              hrefPrefix="/finanzas/cuentas-por-pagar"
              supplierInvoiceHrefPrefix="/finanzas/facturas-proveedor"
            />
          </Suspense>

          <Suspense fallback={null}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={payablesTotal} />
          </Suspense>
        </>
      )}
    </PageShell>
  );
}
