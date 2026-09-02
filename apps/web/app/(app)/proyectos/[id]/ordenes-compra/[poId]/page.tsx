import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import {
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctFromString,
  formatUnitPriceFromString,
  isPositiveMoneyAmount,
  isZeroRatePct,
} from "@/lib/format-money";
import { costCategoryLabelEs } from "@/lib/cost-category-colors";
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
import { AuthorizeAndCommitPoButton } from "@/features/procurement/components/authorize-and-commit-po-button";
import { PurchaseOrderVarianceReadout } from "@/features/procurement/components/purchase-order-variance-readout";
import { PoLineBudgetRef } from "@/features/procurement/components/po-line-budget-ref";
import { SupplierInvoiceTable } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import type { PurchaseReceiptListItem } from "@/features/procurement";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured } from "@bloqer/config";
import {
  canApprovePurchaseOrders,
  canAuthorizeAndCommitPo,
  willApproveAutoConfirmPo,
  canEditPurchaseOrders,
  canEditPurchaseReceipts,
  getCompanyProcurementSettingsForProject,
  getPurchaseOrderBillingSummary,
  getPurchaseOrderById,
  getProjectShellInfo,
  listEntityDocuments,
  listReceiptsByPurchaseOrder,
  listSupplierInvoicesByPurchaseOrder,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ScrollToElement } from "@/components/navigation/scroll-to-element";
