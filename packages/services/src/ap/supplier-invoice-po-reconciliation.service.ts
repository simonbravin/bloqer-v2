import { Prisma, prisma } from "@bloqer/database";

import { assertFinancialPeriodOpen } from "../finance/period-lock.service";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import {
  assertPlatformAccess,
  type PlatformServiceContext,
} from "../platform/platform-auth.service";
import { lockCompanyForFinancialWrite } from "../treasury/treasury-write-locks";
import { ServiceError } from "../types";
import { log } from "../audit/audit.service";

type Pair = {
  invoiceId: string;
  invoiceLineId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  expectedInvoiceUpdatedAt: string;
  expectedOrderUpdatedAt: string;
};

type Scope = { tenantId: string; companyId: string; projectId: string };

type Invoice = Scope & {
  supplierContactId: string;
  status: string;
  documentKind: string;
  currency: string;
  totalAmount: Prisma.Decimal;
  purchaseOrderId: string | null;
  subcontractCertificationId: string | null;
  lines: Array<{
    id: string;
    quantity: Prisma.Decimal;
    purchaseOrderLineId: string | null;
    costAnalysisLineId: string | null;
  }>;
  payable: { status: string; paidAmount: Prisma.Decimal; creditedAmount: Prisma.Decimal } | null;
};

type Order = Scope & {
  supplierContactId: string;
  status: string;
  currency: string;
  totalAmount: Prisma.Decimal;
  lines: Array<{
    id: string;
    quantity: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal;
    wbsNodeId: string | null;
  }>;
  supplierInvoices: Array<{ id: string }>;
};

/** Narrow historical repair: explicit, fully received, fully paid, single-line pairs only. */
export function assertPaidInvoicePoReconciliation(
  invoice: Invoice,
  order: Order,
  pair: Pair,
  scope: Scope,
): void {
  for (const record of [invoice, order]) {
    if (
      record.tenantId !== scope.tenantId ||
      record.companyId !== scope.companyId ||
      record.projectId !== scope.projectId
    ) {
      throw new ServiceError("FORBIDDEN", "Los documentos no pertenecen al alcance autorizado.");
    }
  }
  if (
    invoice.status !== "ISSUED" ||
    invoice.documentKind !== "INVOICE" ||
    invoice.purchaseOrderId ||
    invoice.subcontractCertificationId
  ) {
    throw new ServiceError(
      "CONFLICT",
      "La regularización requiere una factura emitida sin OC ni subcontrato.",
    );
  }
  if (order.status !== "RECEIVED" || order.supplierInvoices.length > 0) {
    throw new ServiceError("CONFLICT", "La OC debe estar recibida y sin otras facturas activas.");
  }
  if (
    invoice.supplierContactId !== order.supplierContactId ||
    invoice.currency !== order.currency ||
    !invoice.totalAmount.equals(order.totalAmount)
  ) {
    throw new ServiceError(
      "CONFLICT",
      "Deben coincidir proveedor, moneda y total final; no se modifican importes ni impuestos.",
    );
  }
  const line = invoice.lines[0];
  const poLine = order.lines[0];
  if (
    invoice.lines.length !== 1 ||
    order.lines.length !== 1 ||
    !line ||
    !poLine ||
    line.id !== pair.invoiceLineId ||
    poLine.id !== pair.purchaseOrderLineId ||
    line.purchaseOrderLineId ||
    line.costAnalysisLineId ||
    !poLine.wbsNodeId ||
    !line.quantity.equals(poLine.quantity) ||
    !poLine.receivedQuantity.equals(poLine.quantity)
  ) {
    throw new ServiceError(
      "CONFLICT",
      "Se requiere un vínculo explícito entre las dos líneas completas, sin insumo APU previo.",
    );
  }
  if (
    invoice.payable?.status !== "PAID" ||
    !invoice.payable.paidAmount.equals(invoice.totalAmount) ||
    !invoice.payable.creditedAmount.isZero()
  ) {
    throw new ServiceError(
      "CONFLICT",
      "La factura debe estar pagada íntegramente, sin créditos aplicados.",
    );
  }
}

/**
 * Platform-only repair authorized after documentary reconciliation. Ordinary ISSUED
 * editing remains forbidden. Writes only header/line PO links, WBS and audit;
 * never recreates invoices, changes fiscal amounts, or touches payments/treasury.
 */
