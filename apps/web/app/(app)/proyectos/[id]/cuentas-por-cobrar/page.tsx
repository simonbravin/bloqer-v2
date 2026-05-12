import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReceivableList } from "@/features/sales-invoices";
import type { ReceivableListItem } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { listReceivablesByProject, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CuentasPorCobrarPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let receivables;
  try {
    receivables = await listReceivablesByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: ReceivableListItem[] = receivables.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    salesInvoiceId: r.salesInvoiceId,
    dueDate: r.dueDate,
    status: r.status,
    originalAmount: r.originalAmount,
    paidAmount: r.paidAmount,
    balanceDue: r.balanceDue,
    currency: r.currency,
    clientName: r.clientName,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Cuentas por cobrar</h1>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Saldos del proyecto</h2>
        </div>
        <div className="p-6">
          <ReceivableList receivables={items} projectId={id} />
        </div>
      </div>
    </div>
  );
}
