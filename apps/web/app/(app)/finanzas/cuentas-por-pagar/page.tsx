import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { TransaccionesDateFilters } from "@/features/finance/components/transacciones-date-filters";
import { PayableListSection } from "@/features/ap";
import type { PayableListItem } from "@/features/ap";
import { AgingSummaryCards, AgingFilters, AgingTable } from "@/features/aging";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { getCurrentUser } from "@/lib/auth";
import {
  getPayableAgingReport,
  listCompanyPayables,
  parseAgingFilters,
  ServiceError,
} from "@bloqer/services";
import { Pagination } from "@/components/ui/pagination";
import { PageShell } from "@/components/layout/page-shell";

const PAGE_SIZE = 20;
const STATUSES = ["OPEN", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const;

interface PageProps {
  searchParams: Promise<{
    search?: string;
    currency?: string;
    bucket?: string;
    asOfDate?: string;
    contactId?: string;
    includePaid?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    view?: string;
  }>;
}

export default async function FinanzasCuentasPorPagarPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const showAllStates = sp.status === "ALL";
  const status =
    sp.status && !showAllStates && (STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof STATUSES)[number])
      : undefined;
  const pendingOnly = !showAllStates && !status;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let agingReport;
  let listResult;
  try {
    [agingReport, listResult] = await Promise.all([
      getPayableAgingReport(
        { ...parseAgingFilters(sp), corporateOnly: true },
        ctx,
      ),
      listCompanyPayables(ctx, {
        status,
        pendingOnly,
        dueDateFrom: sp.from,
        dueDateTo: sp.to,
        page,
        pageSize: PAGE_SIZE,
      }),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const items: PayableListItem[] = listResult.data.map((p) => ({
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

  const exportParams = { ...sp, scope: "corporate" as const };
  const listExportParams: Record<string, string | undefined> = {
    status: showAllStates ? "ALL" : status,
    from: sp.from,
    to: sp.to,
  };

  function listHref(listStatus?: string) {
    const p = new URLSearchParams();
    if (sp.search) p.set("search", sp.search);
    if (sp.currency) p.set("currency", sp.currency);
    if (sp.bucket) p.set("bucket", sp.bucket);
    if (sp.asOfDate) p.set("asOfDate", sp.asOfDate);
    if (sp.contactId) p.set("contactId", sp.contactId);
    if (sp.includePaid) p.set("includePaid", sp.includePaid);
    if (listStatus) p.set("status", listStatus);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  const statusLabel: Record<string, string> = {
    OPEN: "Abiertas",
    PARTIAL: "Parcial",
    PAID: "Pagadas",
    OVERDUE: "Vencidas",
    CANCELLED: "Canceladas",
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cuentas por pagar</h1>
          <p className="text-xs text-muted-foreground">
            Obligaciones empresa (sin proyecto) · Al {agingReport.asOfDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/finanzas/pagos-proveedor">Pagos a proveedores</Link>
          </Button>
          <ReportExportActions
            exportPath="/api/reports/finanzas/ap-aging.csv"
            params={exportParams}
            pdf
            label="Exportar aging"
          />
          <ReportExportActions
            exportPath="/api/reports/finanzas/cxp-corporativo.csv"
            params={listExportParams}
            pdf
            label="Exportar listado"
          />
          <ReportEmailSendDialog
            reportType="AP_AGING"
            supportsPdf
            params={exportParams}
            defaultRecipientEmail={current.session.user?.email ?? null}
          />
        </div>
      </div>

      <AgingFilters preserveParams={["status", "from", "to", "page", "view"]} />
      <AgingSummaryCards report={agingReport} currency={sp.currency} />
      <AgingTable report={agingReport} />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Detalle de obligaciones</CardTitle>
              <CardDescription className="mt-1 max-w-prose">
                Facturas corporativas sin imputar a obra. Desde acá abrís el detalle y registrás pagos.
              </CardDescription>
            </div>
            <Suspense fallback={null}>
              <ListViewToggle storageKey="finanzas-cuentas-por-pagar" />
            </Suspense>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Estado:</span>
            <Button asChild variant={pendingOnly ? "secondary" : "outline"} size="sm">
              <Link href={`/finanzas/cuentas-por-pagar${listHref()}`}>Pendientes</Link>
            </Button>
            <Button asChild variant={showAllStates ? "secondary" : "outline"} size="sm">
              <Link href={`/finanzas/cuentas-por-pagar${listHref("ALL")}`}>
                Todos los estados
              </Link>
            </Button>
            {STATUSES.map((s) => (
              <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
                <Link href={`/finanzas/cuentas-por-pagar${listHref(s)}`}>
                  {statusLabel[s] ?? s}
                </Link>
              </Button>
            ))}
          </div>

          <Suspense fallback={null}>
            <TransaccionesDateFilters preserveParams={["status", "search", "currency", "bucket", "asOfDate", "contactId", "includePaid"]} />
          </Suspense>

          <Suspense fallback={<ListSectionSkeleton />}>
            <PayableListSection
              payables={items}
              hrefPrefix="/finanzas/cuentas-por-pagar"
              supplierInvoiceHrefPrefix="/finanzas/facturas-proveedor"
            />
          </Suspense>

          <Suspense fallback={null}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={listResult.total} />
          </Suspense>
        </CardContent>
      </Card>
    </PageShell>
  );
}
