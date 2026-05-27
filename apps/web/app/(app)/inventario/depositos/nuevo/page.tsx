import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WarehouseForm } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function NuevoDepositoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/inventario/depositos" label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nuevo depósito</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <WarehouseForm companyId={current.tenantCtx.companyId ?? ""} />
      </div>
    </PageShell>
  );
}
