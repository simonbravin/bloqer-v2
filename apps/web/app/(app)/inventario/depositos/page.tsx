import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { getCurrentUser } from "@/lib/auth";
import { listWarehouses } from "@bloqer/services";
import { WarehouseListSection } from "@/features/inventory/components/warehouse-list-section";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default async function DepositosPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const warehouses = await listWarehouses({}, ctx);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Depósitos</h1>
            <p className="text-sm text-muted-foreground">
              {warehouses.length} {warehouses.length === 1 ? "depósito" : "depósitos"}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/inventario/depositos/nuevo">Nuevo depósito</Link>
        </Button>
      </div>

      <div className="flex justify-end">
        <Suspense fallback={null}>
          <ListViewToggle />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <WarehouseListSection warehouses={warehouses} />
      </Suspense>
    </PageShell>
  );
}
