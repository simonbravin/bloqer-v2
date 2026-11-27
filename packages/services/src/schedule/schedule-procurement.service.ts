import { prisma, type Prisma } from "@bloqer/database";
import { companyScopeFilter } from "../company-scope";
import { serializeQtyDecimal } from "../finance/money-decimal";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { canViewProcurementCapability, requireProjectAccess } from "../security/access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";
import { formatDateOnly } from "./schedule-helpers";
import { remainingScheduleProcurementQuantity, type ScheduleProcurementByWbs } from "./schedule-procurement";

/** Shared, bounded-to-project read for desktop, Field and export. No cost-control query. */
export async function loadScheduleProcurementByWbs(
  projectId: string,
  ctx: ServiceContext,
  wbsNodeIds: string[],
): Promise<Map<string, ScheduleProcurementByWbs>> {
  const result = new Map<string, ScheduleProcurementByWbs>();
  if (wbsNodeIds.length === 0 || !canViewProcurementCapability(ctx.roles)) return result;
  const project = await requireProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROCUREMENT")) return result;
  const canReadOrderDetails = canViewProcurementProjectArea(ctx.roles);
  const wbsWhere = {
    id: { in: [...new Set(wbsNodeIds)] },
    budget: { tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) },
  } satisfies Prisma.WbsNodeWhereInput;
  const orderScope = {
    tenantId: ctx.tenantId,
    projectId,
    company: { tenantId: ctx.tenantId },
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
  } satisfies Prisma.PurchaseOrderWhereInput;
  const [orderLines, receiptLines] = await Promise.all([
    prisma.purchaseOrderLine.findMany({
      where: {
        wbsNode: wbsWhere,
        purchaseOrder: { ...orderScope, status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] } },
      },
      orderBy: [{ purchaseOrder: { number: "asc" } }, { sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true, description: true, unit: true, quantity: true, receivedQuantity: true,
        wbsNode: { select: { id: true, code: true, budget: { select: { companyId: true } } } },
        purchaseOrder: { select: { id: true, number: true, expectedDeliveryDate: true, companyId: true } },
      },
    }),
    prisma.purchaseReceiptLine.findMany({
      where: {
        purchaseOrderLine: { wbsNode: wbsWhere, purchaseOrder: orderScope },
        purchaseReceipt: { ...orderScope, status: "CONFIRMED", purchaseOrder: orderScope },
      },
      select: {
        purchaseOrderLine: { select: { wbsNodeId: true, purchaseOrderId: true, purchaseOrder: { select: { companyId: true } }, wbsNode: { select: { budget: { select: { companyId: true } } } } } },
        purchaseReceipt: { select: { receiptDate: true, purchaseOrderId: true, companyId: true } },
      },
    }),
  ]);
  const rowFor = (id: string) => {
    let row = result.get(id);
    if (!row) {
      row = { expectedDeliveryDate: null, latestReceiptDate: null, pendingLines: canReadOrderDetails ? [] : null };
      result.set(id, row);
    }
    return row;
  };
  for (const line of orderLines) {
    if (!line.wbsNode) continue;
    const row = rowFor(line.wbsNode.id);
    if ((line.wbsNode.budget.companyId && line.wbsNode.budget.companyId !== line.purchaseOrder.companyId)
      || (project.companyId && project.companyId !== line.purchaseOrder.companyId)) {
      row.incompleteSources = true;
      continue;
    }
    const expected = formatDateOnly(line.purchaseOrder.expectedDeliveryDate);
    // D-104 date is based on open OC, including their already received lines.
    if (expected && (!row.expectedDeliveryDate || expected < row.expectedDeliveryDate)) row.expectedDeliveryDate = expected;
    if (!canReadOrderDetails) continue;
    const quantity = serializeQtyDecimal(line.quantity);
    const receivedQuantity = serializeQtyDecimal(line.receivedQuantity);
    const remainingQuantity = remainingScheduleProcurementQuantity(quantity, receivedQuantity);
    if (remainingQuantity === "0.0000") continue;
    row.pendingLines!.push({
      id: line.id, purchaseOrderId: line.purchaseOrder.id,
      purchaseOrderCode: `OC-${String(line.purchaseOrder.number).padStart(3, "0")}`,
      wbsNodeId: line.wbsNode.id, wbsCode: line.wbsNode.code,
      description: line.description, unit: line.unit, quantity, receivedQuantity,
      remainingQuantity, expectedDeliveryDate: expected,
    });
  }
  for (const line of receiptLines) {
    const wbsId = line.purchaseOrderLine.wbsNodeId;
    if (!wbsId) continue;
    const row = rowFor(wbsId);
    const orderCompany = line.purchaseOrderLine.purchaseOrder.companyId;
    const budgetCompany = line.purchaseOrderLine.wbsNode?.budget.companyId;
    if (line.purchaseOrderLine.purchaseOrderId !== line.purchaseReceipt.purchaseOrderId
      || line.purchaseReceipt.companyId !== orderCompany
      || (budgetCompany && budgetCompany !== orderCompany)
      || (project.companyId && project.companyId !== orderCompany)) {
      row.incompleteSources = true;
      continue;
    }
    const date = formatDateOnly(line.purchaseReceipt.receiptDate);
    if (date && (!row.latestReceiptDate || date > row.latestReceiptDate)) row.latestReceiptDate = date;
  }
  return result;
}
