import { redirect } from "next/navigation";
import { SupplierInvoiceForm } from "@/features/ap";
import type { SupplierOption } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { listContacts, ServiceError, getTenantModuleGate } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function GastosGeneralesNuevaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("AP") || !can(current.tenantCtx.roles, "EDIT", "AP")) {
    redirect("/finanzas/gastos-generales");
  }

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
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/finanzas/gastos-generales" label="Asistente" />
        <h1 className="text-2xl font-bold tracking-tight">Paso 1 — Nueva factura de gasto</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        La factura queda <strong>sin proyecto</strong>. Después de guardar, emití la factura en el
        detalle y pagá desde Cuentas por pagar empresa.
      </p>

      <SupplierInvoiceForm companyFinanzas suppliers={suppliers} poOptions={[]} />
    </PageShell>
  );
}
