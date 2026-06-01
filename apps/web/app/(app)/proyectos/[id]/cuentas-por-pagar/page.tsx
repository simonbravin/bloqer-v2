import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { AgingFilters, AgingSummaryCards, AgingTable } from "@/features/aging";
import {
  PayableListSection,
  SupplierInvoiceListSection,
  PaymentListSection,
  type PayableListItem,
  type SupplierInvoiceListItem,
  type PaymentListItem,
} from "@/features/ap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import {
  getPayableAgingReport,
  getProjectShellInfo,
  listPayablesByProject,
  listPaymentsByProject,
  listSupplierInvoicesByProject,
  parseAgingFilters,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { parsePage } from "@/lib/parse-page";

const PAGE_SIZE = 20;
const RELATED_PAGE_SIZE = 5;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    search?: string;
    currency?: string;
    bucket?: string;
    asOfDate?: string;
    contactId?: string;
    includePaid?: string;
  }>;
}

export default async function CuentasPorPagarPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let payablesResult;
  let agingReport;
  try {
    [payablesResult, agingReport] = await Promise.all([
      listPayablesByProject(id, ctx, { page, pageSize: PAGE_SIZE }),
      getPayableAgingReport(parseAgingFilters({ ...sp, projectId: id }), ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${id}`);
    throw err;
  }

  const [supplierInvoicesRes, paymentsRes] = await Promise.allSettled([
    listSupplierInvoicesByProject(id, ctx, { page: 1, pageSize: RELATED_PAGE_SIZE }),
    listPaymentsByProject(id, ctx, { page: 1, pageSize: RELATED_PAGE_SIZE }),
  ]);

  const supplierInvoicesResult =
    supplierInvoicesRes.status === "fulfilled" ? supplierInvoicesRes.value : { data: [], total: 0 };
  const paymentsResult = paymentsRes.status === "fulfilled" ? paymentsRes.value : { data: [], total: 0 };

  const payables = payablesResult.data;
  const payablesTotal = payablesResult.total;

  const items: PayableListItem[] = payables.map((p) => ({
    id: p.id,
    supplierName: p.supplierName,
    dueDate: p.dueDate,
    status: p.status,
    originalAmount: p.originalAmount,
    paidAmount: p.paidAmount,
    balanceDue: p.balanceDue,
    currency: p.currency,
  }));
  const supplierInvoices: SupplierInvoiceListItem[] = supplierInvoicesResult.data.map((inv) => ({
    id: inv.id,
    code: inv.code,
    supplierName: inv.supplierName,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    status: inv.status,
  }));
  const payments: PaymentListItem[] = paymentsResult.data.map((p) => ({
    id: p.id,
    paymentDate: p.paymentDate,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    accountName: p.accountName,
    supplierInvoiceId: p.supplierInvoiceId,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Cuentas por pagar"
        subtitle={`Aging + ${payablesTotal} ${payablesTotal === 1 ? "cuenta" : "cuentas"} del proyecto`}
        actions={
          <Suspense fallback={null}>
            <ListViewToggle storageKey={`cuentas-por-pagar-${id}`} />
          </Suspense>
        }
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Al {agingReport.asOfDate}</p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/facturas-proveedor`}>Ver facturas proveedor</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/pagos`}>Ver pagos</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/reportes/caja`}>Reporte de caja</Link>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Priorizá este tablero para vencimientos y riesgo de liquidez; usá facturas/pagos para el detalle operativo.
      </p>

      <AgingFilters />
      <AgingSummaryCards report={agingReport} currency={sp.currency} />
      <AgingTable report={agingReport} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transacciones relacionadas</CardTitle>
          <CardDescription>Últimos comprobantes y movimientos para contexto rápido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Facturas proveedor recientes</h3>
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href={`/proyectos/${id}/facturas-proveedor`}>Ver todas</Link>
              </Button>
            </div>
            <Suspense fallback={<ListSectionSkeleton />}>
              <SupplierInvoiceListSection
                invoices={supplierInvoices}
                hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
              />
            </Suspense>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Pagos recientes</h3>
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href={`/proyectos/${id}/pagos`}>Ver todos</Link>
              </Button>
            </div>
            <Suspense fallback={<ListSectionSkeleton />}>
              <PaymentListSection payments={payments} hrefPrefix={`/proyectos/${id}/pagos`} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={<ListSectionSkeleton />}>
        <PayableListSection
          payables={items}
          hrefPrefix={`/proyectos/${id}/cuentas-por-pagar`}
          supplierInvoiceHrefPrefix={`/proyectos/${id}/facturas-proveedor`}
        />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={payablesTotal} />
      </Suspense>
    </PageShell>
  );
}
