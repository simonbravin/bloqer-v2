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
  LIST_AP_DIRECT_PAYEES,
  toApPayeeOption,
  type SupplierInvoiceListItem,
  type SupplierOption,
} from "@/features/ap";
import { ReportExportActions } from "@/features/reports";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import { listCompanySupplierInvoices, listAllContacts, getCompanyFiscalContext, canRegisterApPayment, ServiceError } from "@bloqer/services";
import { Pagination } from "@/components/ui/pagination";
import { PageShell } from "@/components/layout/page-shell";
import { parsePage } from "@/lib/parse-page";

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
    class?: string;
  }>;
}

export default async function FinanzasFacturasProveedorPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const page = parsePage(sp.page);
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
  const canRegisterPayment = canRegisterApPayment(ctx.roles);

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
      class: sp.class,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  if (canCreateInvoice) {
    try {
      suppliersResult = await listAllContacts(LIST_AP_DIRECT_PAYEES, ctx);
    } catch (err) {
      if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
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
    invoiceLetter: inv.invoiceLetter,
    classCode: inv.classCode,
    classLabel: inv.classLabel,
    classFamily: inv.classFamily,
  }));
  const suppliers: SupplierOption[] = (suppliersResult ?? []).map(toApPayeeOption);

  let companyCountry: string | null = null;
  let companyIvaCondition: string | null = null;
  try {
    const fiscal = await getCompanyFiscalContext(ctx);
    if (fiscal) {
      companyCountry = fiscal.country;
      companyIvaCondition = fiscal.ivaCondition;
    }
  } catch { /* defaults */ }

  function q(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (next.status) p.set("status", next.status);
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
    if (next.search) p.set("search", next.search);
    if (next.dir) p.set("dir", next.dir);
    if (next.sort) p.set("sort", next.sort);
    if (next.class) p.set("class", next.class);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  const hasExtraFilters = Boolean(sp.search?.trim() || sp.class || sp.from || sp.to);

  const emptyCopy = !status
    ? {
        title: hasExtraFilters ? "No hay facturas activas con estos filtros" : "No hay facturas activas",
        description: hasExtraFilters
          ? "Probá otra búsqueda, clase o rango. También podés revisar Anuladas."
          : "Usá Anuladas para ver las facturas anuladas, o registrá una nueva.",
        showCancelledCta: true,
      }
    : status === "CANCELLED"
      ? {
          title: hasExtraFilters ? "No hay facturas anuladas con estos filtros" : "No hay facturas anuladas",
          description: hasExtraFilters
            ? "Probá otra búsqueda, clase o rango de fechas."
            : "No hay comprobantes anulados.",
          showCancelledCta: false,
        }
      : {
          title: "No hay facturas con los filtros actuales",
          description: "Probá otro estado, clase o rango de fechas.",
          showCancelledCta: false,
        };

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
            params={{ status: status ?? "ACTIVE", from: sp.from, to: sp.to, class: sp.class }}
            pdf
            label="Exportar"
          />
          {canCreateInvoice ? (
            <Suspense fallback={null}>
              <NewCompanySupplierInvoiceDialog
                suppliers={suppliers}
                companyCountry={companyCountry}
                companyIvaCondition={companyIvaCondition}
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
          <Link
            href={`/finanzas/facturas-proveedor${q({ from: sp.from, to: sp.to, search: sp.search, dir: sp.dir, sort: sp.sort, class: sp.class })}`}
          >
            Activas
          </Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
            <Link
              href={`/finanzas/facturas-proveedor${q({ status: s, from: sp.from, to: sp.to, search: sp.search, dir: sp.dir, sort: sp.sort, class: sp.class })}`}
            >
              {s === "DRAFT" ? "Borrador" : s === "ISSUED" ? "Emitidas" : "Anuladas"}
            </Link>
          </Button>
        ))}
      </div>

      <Suspense fallback={null}>
        <SupplierInvoiceListFilters classFilterScope="supplier" />
      </Suspense>

      {items.length === 0 ? (
        <div className="rounded-lg border bg-card px-6 py-8 text-center text-sm text-muted-foreground space-y-3">
          <p className="font-medium text-foreground">{emptyCopy.title}</p>
          <p>{emptyCopy.description}</p>
          {!status && emptyCopy.showCancelledCta ? (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/finanzas/facturas-proveedor${q({ status: "CANCELLED", from: sp.from, to: sp.to, search: sp.search, dir: sp.dir, sort: sp.sort, class: sp.class })}`}
              >
                Ver anuladas
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <Suspense fallback={<ListSectionSkeleton />}>
          <SupplierInvoiceListSection
            invoices={items}
            hrefPrefix="/finanzas/facturas-proveedor"
            payableHrefPrefix="/finanzas/cuentas-por-pagar"
            canRegisterPayment={canRegisterPayment}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
      </Suspense>
    </PageShell>
  );
}
