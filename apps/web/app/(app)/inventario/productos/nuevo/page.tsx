import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { ProductForm } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";

export default async function NuevoProductoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "INVENTORY")) redirect("/inventario/productos");

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo producto</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ProductForm companyId={current.tenantCtx.companyId ?? undefined} />
      </div>
    </PageShell>
  );
}
