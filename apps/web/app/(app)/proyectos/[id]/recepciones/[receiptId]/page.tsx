import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
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
import { PurchaseReceiptStatusBadge, PoBillingNextStepPanel, canRegisterApInvoice } from "@/features/procurement";
import { ReceiptForm } from "@/features/procurement/components/receipt-form";
import { StockMovementList } from "@/features/inventory";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured } from "@bloqer/config";
import {
  canEditPurchaseReceipts,
  countActiveDraftReceiptsForPo,
  getPoLinesForReceiptForm,
  getPurchaseOrderBillingSummary,
  getPurchaseOrderById,
  getPurchaseReceiptById,
  listEntityDocuments,
  listStockMovements,
  listWarehouses,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { formatQtyFromString, isPositiveMoneyAmount } from "@/lib/format-money";
import { toDateInput } from "@/lib/date-input";
import {
  cancelPurchaseReceiptAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { Button } from "@/components/ui/button";
import { ScrollToElement } from "@/components/navigation/scroll-to-element";
import { procurementActionBtnClass } from "@/features/procurement/lib/procurement-ui";

interface PageProps {
  params: Promise<{ id: string; receiptId: string }>;
  searchParams: Promise<{ invoiceError?: string; actionError?: string; siguiente?: string }>;
}

export default async function RecepcionDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, receiptId } = await params;
  const sp = await searchParams;
  const detailPath = `/proyectos/${id}/recepciones/${receiptId}`;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let receipt;
  let stockMovements: Awaited<ReturnType<typeof listStockMovements>> = [];
  let billing;
  try {
    receipt = await getPurchaseReceiptById(receiptId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  // Inventory is optional for the receipt ficha — never 404 the whole page.
  try {
    stockMovements = await listStockMovements({ purchaseReceiptId: receiptId }, ctx);
  } catch (err) {
    if (!(err instanceof ServiceError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND"))) {
      throw err;
    }
  }

  billing = {
    receivedAmount: "0",
    invoicedAmount: "0",
    draftReservedAmount: "0",
    paidAmount: "0",
    pendingToInvoice: "0",
    hasReceivedQuantity: false,
    draftInvoiceCount: 0,
    lineMatches: [],
    matchWarningCount: 0,
  };
  try {
    billing = await getPurchaseOrderBillingSummary(receipt.purchaseOrderId, ctx);
  } catch (err) {
    if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) {
      if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
      throw err;
    }
  }

  if (receipt.projectId !== id) notFound();

  const canEditReceipt = canEditPurchaseReceipts(current.tenantCtx.roles);

  let receiptAttachments: Awaited<ReturnType<typeof listEntityDocuments>> = [];
  try {
    receiptAttachments = await listEntityDocuments("PURCHASE_RECEIPT", receiptId, ctx, {
      projectId: id,
    });
  } catch (err) {
    // Documents module / VIEW perms are optional for the receipt ficha itself.
    if (!(err instanceof ServiceError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND"))) {
      throw err;
    }
  }
  const storageConfigured = isStorageConfigured();
  // Align with document service: receipt editors (incl. INVENTORY) may attach evidence.
  const canEditAttachments = canEditReceipt;

  const isDraft = receipt.status === "DRAFT";
  const isCancelled = receipt.status === "CANCELLED";

  const canEditAp = canRegisterApInvoice(current.tenantCtx.roles);
  const isConfirmed = receipt.status === "CONFIRMED";
  const canInvoiceNow =
    isConfirmed &&
    billing.hasReceivedQuantity &&
    isPositiveMoneyAmount(billing.pendingToInvoice);
  const highlightBilling = canInvoiceNow && sp.siguiente === "facturar";
  const actionBtn = procurementActionBtnClass;

  const poPath = `/proyectos/${id}/ordenes-compra/${receipt.purchaseOrderId}`;
  const documentTrail = (
    <nav
      aria-label="Camino documental"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground"
    >
      <Link href={`/proyectos/${id}/ordenes-compra`} className="hover:text-foreground hover:underline">
        Órdenes de compra
      </Link>
      <span aria-hidden>/</span>
      <Link href={poPath} className="hover:text-foreground hover:underline">
        {receipt.purchaseOrderCode}
      </Link>
      <span aria-hidden>/</span>
      <span className="text-foreground">Recepción</span>
    </nav>
  );

  let draftEditor: ReactNode = null;
  let otherDraftCount = 0;
  if (isDraft && canEditReceipt) {
    let warehouseOptions: Array<{ id: string; name: string }> = [];
    try {
      const warehouses = await listWarehouses({ status: "ACTIVE" }, ctx);
      warehouseOptions = warehouses.map((w) => ({ id: w.id, name: w.name }));
    } catch (err) {
      if (!(err instanceof ServiceError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND"))) {
        throw err;
      }
    }

    const order = await getPurchaseOrderById(receipt.purchaseOrderId, ctx);
    const [formLines, extraDrafts] = await Promise.all([
      getPoLinesForReceiptForm(receipt.purchaseOrderId, order.lines, ctx, {
        excludeReceiptId: receiptId,
      }),
      countActiveDraftReceiptsForPo(receipt.purchaseOrderId, ctx, { excludeReceiptId: receiptId }),
    ]);
    otherDraftCount = extraDrafts;
    const initialQuantities: Record<string, string> = {};
    for (const line of receipt.lines) {
      initialQuantities[line.purchaseOrderLineId] = line.quantityReceived;
    }

    draftEditor = (
      <div className="space-y-3">
        {otherDraftCount > 0 ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            Hay {otherDraftCount === 1 ? "otro borrador" : `${otherDraftCount} borradores más`} de
            recepción para esta OC. Anulá los extras desde el listado de Recepciones; si no, pueden
            bloquear cantidades pendientes.
          </p>
        ) : null}
        <div className="rounded-lg border bg-card px-4 py-3 text-sm sm:px-6">
          <p className="text-muted-foreground">Proveedor</p>
          <p className="font-medium">{receipt.supplierName}</p>
        </div>
        <ReceiptForm
          mode="edit"
          projectId={id}
          purchaseOrderId={receipt.purchaseOrderId}
          purchaseOrderCode={receipt.purchaseOrderCode}
          receiptId={receiptId}
          poLines={formLines}
          warehouseOptions={warehouseOptions}
          initialReceiptDate={toDateInput(receipt.receiptDate)}
          initialNotes={receipt.notes}
          initialWarehouseId={receipt.warehouseId}
          initialQuantities={initialQuantities}
        />
      </div>
    );
  }

  return (
    <PageShell
      variant="default"
      className="space-y-6"
      breadcrumbLabel={receipt.purchaseOrderCode}
    >
      {documentTrail}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">
          Recepción — {receipt.purchaseOrderCode}
        </h1>
        <PurchaseReceiptStatusBadge status={receipt.status} />
      </div>

      <ActionErrorBanner message={sp.actionError} />
      <ActionErrorBanner message={sp.invoiceError} />

      {isConfirmed && (
        <PoBillingNextStepPanel
          projectId={id}
          purchaseOrderId={receipt.purchaseOrderId}
          purchaseReceiptId={receiptId}
          billing={billing}
          canEditAp={canEditAp}
          errorReturnPath={`/proyectos/${id}/recepciones/${receiptId}`}
          highlighted={highlightBilling}
        />
      )}
      {highlightBilling ? <ScrollToElement id="facturar" /> : null}

      {draftEditor ? (
        draftEditor
      ) : (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          {isDraft && !canEditReceipt ? (
            <p className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground">
              Recepción en borrador. Necesitás permiso de edición en Compras para modificarla o
              confirmarla.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Proveedor</p>
              <p className="font-medium">{receipt.supplierName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Orden de compra</p>
              <p className="font-medium">
                <Link
                  href={poPath}
                  className="hover:underline"
                  data-testid="receipt-po-link"
                >
                  {receipt.purchaseOrderCode}
                </Link>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha de recepción</p>
              <p className="font-medium">{formatDate(receipt.receiptDate)}</p>
            </div>
          </div>

          <hr className="hidden md:block" />

          <div className="space-y-3 md:hidden">
            {receipt.lines.map((line) => (
              <div key={line.id} className="rounded-lg border p-4">
                <p className="font-medium">{line.lineDescription}</p>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  Recibido {formatQtyFromString(line.quantityReceived)}
                </p>
                {line.notes ? <p className="mt-1 text-sm">{line.notes}</p> : null}
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50%]">Descripción</TableHead>
                    <TableHead className="text-right">Cantidad recibida</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipt.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.lineDescription}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQtyFromString(line.quantityReceived)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {line.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </div>

          {receipt.notes && (
            <div>
              <p className="text-sm text-muted-foreground">Notas</p>
              <p className="text-sm">{receipt.notes}</p>
            </div>
          )}
        </div>
      )}

      {stockMovements.length > 0 && (
        <DataTableSection title="Movimientos de stock generados">
          <StockMovementList movements={stockMovements} />
        </DataTableSection>
      )}

      {/* Draft editors use the form CTAs; viewers never get Confirm/Anular here. */}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
        {!isDraft && !isCancelled && canEditReceipt ? (
          <form
            className="w-full sm:w-auto"
            action={async () => {
              "use server";
              const result = await cancelPurchaseReceiptAction(
                receiptId,
                id,
                receipt.purchaseOrderId,
              );
              if ("error" in result) redirectWithActionError(detailPath, result.error);
              redirect(detailPath);
            }}
          >
            <Button type="submit" variant="destructive" className={actionBtn}>
              Anular recepción
            </Button>
          </form>
        ) : null}
        <Button asChild variant="outline" className={actionBtn}>
          <Link href={poPath} data-testid="receipt-view-po">
            Ver OC
          </Link>
        </Button>
      </div>

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId: id }}
        linkedEntity={{ type: "PURCHASE_RECEIPT", id: receiptId }}
        storageConfigured={storageConfigured}
        docs={receiptAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
