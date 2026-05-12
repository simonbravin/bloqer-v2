import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { WarehouseForm } from "@/features/inventory";

export default async function NuevoDepositoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/inventario/depositos">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo depósito</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <WarehouseForm companyId={current.tenantCtx.companyId ?? ""} />
      </div>
    </div>
  );
}
