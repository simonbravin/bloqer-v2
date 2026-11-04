import { prisma } from "@bloqer/database";
import type { Prisma, ProjectStatus } from "@bloqer/database";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";
import { requireProjectAccess } from "../security/access";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
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
  db: Prisma.TransactionClient | typeof prisma = prisma,
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
    db.purchaseOrder.count({
      where: { projectId, tenantId, status: { in: [...OPEN_PO_STATUSES] } },
    }),
    db.purchaseRequest.count({
      where: { projectId, tenantId, status: { in: ["DRAFT", "SUBMITTED", "QUOTE_SELECTED"] } },
    }),
    db.certification.count({
      where: { projectId, tenantId, status: { in: [...OPEN_CERT_STATUSES] } },
    }),
    db.supplierInvoice.count({
      where: { projectId, tenantId, status: "ISSUED" },
    }),
    db.salesInvoice.count({
      where: { projectId, tenantId, status: "ISSUED" },
    }),
    db.collection.count({
      where: { projectId, tenantId, status: "CONFIRMED" },
    }),
    db.payment.count({
      where: { projectId, tenantId, status: "CONFIRMED" },
    }),
    db.receivable.count({
      where: { projectId, tenantId, status: { in: [...OPEN_OBLIGATION_STATUSES] } },
    }),
    db.payable.count({
      where: { projectId, tenantId, status: { in: [...OPEN_OBLIGATION_STATUSES] } },
    }),
    db.subcontract.count({
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
  if (project.startDate != null) return "ON_HOLD";

  // BR-PROJ-006 asks whether the project ever had activity, including closed or
  // cancelled documents. Current cancellation blockers do not answer that.
  const historical = await prisma.project.findFirst({
    where: { id: project.id, tenantId: project.tenantId },
    select: {
      _count: {
        select: {
          budgets: { where: { tenantId: project.tenantId, status: { in: ["APPROVED", "CLOSED"] } } },
          purchaseOrders: { where: { tenantId: project.tenantId } },
          purchaseRequests: { where: { tenantId: project.tenantId } },
          purchaseReceipts: { where: { tenantId: project.tenantId } },
          certifications: { where: { tenantId: project.tenantId } },
          supplierInvoices: { where: { tenantId: project.tenantId } },
          salesInvoices: { where: { tenantId: project.tenantId } },
          collections: { where: { tenantId: project.tenantId } },
          payments: { where: { tenantId: project.tenantId } },
          receivables: { where: { tenantId: project.tenantId } },
          payables: { where: { tenantId: project.tenantId } },
          subcontracts: { where: { tenantId: project.tenantId } },
          subcontractCertifications: { where: { tenantId: project.tenantId } },
          stockMovements: { where: { tenantId: project.tenantId } },
          warehouseTransfers: { where: { tenantId: project.tenantId } },
          jobsiteLogs: { where: { tenantId: project.tenantId } },
          accountMovements: { where: { tenantId: project.tenantId } },
          journalEntries: { where: { tenantId: project.tenantId } },
        },
      },
    },
  });
  if (!historical) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  const hadActivity = Object.values(historical._count).some((count) => count > 0);
  return hadActivity ? "ON_HOLD" : "DRAFT";
}

export async function getProjectCancellationImpact(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectCancellationImpact> {
  if (!canViewProjectCancellationImpact(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el impacto de cancelación");
  }
  await assertTenantModuleEnabled(ctx, "PROJECTS");
  await requireProjectAccess(projectId, ctx);

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
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const blockers = await countOpenOperationalDocuments(projectId, tenantId, db);
  if (blockers.length > 0) {
    const summary = blockers.map((b) => `${b.count} ${b.label.toLowerCase()}`).join("; ");
    throw new ServiceError(
      "CONFLICT",
      `No se puede cancelar la obra con documentos operativos abiertos: ${summary}`,
    );
  }
}
