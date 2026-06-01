import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import { PurchaseOrderStatusBadge, PurchaseReceiptTable, PoBillingNextStepPanel, canRegisterApInvoice } from "@/features/procurement";
import { SupplierInvoiceTable } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import type { PurchaseReceiptListItem } from "@/features/procurement";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getPurchaseOrderBillingSummary,
  getPurchaseOrderById,
  listEntityDocuments,
  listReceiptsByPurchaseOrder,
  listSupplierInvoicesByPurchaseOrder,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import {
  issuePurchaseOrderAction,
  cancelPurchaseOrderAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; poId: string }>;
  searchParams: Promise<{ invoiceError?: string }>;
}

export default async function OrdenCompraDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, poId } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let order, receipts, billing, linkedInvoices;
  try {
    [order, receipts, billing, linkedInvoices] = await Promise.all([
      getPurchaseOrderById(poId, ctx),
      listReceiptsByPurchaseOrder(poId, ctx),
      getPurchaseOrderBillingSummary(poId, ctx),
      listSupplierInvoicesByPurchaseOrder(poId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (order.projectId !== id) notFound();

  const poAttachments = await listEntityDocuments("PURCHASE_ORDER", poId, ctx, { projectId: id });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "PROCUREMENT");

  const isDraft = order.status === "DRAFT";
  const isCancelled = order.status === "CANCELLED";
  const isReceivable = ["ISSUED", "PARTIALLY_RECEIVED"].includes(order.status);

  const canEditAp = canRegisterApInvoice(current.tenantCtx.roles);

  const receiptItems: PurchaseReceiptListItem[] = receipts.map((r) => ({
    id: r.id,
    purchaseOrderCode: r.purchaseOrderCode,
    supplierName: r.supplierName,
    receiptDate: r.receiptDate,
    status: r.status,
  }));

  const invoiceItems: SupplierInvoiceListItem[] = linkedInvoices.map((inv) => ({
    id: inv.id,
    code: inv.code,
    supplierName: inv.supplierName,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    status: inv.status,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/ordenes-compra`} label="Volver" />
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

        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Descripción</TableHead>
                <TableHead>WBS</TableHead>
                <TableHead className="text-right">Unidad</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {line.wbsNodeCode ? `${line.wbsNodeCode} — ${line.wbsNodeName}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.unit || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.receivedQuantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.remainingQuantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.unitPrice}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.lineTotal}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>

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
            <p className="font-semibold tabular-nums">
              {order.totalAmount} {order.currency}
            </p>
          </div>
        </div>

        {order.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notas</p>
            <p className="text-sm">{order.notes}</p>
          </div>
        )}
      </div>

      {sp.invoiceError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sp.invoiceError}
        </div>
      )}

      {!isDraft && !isCancelled && (
        <PoBillingNextStepPanel
          projectId={id}
          purchaseOrderId={poId}
          billing={billing}
          canEditAp={canEditAp}
          errorReturnPath={`/proyectos/${id}/ordenes-compra/${poId}`}
        />
      )}

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
            <Button type="submit" variant="destructive">
              Anular
            </Button>
          </form>
        )}
      </div>

      <DataTableSection title="Recepciones">
        <PurchaseReceiptTable receipts={receiptItems} projectId={id} />
      </DataTableSection>

      <DataTableSection title="Facturas vinculadas">
        <SupplierInvoiceTable
          invoices={invoiceItems}
          hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
        />
      </DataTableSection>

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId: id }}
        linkedEntity={{ type: "PURCHASE_ORDER", id: poId }}
        storageConfigured={storageConfigured}
        docs={poAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
