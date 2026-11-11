import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isFiscalDocumentKind } from "@bloqer/domain";
import { canEditCompanyAr, listCompanySalesInvoices, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { Pagination } from "@/components/ui/pagination";
import {
  SalesInvoiceListFilters,
  SalesInvoiceListSection,
  type SalesInvoiceListItem,
} from "@/features/sales-invoices";
import { NewCompanyFiscalNoteDialog } from "@/features/finance/components/new-company-fiscal-note-dialog";
import { getCurrentUser } from "@/lib/auth";
import { parsePage } from "@/lib/parse-page";

const PAGE_SIZE = 20;
const STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;
const STATUS_LABELS = { DRAFT: "Borradores", ISSUED: "Emitidas", CANCELLED: "Anuladas" };

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; kind?: string; status?: string }>;
}

export default async function CompanySalesInvoicesPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const documentKind = isFiscalDocumentKind(sp.kind) ? sp.kind : undefined;
  const status = STATUSES.find((value) => value === sp.status);
  const search = sp.search?.trim() || undefined;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let result;
  try {
    result = await listCompanySalesInvoices(ctx, {
      page,
      pageSize: PAGE_SIZE,
      search,
      documentKind,
      status,
      includeCancelled: !status,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }
  const items: SalesInvoiceListItem[] = result.data;
  const canCreate = canEditCompanyAr(ctx.roles);
  function statusHref(value?: string) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (documentKind) params.set("kind", documentKind);
    if (value) params.set("status", value);
    const query = params.toString();
    return `/finanzas/facturas${query ? `?${query}` : ""}`;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comprobantes de venta</h1>
          <p className="text-sm text-muted-foreground">Empresa · facturas, notas de crédito y notas de débito</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <ListViewToggle storageKey="finanzas-facturas" />
          </Suspense>
          <Button asChild variant="outline" size="sm">
            <Link href="/finanzas/cuentas-por-cobrar">Ver cuentas por cobrar</Link>
          </Button>
          {canCreate ? (
            <>
              <NewCompanyFiscalNoteDialog kind="CREDIT_NOTE" scope="company-ar" />
              <NewCompanyFiscalNoteDialog kind="DEBIT_NOTE" scope="company-ar" />
            </>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Las notas se vinculan a una factura emitida de la empresa. La nota de crédito reduce su saldo;
        la nota de débito genera una nueva cuenta por cobrar. Ninguna registra un cobro.
      </p>
      <div className="flex flex-wrap gap-2" aria-label="Estado del comprobante">
        <Button asChild variant={!status ? "secondary" : "outline"} size="sm">
          <Link href={statusHref()}>Todos los estados</Link>
        </Button>
        {STATUSES.map((value) => (
          <Button key={value} asChild variant={status === value ? "secondary" : "outline"} size="sm">
            <Link href={statusHref(value)}>{STATUS_LABELS[value]}</Link>
          </Button>
        ))}
      </div>
      <Suspense fallback={null}>
        <SalesInvoiceListFilters company />
      </Suspense>
      <Suspense fallback={<ListSectionSkeleton />}>
        <SalesInvoiceListSection
          invoices={items}
          projectId={null}
          emptyTitle="Sin comprobantes de venta"
          emptyDescription={search || documentKind || status
            ? "Probá otra búsqueda, tipo de documento o estado."
            : "Las facturas de ingresos de empresa y sus notas de crédito o débito aparecen acá."}
        />
      </Suspense>
      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
      </Suspense>
    </PageShell>
  );
}
