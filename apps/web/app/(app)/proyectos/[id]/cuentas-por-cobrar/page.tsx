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
  ReceivableListSection,
  SalesInvoiceListSection,
  type ReceivableListItem,
  type SalesInvoiceListItem,
} from "@/features/sales-invoices";
import { CollectionListSection, type CollectionListItem } from "@/features/collections";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectShellInfo,
  getReceivableAgingReport,
  listCollectionsByProject,
  listInvoicesByProject,
  listReceivablesByProject,
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

export default async function CuentasPorCobrarPage({ params, searchParams }: PageProps) {
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

  let receivablesResult;
  let agingReport;
  try {
    [receivablesResult, agingReport] = await Promise.all([
      listReceivablesByProject(id, ctx, { page, pageSize: PAGE_SIZE }),
      getReceivableAgingReport(parseAgingFilters({ ...sp, projectId: id }), ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${id}`);
    throw err;
  }

  const [invoicesRes, collectionsRes] = await Promise.allSettled([
    listInvoicesByProject(id, ctx, { page: 1, pageSize: RELATED_PAGE_SIZE }),
    listCollectionsByProject(id, ctx, { page: 1, pageSize: RELATED_PAGE_SIZE }),
  ]);

  const invoicesResult = invoicesRes.status === "fulfilled" ? invoicesRes.value : { data: [], total: 0 };
  const collectionsResult =
    collectionsRes.status === "fulfilled" ? collectionsRes.value : { data: [], total: 0 };

  const receivables = receivablesResult.data;
  const receivablesTotal = receivablesResult.total;

  const items: ReceivableListItem[] = receivables.map((r) => ({
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
  }));
  const invoices: SalesInvoiceListItem[] = invoicesResult.data.map((inv) => ({
    id: inv.id,
    projectId: inv.projectId,
    code: inv.code,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    clientName: inv.clientName,
  }));
  const collections: CollectionListItem[] = collectionsResult.data.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    collectionDate: c.collectionDate,
    accountName: c.accountName,
    currency: c.currency,
    amount: c.amount,
    notes: c.notes,
    status: c.status,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Cuentas por cobrar"
        subtitle={`Aging + ${receivablesTotal} ${receivablesTotal === 1 ? "cuenta" : "cuentas"} del proyecto`}
        actions={
          <Suspense fallback={null}>
            <ListViewToggle storageKey={`cuentas-por-cobrar-${id}`} />
          </Suspense>
        }
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Al {agingReport.asOfDate}</p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/facturas`}>Ver facturas</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/cobranzas`}>Ver cobranzas</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/certificaciones`}>Ver certificaciones</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/reportes/ingresos-gastos`}>Ingresos vs gastos</Link>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Esta vista concentra antiguedad de deuda y riesgo de cobro; facturas/cobranzas mantienen el detalle transaccional.
      </p>

      <AgingFilters />
      <AgingSummaryCards report={agingReport} currency={sp.currency} />
      <AgingTable report={agingReport} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transacciones relacionadas</CardTitle>
          <CardDescription>Últimos comprobantes y cobranzas para navegar sin salir del contexto financiero.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Facturas recientes</h3>
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href={`/proyectos/${id}/facturas`}>Ver todas</Link>
              </Button>
            </div>
            <Suspense fallback={<ListSectionSkeleton />}>
              <SalesInvoiceListSection invoices={invoices} projectId={id} />
            </Suspense>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Cobranzas recientes</h3>
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href={`/proyectos/${id}/cobranzas`}>Ver todas</Link>
              </Button>
            </div>
            <Suspense fallback={<ListSectionSkeleton />}>
              <CollectionListSection collections={collections} projectId={id} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={<ListSectionSkeleton />}>
        <ReceivableListSection receivables={items} projectId={id} />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={receivablesTotal} />
      </Suspense>
    </PageShell>
  );
}
