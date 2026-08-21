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
  listContacts,
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
  }>;
}

export default async function FacturasProveedorPage({ params, searchParams }: PageProps) {
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

  try {
    await getProjectShellInfo(id, ctx);
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
  }));

  const canCreateInvoice = can(ctx.roles, "EDIT", "AP");
  let suppliers: SupplierOption[] = [];
  let poOptions: POOption[] = [];
  let wbsOptions: { id: string; code: string; name: string }[] = [];
  let treasuryAccounts: TreasuryAccountOption[] = [];
  let canPayNow = false;
  let companyCountry: string | null = null;
  let companyIvaCondition: string | null = null;

  if (canCreateInvoice) {
    const gate = await getTenantModuleGate(ctx);
    canPayNow = gate.isEnabled("TREASURY") && canRegisterApPayment(ctx.roles);

    try {
      const [suppliersResult, linkablePOs, wbsNodes] = await Promise.all([
        listContacts({ role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 }, ctx),
        listLinkablePurchaseOrders(id, ctx),
        listProcurementWbsOptions(id, ctx),
      ]);
      suppliers = suppliersResult.data.map((c) => ({
        id: c.id,
        label: c.fantasyName ?? c.legalName,
        country: c.country,
        ivaCondition: c.ivaCondition,
      }));
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
      }));
      try {
        const fiscal = await getCompanyFiscalContext(ctx);
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

      <Suspense fallback={null}>
        <SupplierInvoiceListFilters
          showDateFilters={false}
          preserveParams={["search", "sort", "dir", "view"]}
        />
      </Suspense>

      <Suspense fallback={<ListSectionSkeleton />}>
        <SupplierInvoiceListSection
          invoices={items}
          hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
          payableHrefPrefix={`/proyectos/${id}/cuentas-por-pagar`}
          canRegisterPayment={canRegisterApPayment(ctx.roles)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={invoicesTotal} />
      </Suspense>
    </PageShell>
  );
}
