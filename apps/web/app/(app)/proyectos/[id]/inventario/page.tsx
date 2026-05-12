import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listStockMovements, ServiceError } from "@bloqer/services";
import { StockMovementList } from "@/features/inventory";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProyectoInventarioPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let movements;
  try {
    movements = await listStockMovements({ projectId: id }, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}`}>← Proyecto</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Inventario del proyecto</h1>
        </div>
        <Button asChild>
          <Link href={`/proyectos/${id}/consumos/nuevo`}>Registrar consumo</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Movimientos de stock</h2>
        </div>
        <div className="p-6">
          <StockMovementList movements={movements} />
        </div>
      </div>
    </div>
  );
}
