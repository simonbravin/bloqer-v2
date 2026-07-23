import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { TransaccionesDateFilters } from "@/features/finance/components/transacciones-date-filters";
import { ReceivableListSection, type ReceivableListItem } from "@/features/sales-invoices";
import { AgingSummaryCards, AgingFilters, AgingTable } from "@/features/aging";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { getCurrentUser } from "@/lib/auth";
import {
  getReceivableAgingReport,
  listCompanyReceivables,
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
    sort?: string;
    dir?: string;
  }>;
}

export default async function FinanzasCuentasPorCobrarPage({ searchParams }: PageProps) {
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
      getReceivableAgingReport(parseAgingFilters(sp), ctx),
      listCompanyReceivables(ctx, {
        status,
        pendingOnly,
        dueDateFrom: sp.from,
        dueDateTo: sp.to,
        search: sp.search,
        sortDir: sp.dir === "desc" ? "desc" : "asc",
        page,
        pageSize: PAGE_SIZE,
      }),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const items: ReceivableListItem[] = listResult.data.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    salesInvoiceId: r.salesInvoiceId,
    dueDate: r.dueDate,
    status: r.status,
    originalAmount: r.originalAmount,
    paidAmount: r.paidAmount,
    balanceDue: r.balanceDue,
    currency: r.currency,
    clientName: r.clientName,
    projectCode: r.projectCode,
    projectName: r.projectName,
    salesInvoiceCode: r.salesInvoiceCode,
  }));

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
    PAID: "Cobradas",
    OVERDUE: "Vencidas",
    CANCELLED: "Canceladas",
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cuentas por cobrar</h1>
          <p className="text-xs text-muted-foreground">Al {agingReport.asOfDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportActions exportPath="/api/reports/finanzas/ar-aging.csv" params={sp} pdf />
          <ReportEmailSendDialog
            reportType="AR_AGING"
            supportsPdf
            params={sp}
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
              <CardTitle className="text-lg">Detalle</CardTitle>
            </div>
            <Suspense fallback={null}>
              <ListViewToggle storageKey="finanzas-cuentas-por-cobrar" />
            </Suspense>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Estado:</span>
            <Button asChild variant={pendingOnly ? "secondary" : "outline"} size="sm">
              <Link href={`/finanzas/cuentas-por-cobrar${listHref()}`}>Pendientes</Link>
            </Button>
            <Button asChild variant={showAllStates ? "secondary" : "outline"} size="sm">
              <Link href={`/finanzas/cuentas-por-cobrar${listHref("ALL")}`}>
                Todos los estados
              </Link>
            </Button>
            {STATUSES.map((s) => (
              <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
                <Link href={`/finanzas/cuentas-por-cobrar${listHref(s)}`}>
                  {statusLabel[s] ?? s}
                </Link>
              </Button>
            ))}
          </div>

          <Suspense fallback={null}>
            <TransaccionesDateFilters
              preserveParams={[
                "status",
                "search",
                "currency",
                "bucket",
                "asOfDate",
                "contactId",
                "includePaid",
              ]}
            />
          </Suspense>

          <Suspense fallback={<ListSectionSkeleton />}>
            <ReceivableListSection
              receivables={items}
              showProjectColumn
              invoicesHref="/proyectos"
              invoicesActionLabel="Ir a proyectos"
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
