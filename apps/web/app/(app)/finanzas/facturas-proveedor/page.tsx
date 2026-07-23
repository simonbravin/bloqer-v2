import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import {
  NewCompanySupplierInvoiceDialog,
  SupplierInvoiceListFilters,
  SupplierInvoiceListSection,
  type SupplierInvoiceListItem,
  type SupplierOption,
} from "@/features/ap";
import { ReportExportActions } from "@/features/reports";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import { listCompanySupplierInvoices, listContacts, ServiceError } from "@bloqer/services";
import { Pagination } from "@/components/ui/pagination";
import { PageShell } from "@/components/layout/page-shell";

const PAGE_SIZE = 20;
const STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;

interface PageProps {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    create?: string;
    search?: string;
    sort?: string;
    dir?: string;
    view?: string;
  }>;
}

export default async function FinanzasFacturasProveedorPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const status =
    sp.status && (STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof STATUSES)[number])
      : undefined;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
  const canCreateInvoice = can(ctx.roles, "EDIT", "AP");

  let result;
  let suppliersResult = null;
  try {
    result = await listCompanySupplierInvoices(ctx, {
      status,
      issueDateFrom: sp.from,
      issueDateTo: sp.to,
      search: sp.search,
      sortDir: sp.dir === "asc" ? "asc" : "desc",
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  if (canCreateInvoice) {
    try {
      suppliersResult = await listContacts(
        { role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 },
        ctx,
      );
    } catch {
      // VIEW DIRECTORY may be missing; keep invoice list, create dialog without suppliers
    }
  }

  const items: SupplierInvoiceListItem[] = result.data.map((inv) => ({
    id: inv.id,
    code: inv.code,
    supplierName: inv.supplierName,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    status: inv.status,
    payableId: inv.payable?.id ?? null,
    payableStatus: inv.payable?.status ?? null,
  }));
  const suppliers: SupplierOption[] = (suppliersResult?.data ?? []).map((contact) => ({
    id: contact.id,
    label: contact.fantasyName ?? contact.legalName,
  }));

  function q(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (next.status) p.set("status", next.status);
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
    if (next.search) p.set("search", next.search);
    if (next.dir) p.set("dir", next.dir);
    if (next.sort) p.set("sort", next.sort);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturas y gastos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <ListViewToggle storageKey="finanzas-facturas-proveedor" />
          </Suspense>
          <ReportExportActions
            exportPath="/api/reports/finanzas/facturas-proveedor-corporativo.csv"
            params={{ status: status ?? "ALL", from: sp.from, to: sp.to }}
            pdf
            label="Exportar"
          />
          {canCreateInvoice ? (
            <Suspense fallback={null}>
              <NewCompanySupplierInvoiceDialog
                suppliers={suppliers}
                defaultOpen={sp.create === "1"}
                storageConfigured={isStorageConfigured()}
              />
            </Suspense>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Estado:</span>
        <Button asChild variant={!status ? "secondary" : "outline"} size="sm">
          <Link href={`/finanzas/facturas-proveedor${q({ from: sp.from, to: sp.to, search: sp.search, dir: sp.dir, sort: sp.sort })}`}>
            Todas
          </Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
            <Link
              href={`/finanzas/facturas-proveedor${q({ status: s, from: sp.from, to: sp.to, search: sp.search, dir: sp.dir, sort: sp.sort })}`}
            >
              {s === "DRAFT" ? "Borrador" : s === "ISSUED" ? "Emitidas" : "Anuladas"}
            </Link>
          </Button>
        ))}
      </div>

      <Suspense fallback={null}>
        <SupplierInvoiceListFilters />
      </Suspense>

      {items.length === 0 ? (
        <div className="rounded-lg border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          <p>No hay facturas con los filtros actuales.</p>
        </div>
      ) : (
        <Suspense fallback={<ListSectionSkeleton />}>
          <SupplierInvoiceListSection
            invoices={items}
            hrefPrefix="/finanzas/facturas-proveedor"
            payableHrefPrefix="/finanzas/cuentas-por-pagar"
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
      </Suspense>
    </PageShell>
  );
}
