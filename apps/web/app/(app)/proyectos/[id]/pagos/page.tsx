import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PaymentList } from "@/features/ap";
import type { PaymentListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listPaymentsByProject, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PagosPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let payments;
  try {
    payments = await listPaymentsByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: PaymentListItem[] = payments.map((p) => ({
    id:                p.id,
    projectId:         id,
    paymentDate:       p.paymentDate,
    amount:            p.amount,
    currency:          p.currency,
    status:            p.status,
    accountName:       p.accountName,
    supplierInvoiceId: p.supplierInvoiceId,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Pagos del proyecto</h2>
        </div>
        <div className="p-6">
          <PaymentList payments={items} projectId={id} />
        </div>
      </div>
    </div>
  );
}