export async function reconcilePaidSupplierInvoicesWithPurchaseOrders(
  input: Scope & { reason: string; pairs: Pair[] },
  operator: PlatformServiceContext,
): Promise<Array<{ invoiceId: string; purchaseOrderId: string; wbsNodeId: string }>> {
  await assertPlatformAccess(operator);
  if (
    input.reason.trim().length < 10 ||
    input.pairs.length === 0 ||
    new Set(input.pairs.map((p) => p.invoiceId)).size !== input.pairs.length ||
    new Set(input.pairs.map((p) => p.purchaseOrderId)).size !== input.pairs.length
  ) {
    throw new ServiceError("VALIDATION", "Indicá el motivo y pares de documentos únicos.");
  }
  return prisma.$transaction(
    async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: input.companyId, tenantId: input.tenantId },
        select: { id: true },
      });
      const project = await tx.project.findFirst({
        where: {
          id: input.projectId,
          tenantId: input.tenantId,
          companyId: input.companyId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!company || !project)
        throw new ServiceError("FORBIDDEN", "Empresa u obra fuera de alcance o inactiva.");
      await lockCompanyForFinancialWrite(tx, input.companyId);
      const results: Array<{ invoiceId: string; purchaseOrderId: string; wbsNodeId: string }> = [];
      for (const pair of [...input.pairs].sort((a, b) =>
        a.purchaseOrderId.localeCompare(b.purchaseOrderId),
      )) {
        await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${pair.purchaseOrderId} AND "tenantId" = ${input.tenantId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${pair.invoiceId} AND "tenantId" = ${input.tenantId} FOR UPDATE`;
        const invoice = await tx.supplierInvoice.findFirst({
          where: { id: pair.invoiceId, tenantId: input.tenantId },
          include: {
            lines: true,
            payable: true,
            apPayments: { where: { status: "CONFIRMED" } },
            creditDebitNotes: { where: { status: { not: "CANCELLED" } } },
          },
        });
        const order = await tx.purchaseOrder.findFirst({
          where: { id: pair.purchaseOrderId, tenantId: input.tenantId },
          include: { lines: true, supplierInvoices: { where: { status: { not: "CANCELLED" } } } },
        });
        if (!invoice || !order) throw new ServiceError("NOT_FOUND", "Factura u OC no encontrada.");
        assertPaidInvoicePoReconciliation(
          { ...invoice, projectId: invoice.projectId ?? "" },
          order,
          pair,
          input,
        );
        for (const record of [invoice.payable!, ...invoice.apPayments]) {
          if (
            record.tenantId !== input.tenantId ||
            record.companyId !== input.companyId ||
            record.projectId !== input.projectId ||
            record.supplierContactId !== invoice.supplierContactId
          ) {
            throw new ServiceError("CONFLICT", "La CxP o un pago tiene un alcance inconsistente.");
          }
        }
        if (
          invoice.updatedAt.toISOString() !== pair.expectedInvoiceUpdatedAt ||
          order.updatedAt.toISOString() !== pair.expectedOrderUpdatedAt ||
          invoice.creditDebitNotes.length > 0
        ) {
          throw new ServiceError(
            "CONFLICT",
            "Cambió un documento o tiene notas vinculadas; revisá nuevamente.",
          );
        }
        const wbsNodeId = order.lines[0]!.wbsNodeId!;
        const wbs = await tx.wbsNode.findFirst({
          where: {
            id: wbsNodeId,
            type: "ITEM",
            budget: {
              tenantId: input.tenantId,
              projectId: input.projectId,
              status: { in: ["APPROVED", "CLOSED"] },
            },
          },
          select: { id: true },
        });
        if (!wbs)
          throw new ServiceError(
            "CONFLICT",
            "La partida de la OC no es una hoja del presupuesto vigente.",
          );
        await assertFinancialPeriodOpen({ ...input, date: invoice.issueDate }, tx);
        for (const payment of invoice.apPayments)
          await assertFinancialPeriodOpen({ ...input, date: payment.paymentDate }, tx);
        if (
          !invoice.apPayments
            .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0))
            .equals(invoice.totalAmount)
        ) {
          throw new ServiceError("CONFLICT", "Los pagos confirmados no concilian con la factura.");
        }
        const posted = await tx.journalEntry.count({
          where: {
            tenantId: input.tenantId,
            status: "POSTED",
            sourceId: { in: [invoice.id, ...invoice.apPayments.map((p) => p.id)] },
          },
        });
        if (posted)
          throw new ServiceError(
            "CONFLICT",
            "Revisá los asientos contabilizados antes de regularizar.",
          );
        const line = invoice.lines[0]!;
        const changed = await tx.supplierInvoice.updateMany({
          where: {
            id: invoice.id,
            tenantId: input.tenantId,
            status: "ISSUED",
            purchaseOrderId: null,
            updatedAt: invoice.updatedAt,
          },
          data: { purchaseOrderId: order.id, updatedBy: operator.actorUserId },
        });
        assertOptimisticRowUpdate(changed.count, "La factura cambió durante la regularización.");
        const lineChanged = await tx.supplierInvoiceLine.updateMany({
          where: {
            id: line.id,
            invoiceId: invoice.id,
            updatedAt: line.updatedAt,
            purchaseOrderLineId: null,
          },
          data: { purchaseOrderLineId: pair.purchaseOrderLineId, wbsNodeId },
        });
        assertOptimisticRowUpdate(lineChanged.count, "La línea cambió durante la regularización.");
        await log(
          {
            tenantId: input.tenantId,
            companyId: input.companyId,
            projectId: input.projectId,
            actorUserId: operator.actorUserId,
            action: "supplier_invoice.updated",
            entityType: "SupplierInvoice",
            entityId: invoice.id,
            before: {
              number: invoice.number,
              purchaseOrderId: null,
              lineId: line.id,
              wbsNodeId: line.wbsNodeId,
              purchaseOrderLineId: null,
            },
            after: {
              number: invoice.number,
              purchaseOrderId: order.id,
              purchaseOrderNumber: order.number,
              lineId: line.id,
              wbsNodeId,
              purchaseOrderLineId: pair.purchaseOrderLineId,
              reason: input.reason.trim(),
            },
          },
          tx,
        );
        results.push({ invoiceId: invoice.id, purchaseOrderId: order.id, wbsNodeId });
      }
      return results;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
