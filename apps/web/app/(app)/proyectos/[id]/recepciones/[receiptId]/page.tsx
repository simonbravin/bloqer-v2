import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PurchaseReceiptStatusBadge } from "@/features/procurement";
import { StockMovementList } from "@/features/inventory";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import { getPurchaseReceiptById, listEntityDocuments, listStockMovements, ServiceError } from "@bloqer/services";
import {
  confirmPurchaseReceiptAction,
  cancelPurchaseReceiptAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";

interface PageProps {
  params: Promise<{ id: string; receiptId: string }>;
}

export default async function RecepcionDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, receiptId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let receipt, stockMovements;
  try {
    [receipt, stockMovements] = await Promise.all([
      getPurchaseReceiptById(receiptId, ctx),
      listStockMovements({ purchaseReceiptId: receiptId }, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (receipt.projectId !== id) notFound();

  const receiptAttachments = await listEntityDocuments(
    "PURCHASE_RECEIPT",
    receiptId,
    ctx,
    { projectId: id },
  );
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "PROCUREMENT");

  const isDraft     = receipt.status === "DRAFT";
  const isCancelled = receipt.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/recepciones`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          Recepción — {receipt.purchaseOrderCode}
        </h1>
        <PurchaseReceiptStatusBadge status={receipt.status} />
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Proveedor</p>
            <p className="font-medium">{receipt.supplierName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Orden de compra</p>
            <p className="font-medium">
              <Link
                href={`/proyectos/${id}/ordenes-compra/${receipt.purchaseOrderId}`}
                className="hover:underline"
              >
                {receipt.purchaseOrderCode}
              </Link>
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de recepción</p>
            <p className="font-medium">{new Date(receipt.receiptDate).toLocaleDateString("es-AR")}</p>
          </div>
        </div>

        <hr />

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-normal w-[50%]">Descripción</th>
              <th className="pb-2 font-normal text-right">Cantidad recibida</th>
              <th className="pb-2 font-normal">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {receipt.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5">{line.lineDescription}</td>
                <td className="py-1.5 text-right tabular-nums">{line.quantityReceived}</td>
                <td className="py-1.5 text-muted-foreground text-xs">{line.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {receipt.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notas</p>
            <p className="text-sm">{receipt.notes}</p>
          </div>
        )}
      </div>

      {stockMovements.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Movimientos de stock generados</h2>
          </div>
          <div className="p-6">
            <StockMovementList movements={stockMovements} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {isDraft && (
          <form
            action={async () => {
              "use server";
              await confirmPurchaseReceiptAction(receiptId, id, receipt.purchaseOrderId);
              redirect(`/proyectos/${id}/recepciones/${receiptId}`);
            }}
          >
            <Button type="submit">Confirmar recepción</Button>
          </form>
        )}
        {!isCancelled && (
          <form
            action={async () => {
              "use server";
              await cancelPurchaseReceiptAction(receiptId, id, receipt.purchaseOrderId);
              redirect(`/proyectos/${id}/recepciones/${receiptId}`);
            }}
          >
            <Button type="submit" variant="destructive">Anular recepción</Button>
          </form>
        )}
        <Button asChild variant="outline">
          <Link href={`/proyectos/${id}/ordenes-compra/${receipt.purchaseOrderId}`}>
            Ver OC →
          </Link>
        </Button>
      </div>

      <EntityDocumentsPanel
        projectId={id}
        linkedEntity={{ type: "PURCHASE_RECEIPT", id: receiptId }}
        storageConfigured={storageConfigured}
        docs={receiptAttachments}
        canEdit={canEditAttachments}
      />
    </div>
  );
}
