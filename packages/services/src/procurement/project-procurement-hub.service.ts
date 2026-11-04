import { prisma } from "@bloqer/database";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { canViewProcurementProjectArea, canViewPurchaseRequests } from "./procurement-access";
import { requireProjectAccess } from "../security/access";

export type ProjectProcurementHub = {
  projectId: string;
  /** Do not present inaccessible order/receipt sources as empty counts. */
  canViewOrders: boolean;
  purchaseRequests: {
    openDraft: number;
    submitted: number;
    quoteSelected: number;
    awaitingQuotes: number;
  };
  purchaseOrders: {
    draft: number;
    submitted: number;
    approved: number;
    confirmedOpen: number;
    partiallyReceived: number;
  };
  receipts: {
    recentConfirmed: number;
  };
  links: {
    hub: string;
    solicitudes: string;
    ordenes: string;
    recepciones: string;
    reporteCompras: string;
    reporteProveedores: string;
  };
};

function canViewHub(roles: ServiceContext["roles"]): boolean {
  return canViewProcurementProjectArea(roles) || canViewPurchaseRequests(roles);
}

export async function getProjectProcurementHub(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectProcurementHub> {
  if (!canViewHub(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el hub de compras");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROCUREMENT")) {
    throw new ServiceError("FORBIDDEN", "Módulo de compras deshabilitado");
  }

  if (!gate.isEnabled("PROJECTS")) throw new ServiceError("FORBIDDEN", "Módulo de proyectos deshabilitado");
  await requireProjectAccess(projectId, ctx);
  const canViewOrders = canViewProcurementProjectArea(ctx.roles);
  const sourceWhere = { projectId, tenantId: ctx.tenantId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) };

  const [
    prDraft,
    prSubmitted,
    prQuoteSelected,
    poDraft,
    poSubmitted,
    poApproved,
    poConfirmed,
    poPartial,
    receiptsRecent,
    prWithQuotes,
  ] = await Promise.all([
    prisma.purchaseRequest.count({
      where: { ...sourceWhere, status: "DRAFT" },
    }),
    prisma.purchaseRequest.count({
      where: { ...sourceWhere, status: "SUBMITTED" },
    }),
    prisma.purchaseRequest.count({
      where: { ...sourceWhere, status: "QUOTE_SELECTED" },
    }),
    canViewOrders ? prisma.purchaseOrder.count({
      where: { ...sourceWhere, status: "DRAFT" },
    }) : Promise.resolve(0),
    canViewOrders ? prisma.purchaseOrder.count({
      where: { ...sourceWhere, status: "SUBMITTED" },
    }) : Promise.resolve(0),
    canViewOrders ? prisma.purchaseOrder.count({
      where: { ...sourceWhere, status: "APPROVED" },
    }) : Promise.resolve(0),
    canViewOrders ? prisma.purchaseOrder.count({
      where: { ...sourceWhere, status: "CONFIRMED" },
    }) : Promise.resolve(0),
    canViewOrders ? prisma.purchaseOrder.count({
      where: { ...sourceWhere, status: "PARTIALLY_RECEIVED" },
    }) : Promise.resolve(0),
    canViewOrders ? prisma.purchaseReceipt.count({
      where: {
        ...sourceWhere,
        status: "CONFIRMED",
        receiptDate: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
    }) : Promise.resolve(0),
    prisma.purchaseRequest.count({
      where: {
        ...sourceWhere,
        status: "SUBMITTED",
        quotes: { some: { tenantId: ctx.tenantId, status: { in: ["RECEIVED", "SELECTED"] } } },
      },
    }),
  ]);

  const base = `/proyectos/${projectId}`;
  return {
    projectId,
    canViewOrders,
    purchaseRequests: {
      openDraft: prDraft,
      submitted: prSubmitted,
      quoteSelected: prQuoteSelected,
      awaitingQuotes: Math.max(0, prSubmitted - prWithQuotes),
    },
    purchaseOrders: {
      draft: poDraft,
      submitted: poSubmitted,
      approved: poApproved,
      confirmedOpen: poConfirmed,
      partiallyReceived: poPartial,
    },
    receipts: { recentConfirmed: receiptsRecent },
    links: {
      hub: `${base}/compras`,
      solicitudes: `${base}/solicitudes-compra`,
      ordenes: `${base}/ordenes-compra`,
      recepciones: `${base}/recepciones`,
      reporteCompras: `${base}/reportes/compras-proveedores`,
      reporteProveedores: `${base}/reportes/proveedores`,
    },
  };
}
