import { Prisma, prisma } from "@bloqer/database";
import { getPurchaseOrderBillingSummary, type PurchaseOrderBillingSummary } from "../ap/supplier-invoice-from-po.service";
import { requireProjectAccess } from "../security/access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceError, type ServiceContext } from "../types";
import { canViewProcurementProjectArea } from "./procurement-access";
import { assertPurchaseOrderRelations, procurementOrderParentScopeInclude } from "./procurement-wbs";

export type ProcurementFollowUpRow = {
  id: string;
  code: string;
  supplierName: string;
  status: string;
  lineUnits: Record<string, string | null>;
  billing: PurchaseOrderBillingSummary | null;
  billingNotice: string | null;
};

/** Read-only, bounded overview. Billing keeps the same guards and formulas as the OC detail. */
export async function getProjectProcurementFollowUp(projectId: string, ctx: ServiceContext, page = 1) {
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROCUREMENT") || !gate.isEnabled("PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Compras o Proyectos no está disponible");
  }
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para consultar órdenes de compra");
  }
  await requireProjectAccess(projectId, ctx);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) {
    throw new ServiceError("VALIDATION", "Página de seguimiento inválida");
  }
  const pageSize = 10;
  const where = {
    tenantId: ctx.tenantId, projectId,
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
  } satisfies Prisma.PurchaseOrderWhereInput;
  const [orders, total] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({
      where, take: pageSize, skip: (page - 1) * pageSize,
      orderBy: [{ number: "desc" }, { id: "asc" }],
      include: {
        ...procurementOrderParentScopeInclude,
        supplierContact: { select: { tenantId: true, legalName: true, fantasyName: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  for (const order of orders) assertPurchaseOrderRelations(order);

  const rows: ProcurementFollowUpRow[] = [];
  // Limit concurrent summary reads instead of opening one connection per order.
  for (let start = 0; start < orders.length; start += 2) {
    rows.push(...await Promise.all(orders.slice(start, start + 2).map(async (order): Promise<ProcurementFollowUpRow> => {
      let billing: PurchaseOrderBillingSummary | null = null;
      let billingNotice: string | null = null;
      try {
        billing = await getPurchaseOrderBillingSummary(order.id, ctx);
      } catch (error) {
        if (!(error instanceof ServiceError)) throw error;
        if (error.code === "FORBIDDEN") {
          billingNotice = "Facturación no disponible para tu acceso o configuración. No se puede comprobar su cobertura.";
        } else if (error.code === "CONFLICT" || error.code === "VALIDATION" || error.code === "NOT_FOUND") {
          billingNotice = "No se pudo comprobar la facturación. Abrí la OC para revisar los documentos y su moneda.";
        } else throw error;
      }
      return {
        id: order.id, code: `OC-${String(order.number).padStart(3, "0")}`,
        supplierName: order.supplierContact.fantasyName || order.supplierContact.legalName,
        status: order.status, lineUnits: Object.fromEntries(order.lines.map((line) => [line.id, line.unit])), billing, billingNotice,
      };
    })));
  }
  return { rows, page, pageSize, total };
}
