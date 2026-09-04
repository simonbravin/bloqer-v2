import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { ProjectFinanceListHeaderActions } from "@/features/projects/components/project-finance-list-header-actions";
import {
  NewProjectSupplierInvoiceDialog,
  SupplierInvoiceListFilters,
  SupplierInvoiceListSection,
  LIST_AP_DIRECT_PAYEES,
  toApPayeeOption,
  type InvoiceWbsOption,
  type POOption,
  type SupplierInvoiceListItem,
  type SupplierOption,
  type TreasuryAccountOption,
} from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getCompanyFiscalContext,
  getProjectShellInfo,
  getTenantModuleGate,
  listAllContacts,
  listLinkablePurchaseOrders,
  listProcurementWbsOptions,
  listSupplierInvoicesByProject,
  listSelectableTreasuryAccounts,
  canRegisterApPayment,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { parsePage } from "@/lib/parse-page";

const PAGE_SIZE = 20;
const STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    search?: string;
    sort?: string;
    dir?: string;
    view?: string;
    create?: string;
    error?: string;
    class?: string;
    status?: string;
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    costAnalysisLineId?: string;
    unit?: string;
    costType?: string;
    from?: string;
  }>;
}

export default async function FacturasProveedorPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
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

  let shell: Awaited<ReturnType<typeof getProjectShellInfo>>;
  try {
    shell = await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${id}`);
    throw err;
  }

  let invoicesResult;
  try {
    invoicesResult = await listSupplierInvoicesByProject(id, ctx, {
      page,
      pageSize: PAGE_SIZE,
      search: sp.search,
      sortDir: sp.dir === "asc" ? "asc" : "desc",
      class: sp.class,
      status,
    });
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const invoices = invoicesResult.data;
  const invoicesTotal = invoicesResult.total;

  const items: SupplierInvoiceListItem[] = invoices.map((inv) => ({
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

  const canCreateInvoice = can(ctx.roles, "EDIT", "AP");
  let suppliers: SupplierOption[] = [];
  let poOptions: POOption[] = [];
  let wbsOptions: InvoiceWbsOption[] = [];
  let treasuryAccounts: TreasuryAccountOption[] = [];
  let canPayNow = false;
  let companyCountry: string | null = null;
  let companyIvaCondition: string | null = null;

  if (canCreateInvoice) {
    const gate = await getTenantModuleGate(ctx);
    canPayNow = gate.isEnabled("TREASURY") && canRegisterApPayment(ctx.roles);

    try {
      const [suppliersResult, linkablePOs, wbsNodes] = await Promise.all([
        listAllContacts(LIST_AP_DIRECT_PAYEES, ctx),
        listLinkablePurchaseOrders(id, ctx),
        listProcurementWbsOptions(id, ctx),
      ]);
      suppliers = suppliersResult.map(toApPayeeOption);
      poOptions = linkablePOs.map((po) => ({
        id: po.id,
        code: po.code,
        supplierContactId: po.supplierContactId,
        currency: po.currency,
      }));
      wbsOptions = wbsNodes.map((n) => ({
        id: n.id,
        code: n.code,
        name: n.name,
        dominantCostType: n.dominantCostType,
      }));
      try {
        const fiscal = await getCompanyFiscalContext(ctx, shell.companyId);
        if (fiscal) {
          companyCountry = fiscal.country;
          companyIvaCondition = fiscal.ivaCondition;
        }
      } catch { /* defaults */ }
    } catch (err) {
      if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
      throw err;
    }

    if (canPayNow) {
      try {
        const accountsResult = await listSelectableTreasuryAccounts(ctx);
        treasuryAccounts = accountsResult
          .filter(
            (a) =>
              a.status === "ACTIVE" &&
              (!ctx.companyId || !a.companyId || a.companyId === ctx.companyId),
          )
          .map((a) => ({ id: a.id, label: a.name, currency: a.currency }));
      } catch {
        // omit accounts if VIEW TREASURY fails unexpectedly
      }
    }
  }

  function q(next: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (next.status) p.set("status", next.status);
    if (next.search) p.set("search", next.search);
    if (next.dir) p.set("dir", next.dir);
    if (next.sort) p.set("sort", next.sort);
    if (next.class) p.set("class", next.class);
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  const hasExtraFilters = Boolean(sp.search?.trim() || sp.class);

  const emptyCopy = !status
    ? {
        title: hasExtraFilters ? "No hay facturas activas con estos filtros" : "No hay facturas activas",
        description: hasExtraFilters
          ? "Probá otra búsqueda o clase. También podés revisar Anuladas."
          : "Usá Anuladas para ver las facturas anuladas, o registrá una nueva.",
        showCancelledCta: true,
      }
    : status === "CANCELLED"
      ? {
          title: hasExtraFilters ? "No hay facturas anuladas con estos filtros" : "No hay facturas anuladas",
          description: hasExtraFilters
            ? "Probá otra búsqueda o clase."
            : "No hay comprobantes anulados.",
          showCancelledCta: false,
        }
      : {
          title: "No hay facturas con los filtros actuales",
          description: "Probá otro estado, búsqueda o clase.",
          showCancelledCta: false,
        };

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Facturas proveedor"
        subtitle={`${invoicesTotal} ${invoicesTotal === 1 ? "factura" : "facturas"}`}
        actions={
          <ProjectFinanceListHeaderActions
            listViewStorageKey={`facturas-proveedor-${id}`}
            secondary={{ href: `/proyectos/${id}/pagos`, label: "Ver pagos" }}
            primarySlot={
              canCreateInvoice ? (
                <Suspense fallback={<Button size="sm" disabled>Nueva factura</Button>}>
                  <NewProjectSupplierInvoiceDialog
                    projectId={id}
                    suppliers={suppliers}
                    companyCountry={companyCountry}
                    companyIvaCondition={companyIvaCondition}
                    poOptions={poOptions}
                    wbsOptions={wbsOptions}
                    treasuryAccounts={treasuryAccounts}
                    canPayNow={canPayNow}
                    storageConfigured={isStorageConfigured()}
                    defaultOpen={sp.create === "1"}
                    initialLine={{
                      wbsNodeId: sp.wbsNodeId,
                      description: sp.description,
                      quantity: sp.quantity,
                      unit: sp.unit,
                      costType: sp.costType,
                      costAnalysisLineId: sp.costAnalysisLineId,
                    }}
                  />
                </Suspense>
              ) : null
            }
          />
        }
      />

      {sp.error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sp.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Estado:</span>
        <Button asChild variant={!status ? "secondary" : "outline"} size="sm">
          <Link
            href={`/proyectos/${id}/facturas-proveedor${q({ search: sp.search, dir: sp.dir, sort: sp.sort, class: sp.class })}`}
          >
            Activas
          </Link>
        </Button>
        {STATUSES.map((s) => (
          <Button key={s} asChild variant={status === s ? "secondary" : "outline"} size="sm">
            <Link
              href={`/proyectos/${id}/facturas-proveedor${q({ status: s, search: sp.search, dir: sp.dir, sort: sp.sort, class: sp.class })}`}
            >
              {s === "DRAFT" ? "Borrador" : s === "ISSUED" ? "Emitidas" : "Anuladas"}
            </Link>
          </Button>
        ))}
      </div>

      <Suspense fallback={null}>
        <SupplierInvoiceListFilters
          showDateFilters={false}
          preserveParams={["search", "sort", "dir", "view", "class", "status"]}
          classFilterScope="supplier-project"
        />
      </Suspense>

      {items.length === 0 ? (
        <div className="rounded-lg border bg-card px-6 py-8 text-center text-sm text-muted-foreground space-y-3">
          <p className="font-medium text-foreground">{emptyCopy.title}</p>
          <p>{emptyCopy.description}</p>
          {!status && emptyCopy.showCancelledCta ? (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/proyectos/${id}/facturas-proveedor${q({ status: "CANCELLED", search: sp.search, dir: sp.dir, sort: sp.sort, class: sp.class })}`}
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
            hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
            payableHrefPrefix={`/proyectos/${id}/cuentas-por-pagar`}
            canRegisterPayment={canRegisterApPayment(ctx.roles)}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={invoicesTotal} />
      </Suspense>
    </PageShell>
  );
}
