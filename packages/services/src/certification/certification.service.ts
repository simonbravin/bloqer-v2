import { Prisma, prisma } from "@bloqer/database";
import type { Certification, CertificationStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateCertificationInput, UpdateCertificationInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { createSystemNotification } from "../notifications/notification.service";
import { ServiceContext, ServiceError } from "../types";
import { _computePreviousQty, _recalcCertificationTotals } from "./certification-calc.service";
import {
  assertCertificationLineWithinBudget,
  assertCertificationStatusEditable,
} from "./certification-guards";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";

// ─── View types (Decimal fields serialized to string) ─────────────────────────

export type CertificationLineView = {
  id: string;
  certificationId: string;
  wbsNodeId: string;
  unitSalePriceSnapshot: string;
  budgetQty: string;
  physicalPct: string;
  previousQty: string;
  currentQty: string;
  cumulativeQty: string;
  remainingQty: string;
  periodAmount: string;
  notes: string | null;
  sortOrder: number;
  wbsNode: { code: string; name: string; unit: string };
};

export type CertificationWithLines = Omit<Certification, "totalAmount"> & {
  totalAmount: string;
  currency: string;
  code: string;
  lines: CertificationLineView[];
};

// ─── Guard ────────────────────────────────────────────────────────────────────

export function assertCertificationEditable(cert: Certification): void {
  assertCertificationStatusEditable(cert.status);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getCertificationById(
  id: string,
  ctx: ServiceContext,
): Promise<CertificationWithLines> {
  if (!can(ctx.roles, "VIEW", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver certificaciones");
  }
  const cert = await prisma.certification.findUnique({
    where: { id },
    include: {
      budget: { select: { currency: true } },
      lines: {
        include: { wbsNode: { include: { costItem: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeCertification(cert);
}

export async function listCertificationsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<CertificationWithLines[]> {
  if (!can(ctx.roles, "VIEW", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver certificaciones");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const certs = await prisma.certification.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: {
      budget: { select: { currency: true } },
      lines: {
        include: { wbsNode: { include: { costItem: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { number: "asc" },
  });
  return certs.map(serializeCertification);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createCertification(
  input: CreateCertificationInput,
  ctx: ServiceContext,
): Promise<CertificationWithLines> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear certificaciones");
  }

  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);

  // BR-CERT-001: budget must be APPROVED or CLOSED
  const budget = await prisma.budget.findUnique({ where: { id: input.budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.projectId !== input.projectId) {
    throw new ServiceError("CONFLICT", "El presupuesto no pertenece a este proyecto");
  }
  if (budget.status !== "APPROVED" && budget.status !== "CLOSED") {
    throw new ServiceError("CONFLICT", "Solo se puede certificar contra presupuestos aprobados o cerrados (BR-CERT-001)");
  }

  const maxNum = await prisma.certification.aggregate({
    where: { projectId: input.projectId },
    _max: { number: true },
  });
  const number = (maxNum._max.number ?? 0) + 1;

  const cert = await prisma.$transaction(async (tx) => {
    const c = await tx.certification.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId ?? undefined,
        projectId: input.projectId,
        budgetId: input.budgetId,
        number,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
      include: {
        budget: { select: { currency: true } },
        lines: { include: { wbsNode: { include: { costItem: true } } } },
      },
    });
    return c;
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification.created",
    entityType: "Certification",
    entityId: cert.id,
    after: { number, projectId: input.projectId, budgetId: input.budgetId },
    ipAddress: ctx.ipAddress,
  });

  return serializeCertification(cert);
}

export async function updateCertification(
  id: string,
  input: UpdateCertificationInput,
  ctx: ServiceContext,
): Promise<CertificationWithLines> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar certificaciones");
  }
  const cert = await prisma.certification.findUnique({ where: { id } });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx.tenantId);
  assertCertificationEditable(cert);

  const updated = await prisma.certification.update({
    where: { id },
    data: {
      periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
      periodEnd:   input.periodEnd   ? new Date(input.periodEnd)   : undefined,
      notes:         input.notes         ?? undefined,
      internalNotes: input.internalNotes ?? undefined,
      updatedBy: ctx.actorUserId,
    },
    include: {
      budget: { select: { currency: true } },
      lines: { include: { wbsNode: { include: { costItem: true } } }, orderBy: { sortOrder: "asc" } },
    },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification.updated",
    entityType: "Certification",
    entityId: id,
    after: input,
    ipAddress: ctx.ipAddress,
  });

  return serializeCertification(updated);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function issueCertification(id: string, ctx: ServiceContext): Promise<Certification> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir certificaciones");
  }

  const certPreview = await prisma.certification.findUnique({
    where: { id },
    select: { projectId: true, tenantId: true },
  });
  if (!certPreview) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (certPreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(certPreview.projectId, ctx.tenantId);

  // All validation, line recalculation, and status transition happen inside a
  // single transaction. This eliminates the check-then-update gap that allowed
  // two concurrent DRAFT certs to both pass BR-CERT-002 validation.
  //
  // Postgres default isolation (READ COMMITTED) ensures each statement within
  // the txn sees only committed rows, so _computePreviousQty will not count
  // a concurrently-issued cert that hasn't committed yet. A second concurrent
  // issuance for the same wbsNodeId that commits first will be visible to
  // subsequent statements in this txn, but the DRAFT→ISSUED update is atomic
  // and the status re-check inside the txn prevents double-issuance of the same
  // cert. Remaining risk: two DRAFT certs sharing a wbsNodeId issued within the
  // same txn window. Accepted for current single-tenant usage; see
  // PENDING_ARCHITECTURE_ITEMS.md P-CERT-01 for future advisory lock option.
  const updated = await prisma.$transaction(async (tx) => {
    const cert = await tx.certification.findUnique({
      where: { id },
      include: {
        project: true,
        lines: { include: { wbsNode: true } },
      },
    });
    if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
    if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    // Re-check status inside txn — rejects if a concurrent call already issued
    assertCertificationEditable(cert);

    // BR-CERT-002: validate + recalc using tx client exclusively (no global prisma)
    for (const line of cert.lines) {
      const livePrev = await _computePreviousQty(tx as never, line.wbsNodeId, id);
      const cumulative = livePrev.plus(line.currentQty);

      // Freeze recalculated previousQty and cumulativeQty on each line
      await tx.certificationLine.update({
        where: { id: line.id },
        data: {
          previousQty:   livePrev,
          cumulativeQty: cumulative,
          // unitSalePriceSnapshot intentionally NOT updated — frozen at line creation
        },
      });

      if (cumulative.greaterThan(line.budgetQty)) {
        assertCertificationLineWithinBudget({
          projectType: cert.project.type,
          itemCode: line.wbsNode.code,
          cumulative,
          budgetQty: line.budgetQty,
          certificationNotes: cert.notes,
        });
      }
    }

    return tx.certification.update({
      where: { id },
      data: { status: "ISSUED", issueDate: new Date(), updatedBy: ctx.actorUserId },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification.issued",
    entityType: "Certification",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "ISSUED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

export async function approveCertification(id: string, ctx: ServiceContext): Promise<Certification> {
  if (!can(ctx.roles, "APPROVE", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Se requiere permiso de aprobación");
  }
  const meta = await prisma.certification.findUnique({
    where: { id },
    select: { createdBy: true, projectId: true, number: true, companyId: true },
  });
  const updated = await _transition(id, ctx, ["ISSUED"], "APPROVED", "certification.approved");
  const creatorId = meta?.createdBy;
  if (creatorId && creatorId !== ctx.actorUserId && meta) {
    try {
      await createSystemNotification({
        tenantId: ctx.tenantId,
        companyId: meta.companyId,
        recipientUserId: creatorId,
        type: "CERTIFICATION_APPROVED",
        title: "Certificación aprobada",
        body: `La certificación n.º ${meta.number} fue aprobada.`,
        severity: "SUCCESS",
        linkedEntityType: "CERTIFICATION",
        linkedEntityId: id,
        projectId: meta.projectId,
        actionUrl: `/proyectos/${meta.projectId}/certificaciones/${id}`,
        metadata: { certificationNumber: meta.number },
      });
    } catch {
      /* best-effort in-app notification (Phase 8A) */
    }
  }
  return updated;
}

export async function rejectCertification(id: string, ctx: ServiceContext): Promise<Certification> {
  if (!can(ctx.roles, "APPROVE", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Se requiere permiso de revisión");
  }
  return _transition(id, ctx, ["ISSUED"], "REJECTED", "certification.rejected");
}

export async function cancelCertification(id: string, ctx: ServiceContext): Promise<Certification> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar certificaciones");
  }
  // BR-CERT-005: block if a non-cancelled SalesInvoice is linked to this certification
  const activeInvoice = await prisma.salesInvoice.findFirst({
    where: { certificationId: id, status: { not: "CANCELLED" } },
  });
  if (activeInvoice) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar la certificación porque tiene una factura activa. Anule la factura primero.",
    );
  }
  return _transition(id, ctx, ["DRAFT", "ISSUED", "APPROVED"], "CANCELLED", "certification.cancelled");
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _transition(
  id: string,
  ctx: ServiceContext,
  allowedFrom: CertificationStatus[],
  to: CertificationStatus,
  action: string,
): Promise<Certification> {
  const cert = await prisma.certification.findUnique({ where: { id } });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!allowedFrom.includes(cert.status)) {
    throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde "${cert.status}"`);
  }

  const updated = await prisma.certification.update({
    where: { id },
    data: { status: to, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action,
    entityType: "Certification",
    entityId: id,
    before: { status: cert.status },
    after: { status: to },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawCert = Certification & {
  budget: { currency: string };
  lines: Array<{
    id: string;
    certificationId: string;
    wbsNodeId: string;
    unitSalePriceSnapshot: Prisma.Decimal;
    budgetQty: Prisma.Decimal;
    physicalPct: Prisma.Decimal;
    previousQty: Prisma.Decimal;
    currentQty: Prisma.Decimal;
    cumulativeQty: Prisma.Decimal;
    periodAmount: Prisma.Decimal;
    notes: string | null;
    sortOrder: number;
    wbsNode: { code: string; name: string; costItem: { unit: string } | null };
  }>;
};

function serializeCertification(cert: RawCert): CertificationWithLines {
  return {
    ...cert,
    code: `CERT-${String(cert.number).padStart(3, "0")}`,
    currency: cert.budget.currency,
    totalAmount: cert.totalAmount.toString(),
    lines: cert.lines.map((l) => {
      const remaining = l.budgetQty.minus(l.cumulativeQty);
      return {
        id: l.id,
        certificationId: l.certificationId,
        wbsNodeId: l.wbsNodeId,
        unitSalePriceSnapshot: l.unitSalePriceSnapshot.toString(),
        budgetQty: l.budgetQty.toString(),
        physicalPct: l.physicalPct.toString(),
        previousQty: l.previousQty.toString(),
        currentQty: l.currentQty.toString(),
        cumulativeQty: l.cumulativeQty.toString(),
        remainingQty: remaining.toString(),
        periodAmount: l.periodAmount.toString(),
        notes: l.notes,
        sortOrder: l.sortOrder,
        wbsNode: {
          code: l.wbsNode.code,
          name: l.wbsNode.name,
          unit: l.wbsNode.costItem?.unit ?? "",
        },
      };
    }),
  };
}
