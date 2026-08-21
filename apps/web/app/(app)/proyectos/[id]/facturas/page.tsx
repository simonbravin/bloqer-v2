import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { ProjectFinanceListHeaderActions } from "@/features/projects/components/project-finance-list-header-actions";
import {
  NewProjectSalesInvoiceDialog,
  SalesInvoiceListSection,
  type ClientOption,
  type SalesInvoiceListItem,
  type TreasuryAccountOption,
} from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  canEditArArea,
  getCompanyFiscalContext,
  getProjectShellInfo,
  getTenantModuleGate,
  listContacts,
  listInvoicesByProject,
  listSelectableTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { parsePage } from "@/lib/parse-page";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; create?: string }>;
}

export default async function FacturasPage({ params, searchParams }: PageProps) {
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
    invoicesResult = await listInvoicesByProject(id, ctx, { page, pageSize: PAGE_SIZE });
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const invoices = invoicesResult.data;
  const invoicesTotal = invoicesResult.total;

  const items: SalesInvoiceListItem[] = invoices.map((inv) => ({
    id: inv.id,
    projectId: inv.projectId,
    code: inv.code,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    clientName: inv.clientName,
    invoiceLetter: inv.invoiceLetter,
  }));

  const canCreate = canEditArArea(ctx.roles);
  let clients: ClientOption[] = [];
  let treasuryAccounts: TreasuryAccountOption[] = [];
  let canCollectNow = false;
  let companyCountry: string | null = null;
  let companyIvaCondition: string | null = null;

  if (canCreate) {
    const { data: contacts } = await listContacts({ role: "CLIENT", status: "ACTIVE" }, ctx);
    clients = contacts.map((c) => ({
      id: c.id,
      label: c.fantasyName ?? c.legalName,
      country: c.country,
      ivaCondition: c.ivaCondition,
    }));

    try {
      const fiscal = await getCompanyFiscalContext(ctx);
      if (fiscal) {
        companyCountry = fiscal.country;
        companyIvaCondition = fiscal.ivaCondition;
      }
    } catch {
      /* keep defaults */
    }

    try {
      const gate = await getTenantModuleGate(ctx);
      canCollectNow = gate.isEnabled("TREASURY") && can(ctx.roles, "EDIT", "TREASURY");
    } catch {
      canCollectNow = false;
    }

    if (canCollectNow) {
      try {
        const accountsResult = await listSelectableTreasuryAccounts(ctx);
        treasuryAccounts = accountsResult
          .filter(
            (a) =>
              a.status === "ACTIVE" &&
              (!ctx.companyId || !a.companyId || a.companyId === ctx.companyId),
          )
          .map((a) => ({
            id: a.id,
            label: `${a.name} (${a.currency})`,
            currency: a.currency,
          }));
      } catch {
        treasuryAccounts = [];
      }
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Facturas emitidas"
        subtitle={`${invoicesTotal} ${invoicesTotal === 1 ? "factura" : "facturas"}`}
        actions={
          <ProjectFinanceListHeaderActions
            listViewStorageKey={`facturas-${id}`}
            secondary={{ href: `/proyectos/${id}/cobranzas`, label: "Ver cobranzas" }}
            primarySlot={
              canCreate ? (
                <Suspense fallback={<Button size="sm" disabled>Nueva factura</Button>}>
                  <NewProjectSalesInvoiceDialog
                    projectId={id}
                    clients={clients}
                    companyCountry={companyCountry}
                    companyIvaCondition={companyIvaCondition}
                    treasuryAccounts={treasuryAccounts}
                    canCollectNow={canCollectNow}
                    storageConfigured={isStorageConfigured()}
                    defaultOpen={sp.create === "1"}
                  />
                </Suspense>
              ) : null
            }
          />
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <SalesInvoiceListSection invoices={items} projectId={id} />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={invoicesTotal} />
      </Suspense>
    </PageShell>
  );
}
