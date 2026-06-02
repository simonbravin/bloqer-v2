import { prisma } from "@bloqer/database";
import type { ProjectStatus } from "@bloqer/database";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";
import { canViewProjectCancellationImpact } from "./project-lifecycle-access";

export type ProjectCancellationImpactBlocker = {
  key: string;
  label: string;
  count: number;
};

export type ProjectCancellationImpact = {
  projectId: string;
  projectStatus: ProjectStatus;
  blockers: ProjectCancellationImpactBlocker[];
  hasBlockers: boolean;
  /** Resolved target status when reactivating (preview for UI). */
  reactivationTargetStatus: ProjectStatus | null;
};

const OPEN_PO_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "SUBMITTED", "APPROVED"] as const;
const OPEN_CERT_STATUSES = ["DRAFT", "ISSUED", "APPROVED"] as const;
const OPEN_OBLIGATION_STATUSES = ["OPEN", "PARTIAL", "OVERDUE"] as const;

export async function countOpenOperationalDocuments(
  projectId: string,
  tenantId: string,
): Promise<ProjectCancellationImpactBlocker[]> {
  const [
    openPurchaseOrders,
    openPurchaseRequests,
    openCertifications,
    issuedSupplierInvoices,
    issuedSalesInvoices,
    confirmedCollections,
    confirmedPayments,
    openReceivables,
    openPayables,
    activeSubcontracts,
  ] = await Promise.all([
    prisma.purchaseOrder.count({
      where: { projectId, tenantId, status: { in: [...OPEN_PO_STATUSES] } },
    }),
    prisma.purchaseRequest.count({
      where: { projectId, tenantId, status: { in: ["DRAFT", "SUBMITTED", "QUOTE_SELECTED"] } },
    }),
    prisma.certification.count({
      where: { projectId, tenantId, status: { in: [...OPEN_CERT_STATUSES] } },
    }),
    prisma.supplierInvoice.count({
      where: { projectId, tenantId, status: "ISSUED" },
    }),
    prisma.salesInvoice.count({
      where: { projectId, tenantId, status: "ISSUED" },
    }),
    prisma.collection.count({
      where: { projectId, tenantId, status: "CONFIRMED" },
    }),
    prisma.payment.count({
      where: { projectId, tenantId, status: "CONFIRMED" },
    }),
    prisma.receivable.count({
      where: { projectId, tenantId, status: { in: [...OPEN_OBLIGATION_STATUSES] } },
    }),
    prisma.payable.count({
      where: { projectId, tenantId, status: { in: [...OPEN_OBLIGATION_STATUSES] } },
    }),
    prisma.subcontract.count({
      where: { projectId, tenantId, status: "ACTIVE" },
    }),
  ]);

  const blockers: ProjectCancellationImpactBlocker[] = [];
  if (openPurchaseOrders > 0) {
    blockers.push({ key: "purchase_orders", label: "Órdenes de compra abiertas", count: openPurchaseOrders });
  }
  if (openPurchaseRequests > 0) {
    blockers.push({
      key: "purchase_requests",
      label: "Solicitudes de compra abiertas",
      count: openPurchaseRequests,
    });
  }
  if (openCertifications > 0) {
    blockers.push({ key: "certifications", label: "Certificaciones abiertas", count: openCertifications });
  }
  if (issuedSupplierInvoices > 0) {
    blockers.push({ key: "supplier_invoices", label: "Facturas de proveedor emitidas", count: issuedSupplierInvoices });
  }
  if (issuedSalesInvoices > 0) {
    blockers.push({ key: "sales_invoices", label: "Facturas de venta emitidas", count: issuedSalesInvoices });
  }
  if (confirmedCollections > 0) {
    blockers.push({ key: "collections", label: "Cobranzas confirmadas", count: confirmedCollections });
  }
  if (confirmedPayments > 0) {
    blockers.push({ key: "payments", label: "Pagos confirmados", count: confirmedPayments });
  }
  if (openReceivables > 0) {
    blockers.push({ key: "receivables", label: "Cuentas por cobrar abiertas", count: openReceivables });
  }
  if (openPayables > 0) {
    blockers.push({ key: "payables", label: "Cuentas por pagar abiertas", count: openPayables });
  }
  if (activeSubcontracts > 0) {
    blockers.push({ key: "subcontracts", label: "Subcontratos activos", count: activeSubcontracts });
  }

  return blockers;
}

const REACTIVATION_TARGET_STATUSES: ProjectStatus[] = ["DRAFT", "ACTIVE", "ON_HOLD"];

export function sanitizeReactivationTargetStatus(status: ProjectStatus): ProjectStatus | null {
  return REACTIVATION_TARGET_STATUSES.includes(status) ? status : null;
}

export async function resolveReactivationTargetStatus(
  project: {
    id: string;
    tenantId: string;
    statusBeforeCancellation: ProjectStatus | null;
    startDate: Date | null;
  },
): Promise<ProjectStatus> {
  const stored = project.statusBeforeCancellation
    ? sanitizeReactivationTargetStatus(project.statusBeforeCancellation)
    : null;
  if (stored) return stored;

  const blockers = await countOpenOperationalDocuments(project.id, project.tenantId);
  const hasApprovedBudget = await prisma.budget.count({
    where: {
      projectId: project.id,
      tenantId: project.tenantId,
      status: { in: ["APPROVED", "CLOSED"] },
    },
  });

  const hadActivity = blockers.length > 0 || hasApprovedBudget > 0 || project.startDate != null;
  return hadActivity ? "ON_HOLD" : "DRAFT";
}

export async function getProjectCancellationImpact(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectCancellationImpact> {
  if (!canViewProjectCancellationImpact(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el impacto de cancelación");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      statusBeforeCancellation: true,
      startDate: true,
    },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const blockers =
    project.status === "ACTIVE" || project.status === "ON_HOLD"
      ? await countOpenOperationalDocuments(projectId, ctx.tenantId)
      : [];

  const reactivationTargetStatus =
    project.status === "CANCELLED"
      ? await resolveReactivationTargetStatus(project)
      : null;

  return {
    projectId,
    projectStatus: project.status,
    blockers,
    hasBlockers: blockers.length > 0,
    reactivationTargetStatus,
  };
}

export async function assertNoOpenOperationalDocuments(
  projectId: string,
  tenantId: string,
): Promise<void> {
  const blockers = await countOpenOperationalDocuments(projectId, tenantId);
  if (blockers.length > 0) {
    const summary = blockers.map((b) => `${b.count} ${b.label.toLowerCase()}`).join("; ");
    throw new ServiceError(
      "CONFLICT",
      `No se puede cancelar la obra con documentos operativos abiertos: ${summary}`,
    );
  }
}
