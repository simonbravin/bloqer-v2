import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import {
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctFromString,
  formatUnitPriceFromString,
} from "@/lib/format-money";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
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
import {
  CancelPurchaseOrderButton,
  PurchaseOrderStatusBadge,
  PurchaseReceiptListSection,
  PoBillingNextStepPanel,
  canRegisterApInvoice,
} from "@/features/procurement";
import { PurchaseOrderMobileFiche } from "@/features/procurement/components/purchase-order-mobile-fiche";
import { PurchaseOrderApprovalActions } from "@/features/procurement/components/purchase-order-approval-actions";
import { SupplierInvoiceTable } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import type { PurchaseReceiptListItem } from "@/features/procurement";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured } from "@bloqer/config";
import {
  canApprovePurchaseOrders,
  canEditPurchaseOrders,
  canEditPurchaseReceipts,
  getPurchaseOrderBillingSummary,
  getPurchaseOrderById,
  getProjectShellInfo,
  listEntityDocuments,
  listReceiptsByPurchaseOrder,
  listSupplierInvoicesByPurchaseOrder,
  ServiceError,
} from "@bloqer/services";
import { purchaseVarianceTierLabel } from "@/features/procurement/lib/variance-tier-labels";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/page-shell";
import {
  submitPurchaseOrderAction,
  confirmPurchaseOrderAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; poId: string }>;
  searchParams: Promise<{ invoiceError?: string; actionError?: string }>;
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

  let order, receipts, billing, linkedInvoices, project;
  try {
    [order, receipts, billing, linkedInvoices, project] = await Promise.all([
      getPurchaseOrderById(poId, ctx),
      listReceiptsByPurchaseOrder(poId, ctx),
      getPurchaseOrderBillingSummary(poId, ctx),
      listSupplierInvoicesByPurchaseOrder(poId, ctx),
      getProjectShellInfo(id, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  if (order.projectId !== id) notFound();

  const poAttachments = await listEntityDocuments("PURCHASE_ORDER", poId, ctx, { projectId: id });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = canEditPurchaseOrders(current.tenantCtx.roles);

  const isDraft = order.status === "DRAFT";
  const isCancelled = order.status === "CANCELLED";
  const isSubmitted = order.status === "SUBMITTED";
  const isApproved = order.status === "APPROVED";
  const isReceivable = ["CONFIRMED", "PARTIALLY_RECEIVED"].includes(order.status);
  const canApprovePo = canApprovePurchaseOrders(current.tenantCtx.roles);
  const canEditPo = canEditPurchaseOrders(current.tenantCtx.roles);
  const canReceive = canEditPurchaseReceipts(current.tenantCtx.roles);
  const showBilling = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status);
  const showVarianceCols = order.lines.some((l) => l.varianceTier && l.varianceTier !== "NONE");

  const canEditAp = canRegisterApInvoice(current.tenantCtx.roles);
  const poPath = `/proyectos/${id}/ordenes-compra/${poId}`;

  const receiptItems: PurchaseReceiptListItem[] = receipts.map((r) => ({
    id: r.id,
    purchaseOrderCode: r.purchaseOrderCode,
    purchaseOrderId: r.purchaseOrderId,
    supplierName: r.supplierName,
    receiptDate: r.receiptDate,
    status: r.status,
    receivedByName: r.receivedByName,
    lineCount: r.lines.length,
    quantitySummary: r.lines.map((l) => formatQtyFromString(l.quantityReceived)).join(" · "),
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
    invoiceLetter: inv.invoiceLetter,
  }));

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={order.code}>
      <div className="hidden items-center gap-4 md:flex">
        <h1 className="text-2xl font-bold tracking-tight">{order.code}</h1>
        <PurchaseOrderStatusBadge status={order.status} />
      </div>

      <ActionErrorBanner message={sp.actionError} />

      <PurchaseOrderMobileFiche
        order={order}
        projectCode={project.code}
        projectName={project.name}
        documents={
          <EntityDocumentsPanel
            scope={{ kind: "project", projectId: id }}
            linkedEntity={{ type: "PURCHASE_ORDER", id: poId }}
            storageConfigured={storageConfigured}
            docs={poAttachments}
            canEdit={canEditAttachments}
          />
        }
      />

      <div className="hidden md:block rounded-lg border bg-card p-6 space-y-4">
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
                <TableHead>EDT</TableHead>
                <TableHead className="text-right">Unidad</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">Desc. %</TableHead>
                <TableHead className="text-right">Ref. presup.</TableHead>
                {showVarianceCols && <TableHead>Desvío</TableHead>}
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
                  <TableCell className="text-right tabular-nums">{formatQtyFromString(line.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQtyFromString(line.receivedQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQtyFromString(line.remainingQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUnitPriceFromString(line.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRatePctFromString(line.discountPct)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {line.budgetUnitCostSnapshot
                      ? formatUnitPriceFromString(line.budgetUnitCostSnapshot)
                      : "—"}
                  </TableCell>
                  {showVarianceCols && (
                    <TableCell className="text-xs">
                      {line.varianceTier !== "NONE" ? (
                        <Badge variant="outline" className="font-normal">
                          {purchaseVarianceTierLabel(line.varianceTier)}
                          {line.variancePct ? ` (${formatRatePctFromString(line.variancePct)}%)` : ""}
                        </Badge>
                      ) : (
                        "—"
                      )}
                      {line.varianceJustification ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2">{line.varianceJustification}</p>
                      ) : null}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">{formatMoneyAmount(line.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>

        <div className="flex justify-end gap-8 text-sm">
          <div className="text-right">
            <p className="text-muted-foreground">Subtotal</p>
            <p className="tabular-nums">{formatMoneyAmount(order.subtotal)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">IVA</p>
            <p className="tabular-nums">{formatMoneyAmount(order.taxAmount)}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Total</p>
            <p className="font-semibold tabular-nums">
              {formatMoneyAmount(order.totalAmount, order.currency)}
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

      {showBilling && !isCancelled && (
        <PoBillingNextStepPanel
          projectId={id}
          purchaseOrderId={poId}
          billing={billing}
          canEditAp={canEditAp}
          errorReturnPath={`/proyectos/${id}/ordenes-compra/${poId}`}
        />
      )}

      <div className="flex gap-2 flex-wrap">
        {isDraft && canEditPo && (
          <>
            <Button asChild variant="outline">
              <Link href={`/proyectos/${id}/ordenes-compra/${poId}/editar`}>Editar</Link>
            </Button>
            <form
              action={async () => {
                "use server";
                const res = await submitPurchaseOrderAction(poId, id);
                if ("error" in res) redirectWithActionError(poPath, res.error);
                redirect(poPath);
              }}
            >
              <Button type="submit">Enviar a aprobación</Button>
            </form>
          </>
        )}
        {isSubmitted && canApprovePo && (
          <PurchaseOrderApprovalActions poId={poId} projectId={id} />
        )}
        {isApproved && canEditPo && (
          <form
            action={async () => {
              "use server";
              const res = await confirmPurchaseOrderAction(poId, id);
              if ("error" in res) redirectWithActionError(poPath, res.error);
              redirect(poPath);
            }}
          >
            <Button type="submit">Confirmar al proveedor</Button>
          </form>
        )}
        {isReceivable && canReceive && (
          <Button asChild className="min-h-11 w-full md:min-h-9 md:w-auto" data-testid="po-register-receipt">
            <Link href={`/proyectos/${id}/ordenes-compra/${poId}/recepciones/nueva`}>
              Registrar recepción
            </Link>
          </Button>
        )}
        {!isCancelled && canEditPo && !["PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status) && (
          <CancelPurchaseOrderButton poId={poId} projectId={id} />
        )}
      </div>

      <DataTableSection
        title="Recepciones"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/recepciones`}>Ver todas las recepciones</Link>
          </Button>
        }
      >
        <Suspense fallback={null}>
          <PurchaseReceiptListSection receipts={receiptItems} projectId={id} />
        </Suspense>
      </DataTableSection>

      <DataTableSection title="Facturas vinculadas">
        <SupplierInvoiceTable
          invoices={invoiceItems}
          hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
        />
      </DataTableSection>

      <div className="hidden md:block">
        <EntityDocumentsPanel
          scope={{ kind: "project", projectId: id }}
          linkedEntity={{ type: "PURCHASE_ORDER", id: poId }}
          storageConfigured={storageConfigured}
          docs={poAttachments}
          canEdit={canEditAttachments}
        />
      </div>
    </PageShell>
  );
}
