import { redirect } from "next/navigation";
import { SupplierInvoiceForm } from "@/features/ap";
import type { SupplierOption } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listContacts, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function FinanzasNuevaFacturaProveedorPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let suppliersResult;
  try {
    suppliersResult = await listContacts(
      { role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const suppliers: SupplierOption[] = suppliersResult.data.map((c) => ({
    id: c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  return (
    <PageShell className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/finanzas/facturas-proveedor" label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura (empresa)</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        La factura queda sin proyecto (<strong>gasto general</strong>). No se puede vincular orden
        de compra en este flujo.
      </p>

      <SupplierInvoiceForm companyFinanzas suppliers={suppliers} poOptions={[]} />
    </PageShell>
  );
}
