import { Prisma, prisma } from "@bloqer/database";
import type { Certification, CertificationStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { roundQty } from "@bloqer/utils";
import type { CreateCertificationInput, UpdateCertificationInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { createSystemNotification } from "../notifications/notification.service";
import { resolveNotificationAudience } from "../notifications/notification-audience.service";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { ServiceContext, ServiceError } from "../types";
import { _computePreviousQty, _recalcCertificationTotals } from "./certification-calc.service";
import {
  assertCertificationLineWithinBudget,
  assertCertificationStatusEditable,
} from "./certification-guards";

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

  if (input.periodEnd < input.periodStart) {
    throw new ServiceError("VALIDATION", "La fecha de fin del período no puede ser anterior al inicio");
  }

  // BR-CERT-001: budget must be APPROVED or CLOSED
  const budget = await prisma.budget.findFirst({
    where: { id: input.budgetId, tenantId: ctx.tenantId, projectId: input.projectId },
  });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.status !== "APPROVED" && budget.status !== "CLOSED") {
    throw new ServiceError("CONFLICT", "Solo se puede certificar contra presupuestos aprobados o cerrados (BR-CERT-001)");
  }

  let cert;
  try {
    cert = await prisma.$transaction(async (tx) => {
      const maxNum = await tx.certification.aggregate({
        where: { projectId: input.projectId, tenantId: ctx.tenantId },
        _max: { number: true },
      });
      const number = (maxNum._max.number ?? 0) + 1;
      return tx.certification.create({
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
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "Ya existe una certificación con ese número. Reintentá en unos segundos.",
      );
    }
    throw e;
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "certification.created",
    entityType: "Certification",
    entityId: cert.id,
    after: { number: cert.number, projectId: input.projectId, budgetId: input.budgetId },
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

  const nextStart = input.periodStart ?? cert.periodStart.toISOString().slice(0, 10);
  const nextEnd = input.periodEnd ?? cert.periodEnd.toISOString().slice(0, 10);
  if (nextEnd < nextStart) {
    throw new ServiceError("VALIDATION", "La fecha de fin del período no puede ser anterior al inicio");
  }

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

  // Single txn + project advisory lock serializes concurrent issues that share WBS
  // lines (P-CERT-01 / BR-CERT-002). Conditional DRAFT→ISSUED update prevents TOCTOU.
  const CERT_ISSUE_ADVISORY_CLASS_ID = 824_014_002;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${CERT_ISSUE_ADVISORY_CLASS_ID}::integer, hashtext(${certPreview.projectId}::text))`,
    );

    const cert = await tx.certification.findUnique({
      where: { id },
      include: {
        project: true,
        lines: { include: { wbsNode: true } },
      },
    });
    if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
    if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    assertCertificationEditable(cert);

    if (cert.lines.length === 0) {
      throw new ServiceError(
        "VALIDATION",
        "No se puede emitir una certificación sin líneas",
      );
    }

    // BR-CERT-002: validate + recalc using tx client exclusively (no global prisma)
    for (const line of cert.lines) {
      const livePrev = await _computePreviousQty(tx as never, line.wbsNodeId, id, cert.tenantId);
      const cumulative = livePrev.plus(line.currentQty);

      // Ceiling vs presupuesto vigente (live CostItem.quantity); keep sale snapshot frozen.
      const liveCostItem = await tx.costItem.findFirst({
        where: { wbsNodeId: line.wbsNodeId },
        select: { quantity: true },
      });
      const ceilingQty = liveCostItem?.quantity ?? line.budgetQty;

      // Freeze recalculated previousQty and cumulativeQty on each line
      await tx.certificationLine.update({
        where: { id: line.id },
        data: {
          previousQty:   livePrev,
          cumulativeQty: cumulative,
          budgetQty: ceilingQty,
          // unitSalePriceSnapshot intentionally NOT updated — frozen at line creation
        },
      });

      if (cumulative.greaterThan(ceilingQty)) {
        assertCertificationLineWithinBudget({
          projectType: cert.project.type,
          itemCode: line.wbsNode.code,
          cumulative,
          budgetQty: ceilingQty,
          certificationNotes: cert.notes,
        });
      }
    }

    const flipped = await tx.certification.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: { status: "ISSUED", issueDate: new Date(), updatedBy: ctx.actorUserId },
    });
    if (flipped.count === 0) {
      throw new ServiceError(
        "CONFLICT",
        "La certificación ya no está en borrador. Recargá e intentá de nuevo.",
      );
    }
    return tx.certification.findUniqueOrThrow({ where: { id } });
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
    select: { createdBy: true, projectId: true, number: true, companyId: true, tenantId: true },
  });
  if (!meta) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (meta.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(meta.projectId, ctx.tenantId);
  const updated = await _transition(id, ctx, ["ISSUED"], "APPROVED", "certification.approved");

  const recipients = await resolveNotificationAudience({
    tenantId: ctx.tenantId,
    primaryUserIds: meta.createdBy ? [meta.createdBy] : [],
    excludeUserId: ctx.actorUserId,
  });

  for (const recipientUserId of recipients) {
    try {
      await createSystemNotification({
        tenantId: ctx.tenantId,
        companyId: meta.companyId,
        recipientUserId,
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
  const meta = await prisma.certification.findUnique({
    where: { id },
    select: { projectId: true, tenantId: true },
  });
  if (!meta) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (meta.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(meta.projectId, ctx.tenantId);
  return _transition(id, ctx, ["ISSUED"], "REJECTED", "certification.rejected");
}

export async function cancelCertification(id: string, ctx: ServiceContext): Promise<Certification> {
  if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar certificaciones");
  }
  const meta = await prisma.certification.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true },
  });
  if (!meta) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (meta.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(meta.projectId, ctx.tenantId);

  // BR-CERT-005: block if a non-cancelled SalesInvoice is linked to this certification
  const activeInvoice = await prisma.salesInvoice.findFirst({
    where: { certificationId: id, tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
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

  const result = await prisma.certification.updateMany({
    where: { id, tenantId: ctx.tenantId, status: { in: allowedFrom } },
    data: { status: to, updatedBy: ctx.actorUserId },
  });
  if (result.count === 0) {
    throw new ServiceError(
      "CONFLICT",
      `No se puede cambiar el estado desde "${cert.status}". Recargá e intentá de nuevo.`,
    );
  }
  const updated = await prisma.certification.findUniqueOrThrow({ where: { id } });

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
    totalAmount: serializeMoneyDecimal(cert.totalAmount),
    lines: cert.lines.map((l) => {
      const remaining = l.budgetQty.minus(l.cumulativeQty);
      return {
        id: l.id,
        certificationId: l.certificationId,
        wbsNodeId: l.wbsNodeId,
        unitSalePriceSnapshot: serializeMoneyDecimal(l.unitSalePriceSnapshot),
        budgetQty: roundQty(l.budgetQty.toString()),
        physicalPct: roundQty(l.physicalPct.toString()),
        previousQty: roundQty(l.previousQty.toString()),
        currentQty: roundQty(l.currentQty.toString()),
        cumulativeQty: roundQty(l.cumulativeQty.toString()),
        remainingQty: roundQty(remaining.toString()),
        periodAmount: serializeMoneyDecimal(l.periodAmount),
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
