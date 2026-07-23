import { notFound, redirect } from "next/navigation";
import { SupplierInvoiceForm } from "@/features/ap";
import type { SupplierOption, POOption, TreasuryAccountOption } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getTenantModuleGate,
  listContacts,
  listLinkablePurchaseOrders,
  listProcurementWbsOptions,
  listTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function NuevaFacturaProveedorPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const gate = await getTenantModuleGate(ctx);
  const canPayNow =
    gate.isEnabled("TREASURY") && can(ctx.roles, "EDIT", "TREASURY");

  let suppliersResult;
  let linkablePOs;
  let wbsNodes;
  try {
    [suppliersResult, linkablePOs, wbsNodes] = await Promise.all([
      listContacts({ role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 }, ctx),
      listLinkablePurchaseOrders(id, ctx),
      listProcurementWbsOptions(id, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const suppliers: SupplierOption[] = suppliersResult.data.map((c) => ({
    id: c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  const poOptions: POOption[] = linkablePOs.map((po) => ({
    id: po.id,
    code: po.code,
    supplierContactId: po.supplierContactId,
    currency: po.currency,
  }));

  const wbsOptions = wbsNodes.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
  }));

  let treasuryAccounts: TreasuryAccountOption[] = [];
  if (canPayNow) {
    try {
      const accountsResult = await listTreasuryAccounts(ctx, { page: 1, pageSize: 200 });
      treasuryAccounts = accountsResult.data
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

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura de proveedor</h1>
      </div>

      {sp.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sp.error}
        </div>
      )}

      <SupplierInvoiceForm
        projectId={id}
        suppliers={suppliers}
        poOptions={poOptions}
        wbsOptions={wbsOptions}
        treasuryAccounts={treasuryAccounts}
        canPayNow={canPayNow}
        storageConfigured={isStorageConfigured()}
      />
    </PageShell>
  );
}