import { ProcurementAmberCallout } from "@/features/procurement/components/procurement-amber-callout";
import { procurementActionBtnClass } from "@/features/procurement/lib/procurement-ui";
import {
  submitPurchaseOrderAction,
  confirmPurchaseOrderAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import { Button } from "@/components/ui/button";
import { varianceJustificationReasonEs } from "@bloqer/services/purchase-variance-pure";

interface PageProps {
  params: Promise<{ id: string; poId: string }>;
  searchParams: Promise<{ invoiceError?: string; actionError?: string; siguiente?: string }>;
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

  let order, receipts, billing, linkedInvoices, project, procurementSettings;
  try {
    [order, receipts, project, procurementSettings] = await Promise.all([
      getPurchaseOrderById(poId, ctx),
      listReceiptsByPurchaseOrder(poId, ctx),
      getProjectShellInfo(id, ctx),
      getCompanyProcurementSettingsForProject(id, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  // Billing/AP panel is optional when CxP module is off or actor lacks AP+procurement view.
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
  linkedInvoices = [] as Awaited<ReturnType<typeof listSupplierInvoicesByPurchaseOrder>>;
  try {
    [billing, linkedInvoices] = await Promise.all([
      getPurchaseOrderBillingSummary(poId, ctx),
      listSupplierInvoicesByPurchaseOrder(poId, ctx),
    ]);
  } catch (err) {
    if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
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
  const willAutoConfirmOnApprove = willApproveAutoConfirmPo(procurementSettings, {
    totalAmount: order.totalAmount,
    currency: order.currency,
    fxRate: order.fxRate,
    totalAmountArs: order.totalAmountArs,
    lines: order.lines,
  });
  const showAuthorizeAndCommit =
    canAuthorizeAndCommitPo(
      procurementSettings,
      {
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
        fxRate: order.fxRate,
        totalAmountArs: order.totalAmountArs,
        originRequestedByUserId: order.originRequestedByUserId,
        lines: order.lines,
      },
      ctx,
    ) &&
    // Avoid dual CTAs on SUBMITTED when D-107 already turns Aprobar into commit.
    !(isSubmitted && willAutoConfirmOnApprove);
  const canEditAp = canRegisterApInvoice(current.tenantCtx.roles);
  const showBilling = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status);
  const canInvoiceNow =
    showBilling &&
    !isCancelled &&
    billing.hasReceivedQuantity &&
    isPositiveMoneyAmount(billing.pendingToInvoice);
  const highlightBilling = canInvoiceNow && sp.siguiente === "facturar";
  const billingPanel =
    showBilling && !isCancelled ? (
      <PoBillingNextStepPanel
        projectId={id}
        purchaseOrderId={poId}
        billing={billing}
        canEditAp={canEditAp}
        errorReturnPath={`/proyectos/${id}/ordenes-compra/${poId}`}
        highlighted={highlightBilling}
      />
    ) : null;
  const showReceiptQty = showBilling;
  const showDiscountCol = order.lines.some((l) => !isZeroRatePct(l.discountPct));
  const linesNeedingJustification = order.lines
    .filter(
      (l) =>
        !l.varianceJustification?.trim() &&
        (l.varianceTier === "UNIT_MISMATCH" ||
          l.varianceTier === "NO_BUDGET_BASELINE" ||
          l.varianceTier === "NOTE_REQUIRED" ||
          l.varianceTier === "EXTRA_APPROVAL"),
    )
    .map((l) => `${l.description} (${varianceJustificationReasonEs(l.varianceTier)})`);
  const globalRefLines = order.lines.filter((l) => l.budgetRefKind === "GLOBAL_PARTIDA");
  const canCancel =
    !isCancelled && canEditPo && !["PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status);
  const hasActions =
    (isDraft && canEditPo) ||
    (isSubmitted && (canApprovePo || showAuthorizeAndCommit)) ||
    (isApproved && canEditPo) ||
    (isReceivable && canReceive) ||
    canCancel;
  const actionBtn = procurementActionBtnClass;

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
    classCode: inv.classCode,
    classLabel: inv.classLabel,
    classFamily: inv.classFamily,
  }));

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={order.code}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{order.code}</h1>
          <PurchaseOrderStatusBadge status={order.status} />
        </div>
        {hasActions ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            {isDraft && canEditPo && (
              <>
                <Button asChild variant="outline" className={actionBtn}>
                  <Link href={`/proyectos/${id}/ordenes-compra/${poId}/editar`}>Editar</Link>
                </Button>
                <form
                  className="w-full sm:w-auto"
                  action={async () => {
                    "use server";
                    const res = await submitPurchaseOrderAction(poId, id);
                    if ("error" in res) redirectWithActionError(poPath, res.error);
                    redirect(poPath);
                  }}
                >
                  <Button
                    type="submit"
                    className={actionBtn}
                    variant={showAuthorizeAndCommit ? "outline" : "default"}
                  >
                    Enviar a aprobación
                  </Button>
                </form>
                {showAuthorizeAndCommit ? (
                  <AuthorizeAndCommitPoButton
                    poId={poId}
                    projectId={id}
                    className={actionBtn}
                  />
                ) : null}
              </>
            )}
            {isSubmitted && canApprovePo && (
              <PurchaseOrderApprovalActions
                poId={poId}
                projectId={id}
                willAutoConfirm={willAutoConfirmOnApprove}
                approveVariant={showAuthorizeAndCommit ? "outline" : "default"}
              />
            )}
            {isSubmitted && showAuthorizeAndCommit ? (
              <AuthorizeAndCommitPoButton poId={poId} projectId={id} className={actionBtn} />
            ) : null}
            {isApproved && canEditPo && (
              <form
                className="w-full sm:w-auto"
                action={async () => {
                  "use server";
                  const res = await confirmPurchaseOrderAction(poId, id);
                  if ("error" in res) redirectWithActionError(poPath, res.error);
                  redirect(poPath);
                }}
              >
                <Button type="submit" className={actionBtn}>
                  Confirmar al proveedor
                </Button>
              </form>
            )}
            {isReceivable && canReceive && (
              <Button asChild className={actionBtn} data-testid="po-register-receipt">
                <Link href={`/proyectos/${id}/ordenes-compra/${poId}/recepciones/nueva`}>
                  Registrar recepción
                </Link>
              </Button>
            )}
            {canCancel && (
              <CancelPurchaseOrderButton poId={poId} projectId={id} className={actionBtn} />
            )}
          </div>
        ) : null}
      </div>
      {isApproved ? (
        <ProcurementAmberCallout className="hidden md:block">
          Aprobada — falta Confirmar al proveedor para comprometer $ en EDT.
        </ProcurementAmberCallout>
      ) : null}

      <ActionErrorBanner message={sp.actionError} />
      <ActionErrorBanner message={sp.invoiceError} />
      {isDraft && canEditPo && linesNeedingJustification.length > 0 ? (
        <ProcurementAmberCallout>
          <p>
            Desvío en{" "}
            {linesNeedingJustification.join("; ")}. Completá <strong>Justificación desvío</strong> en{" "}
            <Link href={`/proyectos/${id}/ordenes-compra/${poId}/editar`} className="underline">
              Editar
            </Link>
            .
          </p>
        </ProcurementAmberCallout>
      ) : isDraft && canEditPo && globalRefLines.length > 0 ? (
        <ProcurementAmberCallout>
          <p>
            {globalRefLines.length === 1 ? "La línea" : "Las líneas"}{" "}
            {globalRefLines.map((l) => l.description).join("; ")} no tienen $/u comparable: la
            partida está en <strong>global</strong>. No hay desvío unitario que justifique. Para ver
            un referencial, en{" "}
            <Link href={`/proyectos/${id}/ordenes-compra/${poId}/editar`} className="underline">
              Editar
            </Link>{" "}
            elegí un <strong>Insumo APU</strong>
            {globalRefLines[0]?.suggestedApu
              ? ` (p. ej. ${globalRefLines[0].suggestedApu.description})`
              : ""}
            .
          </p>
        </ProcurementAmberCallout>
      ) : null}

      {billingPanel}
      {highlightBilling ? <ScrollToElement id="facturar" /> : null}

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
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Unidad</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                {showReceiptQty && (
                  <>
                    <TableHead className="text-right">Recibido</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                  </>
                )}
                <TableHead className="text-right">Precio unit.</TableHead>
                {showDiscountCol && <TableHead className="text-right">Desc. %</TableHead>}
                <TableHead className="text-right">Ref. presup.</TableHead>
                <TableHead>Desvío</TableHead>
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
                  <TableCell className="text-xs text-muted-foreground">
                    {costCategoryLabelEs(line.costType)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.unit || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyFromString(line.quantity)}</TableCell>
                  {showReceiptQty && (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatQtyFromString(line.receivedQuantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQtyFromString(line.remainingQuantity)}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {formatUnitPriceFromString(line.unitPrice)}
                  </TableCell>
                  {showDiscountCol && (
                    <TableCell className="text-right tabular-nums">
                      {formatRatePctFromString(line.discountPct)}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-muted-foreground">
                    <PoLineBudgetRef
                      unitCost={line.budgetUnitCostSnapshot}
                      unit={line.budgetUnit}
                      refKind={line.budgetRefKind}
                      suggestedApu={line.suggestedApu}
                    />
                  </TableCell>
                  <TableCell>
                    <PurchaseOrderVarianceReadout
                      variancePct={line.variancePct}
                      varianceTier={line.varianceTier}
                      justification={line.varianceJustification}
                      refKind={line.budgetRefKind}
                    />
                  </TableCell>
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
