import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PurchaseReceiptList } from "@/features/procurement";
import type { PurchaseReceiptListItem } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { listReceiptsByProject, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecepcionesPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let receipts;
  try {
    receipts = await listReceiptsByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: PurchaseReceiptListItem[] = receipts.map((r) => ({
    id:                r.id,
    purchaseOrderCode: r.purchaseOrderCode,
    supplierName:      r.supplierName,
    receiptDate:       r.receiptDate,
    status:            r.status,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Recepciones</h1>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Recepciones del proyecto</h2>
        </div>
        <div className="p-6">
          <PurchaseReceiptList receipts={items} projectId={id} />
        </div>
      </div>
    </div>
  );
}
