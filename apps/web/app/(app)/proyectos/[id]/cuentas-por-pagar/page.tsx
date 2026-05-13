import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PayableList } from "@/features/ap";
import type { PayableListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listPayablesByProject, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CuentasPorPagarPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let payables;
  try {
    payables = await listPayablesByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: PayableListItem[] = payables.map((p) => ({
    id:             p.id,
    supplierName:   p.supplierName,
    dueDate:        p.dueDate,
    status:         p.status,
    originalAmount: p.originalAmount,
    paidAmount:     p.paidAmount,
    balanceDue:     p.balanceDue,
    currency:       p.currency,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Cuentas por pagar</h1>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Saldos del proyecto</h2>
        </div>
        <div className="p-6">
          <PayableList payables={items} projectId={id} />
        </div>
      </div>
    </div>
  );
}
