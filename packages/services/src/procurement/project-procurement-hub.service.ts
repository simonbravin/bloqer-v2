import { prisma } from "@bloqer/database";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { canViewProcurementProjectArea, canViewPurchaseRequests } from "./procurement-access";

export type ProjectProcurementHub = {
  projectId: string;
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

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");

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
      where: { projectId, tenantId: ctx.tenantId, status: "DRAFT" },
    }),
    prisma.purchaseRequest.count({
      where: { projectId, tenantId: ctx.tenantId, status: "SUBMITTED" },
    }),
    prisma.purchaseRequest.count({
      where: { projectId, tenantId: ctx.tenantId, status: "QUOTE_SELECTED" },
    }),
    prisma.purchaseOrder.count({
      where: { projectId, tenantId: ctx.tenantId, status: "DRAFT" },
    }),
    prisma.purchaseOrder.count({
      where: { projectId, tenantId: ctx.tenantId, status: "SUBMITTED" },
    }),
    prisma.purchaseOrder.count({
      where: { projectId, tenantId: ctx.tenantId, status: "APPROVED" },
    }),
    prisma.purchaseOrder.count({
      where: { projectId, tenantId: ctx.tenantId, status: "CONFIRMED" },
    }),
    prisma.purchaseOrder.count({
      where: { projectId, tenantId: ctx.tenantId, status: "PARTIALLY_RECEIVED" },
    }),
    prisma.purchaseReceipt.count({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        status: "CONFIRMED",
        receiptDate: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.purchaseRequest.count({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        status: "SUBMITTED",
        quotes: { some: { status: { in: ["RECEIVED", "SELECTED"] } } },
      },
    }),
  ]);

  const base = `/proyectos/${projectId}`;
  return {
    projectId,
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
    },
  };
}
