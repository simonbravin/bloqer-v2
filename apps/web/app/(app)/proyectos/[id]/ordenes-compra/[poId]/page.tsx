import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PurchaseOrderStatusBadge, PurchaseReceiptList } from "@/features/procurement";
import type { PurchaseReceiptListItem } from "@/features/procurement";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getPurchaseOrderById,
  listEntityDocuments,
  listReceiptsByPurchaseOrder,
  ServiceError,
} from "@bloqer/services";
import {
  issuePurchaseOrderAction,
  cancelPurchaseOrderAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";

interface PageProps {
  params: Promise<{ id: string; poId: string }>;
}

export default async function OrdenCompraDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, poId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let order, receipts;
  try {
    [order, receipts] = await Promise.all([
      getPurchaseOrderById(poId, ctx),
      listReceiptsByPurchaseOrder(poId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (order.projectId !== id) notFound();

  const poAttachments = await listEntityDocuments(
    "PURCHASE_ORDER",
    poId,
    ctx,
    { projectId: id },
  );
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "PROCUREMENT");

  const isDraft      = order.status === "DRAFT";
  const isCancelled  = order.status === "CANCELLED";
  const isReceivable = ["ISSUED", "PARTIALLY_RECEIVED"].includes(order.status);

  const receiptItems: PurchaseReceiptListItem[] = receipts.map((r) => ({
    id:                r.id,
    purchaseOrderCode: r.purchaseOrderCode,
    supplierName:      r.supplierName,
    receiptDate:       r.receiptDate,
    status:            r.status,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/ordenes-compra`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{order.code}</h1>
        <PurchaseOrderStatusBadge status={order.status} />
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Proveedor</p>
            <p className="font-medium">{order.supplierName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda</p>
            <p className="font-medium">{order.currency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de emisión</p>
            <p className="font-medium">{formatDate(order.issueDate)}</p>
          </div>
          {order.expectedDeliveryDate && (
            <div>
              <p className="text-muted-foreground">Entrega esperada</p>
              <p className="font-medium">{formatDate(order.expectedDeliveryDate)}</p>
            </div>
          )}
        </div>

        <hr />

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-normal w-[30%]">Descripción</th>
              <th className="pb-2 font-normal">WBS</th>
              <th className="pb-2 font-normal text-right">Unidad</th>
              <th className="pb-2 font-normal text-right">Cant.</th>
              <th className="pb-2 font-normal text-right">Recibido</th>
              <th className="pb-2 font-normal text-right">Pendiente</th>
              <th className="pb-2 font-normal text-right">Precio unit.</th>
              <th className="pb-2 font-normal text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5">{line.description}</td>
                <td className="py-1.5 text-muted-foreground text-xs">
                  {line.wbsNodeCode ? `${line.wbsNodeCode} — ${line.wbsNodeName}` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums">{line.unit || "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{line.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{line.receivedQuantity}</td>
                <td className="py-1.5 text-right tabular-nums">{line.remainingQuantity}</td>
                <td className="py-1.5 text-right tabular-nums">{line.unitPrice}</td>
                <td className="py-1.5 text-right tabular-nums">{line.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end gap-8 text-sm">
          <div className="text-right">
            <p className="text-muted-foreground">Subtotal</p>
            <p className="tabular-nums">{order.subtotal}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">IVA</p>
            <p className="tabular-nums">{order.taxAmount}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Total</p>
            <p className="font-semibold tabular-nums">{order.totalAmount} {order.currency}</p>
          </div>
        </div>

        {order.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notas</p>
            <p className="text-sm">{order.notes}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {isDraft && (
          <>
            <Button asChild variant="outline">
              <Link href={`/proyectos/${id}/ordenes-compra/${poId}/editar`}>Editar</Link>
            </Button>
            <form
              action={async () => {
                "use server";
                await issuePurchaseOrderAction(poId, id);
                redirect(`/proyectos/${id}/ordenes-compra/${poId}`);
              }}
            >
              <Button type="submit">Emitir OC</Button>
            </form>
          </>
        )}
        {isReceivable && (
          <Button asChild>
            <Link href={`/proyectos/${id}/ordenes-compra/${poId}/recepciones/nueva`}>
              Registrar recepción
            </Link>
          </Button>
        )}
        {!isCancelled && (
          <form
            action={async () => {
              "use server";
              await cancelPurchaseOrderAction(poId, id);
              redirect(`/proyectos/${id}/ordenes-compra/${poId}`);
            }}
          >
            <Button type="submit" variant="destructive">Anular</Button>
          </form>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold">Recepciones</h2>
        </div>
        <div className="p-6">
          <PurchaseReceiptList receipts={receiptItems} projectId={id} />
        </div>
      </div>

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId: id }}
        linkedEntity={{ type: "PURCHASE_ORDER", id: poId }}
        storageConfigured={storageConfigured}
        docs={poAttachments}
        canEdit={canEditAttachments}
      />
    </div>
  );
}
