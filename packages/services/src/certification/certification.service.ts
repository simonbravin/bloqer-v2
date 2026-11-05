import { Prisma, prisma } from "@bloqer/database";
import type { Certification, CertificationStatus } from "@bloqer/database";

import {
  createCertificationSchema,
  updateCertificationSchema,
  type CreateCertificationInput,
  type UpdateCertificationInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";
import { createSystemNotification } from "../notifications/notification.service";
import { resolveNotificationAudience } from "../notifications/notification-audience.service";
import {
  formatCertificationCode,
  formatNotificationTitle,
} from "../notifications/notification-copy";
import {
  assertProjectAllowsOperationalMutation,
  lockProjectForOperationalMutation,
} from "../project/project-operational-guard";
import { requireProjectAccess, filterUserIdsByProjectAccess } from "../security/access";

import { resolveActiveCompanyId } from "../company/company.service";
import { ServiceContext, ServiceError } from "../types";
import {
  _lockCertificationProject,
  _lockEditableCertification,
} from "./certification-calc.service";
import {
  assertCertificationLineWithinBudget,
  assertCertificationStatusEditable,
  assertCertificationMeasurementValues,
} from "./certification-guards";

import {
  authorizeCertification,
  certificationInclude,
  certificationBudgetSelect,
  certificationWhere,
  assertCertificationRelations,
  assertCertificationBudget,
  assertCertificationBudgetActive,
  loadCertificationRecord,
  requireCertificationAccess,
  type CertificationRecord,
} from "./certification-scope";

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
  await authorizeCertification(ctx, "VIEW");
  const cert = await requireCertificationAccess(id, ctx);
  return serializeCertification(cert);
}

export async function listCertificationsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<CertificationWithLines[]> {
  await authorizeCertification(ctx, "VIEW");
  await requireProjectAccess(projectId, ctx);

  const certs = await prisma.certification.findMany({
    where: { projectId, ...certificationWhere(ctx) },
    include: certificationInclude,
    orderBy: { number: "asc" },
  });
  for (const cert of certs) assertCertificationRelations(cert, ctx);
  return certs.map(serializeCertification);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createCertification(
  input: CreateCertificationInput,
  ctx: ServiceContext,
): Promise<CertificationWithLines> {
  await authorizeCertification(ctx, "EDIT");

  const parsed = createCertificationSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  input = parsed.data;
  const project = await assertProjectAllowsOperationalMutation(input.projectId, ctx);

  if (input.periodEnd < input.periodStart) {
    throw new ServiceError(
      "VALIDATION",
      "La fecha de fin del período no puede ser anterior al inicio",
    );
  }

  // BR-CERT-001: budget must be APPROVED or CLOSED
  const budget = await prisma.budget.findFirst({
    where: { id: input.budgetId, tenantId: ctx.tenantId, projectId: input.projectId },
    select: certificationBudgetSelect,
  });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.status !== "APPROVED" && budget.status !== "CLOSED") {
    throw new ServiceError(
      "CONFLICT",
      "Solo se puede certificar contra presupuestos aprobados o cerrados (BR-CERT-001)",
    );
  }

  const preferredCompanyId = budget.companyId ?? project.companyId ?? ctx.companyId;
  const companyId = (await resolveActiveCompanyId(ctx, preferredCompanyId)) ?? null;
  if (preferredCompanyId && !companyId)
    throw new ServiceError(
      "FORBIDDEN",
      "La empresa del presupuesto no está activa en esta organización",
    );
  assertCertificationBudget(budget, project, companyId, ctx);

  let cert;
  try {
    cert = await prisma.$transaction(
      async (tx) => {
        const lockedProject = await lockProjectForOperationalMutation(tx, input.projectId, ctx);
        const lockedBudget = await tx.budget.findFirst({
          where: { id: input.budgetId, tenantId: ctx.tenantId },
          select: certificationBudgetSelect,
        });
        if (!lockedBudget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
        assertCertificationBudget(lockedBudget, lockedProject, companyId, ctx);
        assertCertificationBudgetActive(lockedBudget.status);
        if (
          companyId &&
          !(await tx.company.findFirst({
            where: { id: companyId, tenantId: ctx.tenantId, status: "ACTIVE" },
            select: { id: true },
          }))
        )
          throw new ServiceError(
            "FORBIDDEN",
            "La empresa de la certificación no está activa en esta organización",
          );
        const maxNum = await tx.certification.aggregate({
          where: { projectId: input.projectId, tenantId: ctx.tenantId },
          _max: { number: true },
        });
        const number = (maxNum._max.number ?? 0) + 1;
        const created = await tx.certification.create({
          data: {
            tenantId: ctx.tenantId,
            companyId,
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
          include: certificationInclude,
        });
        await log(
          {
            tenantId: ctx.tenantId,
            actorUserId: ctx.actorUserId,
            projectId: input.projectId,
            action: "certification.created",
            entityType: "Certification",
            entityId: created.id,
            after: { number: created.number, projectId: input.projectId, budgetId: input.budgetId },
            ipAddress: ctx.ipAddress,
          },
          tx,
        );
        return created;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "Ya existe una certificación con ese número. Reintentá en unos segundos.",
      );
    }
    throw e;
  }

  return serializeCertification(cert);
}

export async function updateCertification(
  id: string,
  input: UpdateCertificationInput,
  ctx: ServiceContext,
): Promise<CertificationWithLines> {
  await authorizeCertification(ctx, "EDIT");
  const parsed = updateCertificationSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  input = parsed.data;
  const cert = await requireCertificationAccess(id, ctx);
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx);
  assertCertificationEditable(cert);

  const updated = await prisma.$transaction(
    async (tx) => {
      await lockProjectForOperationalMutation(tx, cert.projectId, ctx);
      const current = await _lockEditableCertification(tx, id, ctx);
      const nextStart = input.periodStart ?? current.periodStart.toISOString().slice(0, 10);
      const nextEnd = input.periodEnd ?? current.periodEnd.toISOString().slice(0, 10);
      if (nextEnd < nextStart) {
        throw new ServiceError(
          "VALIDATION",
          "La fecha de fin del período no puede ser anterior al inicio",
        );
      }
      const result = await tx.certification.update({
        where: { id },
        data: {
          periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
          periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
          notes: input.notes,
          internalNotes: input.internalNotes,
          updatedBy: ctx.actorUserId,
        },
        include: certificationInclude,
      });
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          projectId: cert.projectId,
          action: "certification.updated",
          entityType: "Certification",
          entityId: id,
          after: input,
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
      return result;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return serializeCertification(updated);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function issueCertification(id: string, ctx: ServiceContext): Promise<Certification> {
  await authorizeCertification(ctx, "EDIT");

  const certPreview = await requireCertificationAccess(id, ctx);
  await assertProjectAllowsOperationalMutation(certPreview.projectId, ctx);

  // Single txn + project advisory lock serializes concurrent issues that share WBS
  // lines (P-CERT-01 / BR-CERT-002). Conditional DRAFT→ISSUED update prevents TOCTOU.
  const updated = await prisma.$transaction(
    async (tx) => {
      await lockProjectForOperationalMutation(tx, certPreview.projectId, ctx);
      await _lockCertificationProject(tx, certPreview.projectId);

      const cert = await loadCertificationRecord(id, ctx, tx);
      if (cert.projectId !== certPreview.projectId)
        throw new ServiceError("CONFLICT", "La certificación cambió. Recargá e intentá de nuevo.");
      assertCertificationBudgetActive(cert.budget.status);
      assertCertificationEditable(cert);

      if (cert.lines.length === 0) {
        throw new ServiceError("VALIDATION", "No se puede emitir una certificación sin líneas");
      }

      const nodeIds = cert.lines.map((line) => line.wbsNodeId);
      const previous = await tx.certificationLine.groupBy({
        by: ["wbsNodeId"],
        where: {
          wbsNodeId: { in: nodeIds },
          certificationId: { not: id },
          certification: { tenantId: ctx.tenantId, status: { in: ["ISSUED", "APPROVED"] } },
        },
        _sum: { currentQty: true, physicalPct: true },
      });
      const previousByNode = new Map(
        previous.map((row) => [row.wbsNodeId, row._sum.currentQty ?? new Prisma.Decimal(0)]),
      );
      const physicalByNode = new Map(
        previous.map((row) => [row.wbsNodeId, row._sum.physicalPct ?? new Prisma.Decimal(0)]),
      );
      const costs = await tx.costItem.findMany({
        where: { wbsNodeId: { in: nodeIds }, budgetId: cert.budgetId },
        select: { wbsNodeId: true, quantity: true },
      });
      const ceilingByNode = new Map(costs.map((row) => [row.wbsNodeId, row.quantity]));
      // BR-CERT-002: validate + recalc using tx client exclusively (no global prisma).
      for (const line of cert.lines) {
        const livePrev = previousByNode.get(line.wbsNodeId) ?? new Prisma.Decimal(0);
        const cumulative = livePrev.plus(line.currentQty);
        const ceilingQty = ceilingByNode.get(line.wbsNodeId);
        if (!ceilingQty)
          throw new ServiceError("CONFLICT", "La partida perdió su cómputo contractual");
        assertCertificationMeasurementValues(line.currentQty, line.physicalPct);

        // Freeze recalculated previousQty and cumulativeQty on each line
        if (
          !line.previousQty.eq(livePrev) ||
          !line.cumulativeQty.eq(cumulative) ||
          !line.budgetQty.eq(ceilingQty)
        )
          await tx.certificationLine.update({
            where: { id: line.id },
            data: {
              previousQty: livePrev,
              cumulativeQty: cumulative,
              budgetQty: ceilingQty,
              // unitSalePriceSnapshot intentionally NOT updated — frozen at line creation
            },
          });

        assertCertificationLineWithinBudget({
          itemCode: line.wbsNode.code,
          cumulative,
          budgetQty: ceilingQty,
          cumulativePhysicalPct: (physicalByNode.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).plus(
            line.physicalPct,
          ),
        });
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
      const result = await tx.certification.findUniqueOrThrow({ where: { id } });
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          projectId: certPreview.projectId,
          action: "certification.issued",
          entityType: "Certification",
          entityId: id,
          before: { status: "DRAFT" },
          after: { status: "ISSUED" },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
      return result;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return updated;
}

export async function approveCertification(
  id: string,
  ctx: ServiceContext,
): Promise<Certification> {
  await authorizeCertification(ctx, "APPROVE");
  const meta = await requireCertificationAccess(id, ctx);
  await assertProjectAllowsOperationalMutation(meta.projectId, ctx);
  const updated = await _transition(id, ctx, ["ISSUED"], "APPROVED", "certification.approved");

  const recipients = await resolveNotificationAudience({
    tenantId: ctx.tenantId,
    primaryUserIds: meta.createdBy ? [meta.createdBy] : [],
    excludeUserId: ctx.actorUserId,
  });
  const scopedRecipients = await filterUserIdsByProjectAccess(
    ctx.tenantId,
    meta.projectId,
    recipients,
  );

  const certCode = formatCertificationCode(meta.number);

  for (const recipientUserId of scopedRecipients) {
    try {
      await createSystemNotification({
        tenantId: ctx.tenantId,
        companyId: meta.companyId,
        recipientUserId,
        type: "CERTIFICATION_APPROVED",
        title: formatNotificationTitle("Certificación aprobada", certCode),
        body: `La certificación ${certCode} fue aprobada.`,
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
  await authorizeCertification(ctx, "APPROVE");
  const meta = await requireCertificationAccess(id, ctx);
  await assertProjectAllowsOperationalMutation(meta.projectId, ctx);
  return _transition(id, ctx, ["ISSUED"], "REJECTED", "certification.rejected");
}

export async function cancelCertification(
  id: string,
  ctx: ServiceContext,
  reason?: string,
): Promise<Certification> {
  await authorizeCertification(ctx, "EDIT");
  const meta = await requireCertificationAccess(id, ctx);
  if (meta.status === "CANCELLED") return meta;
  await assertProjectAllowsOperationalMutation(meta.projectId, ctx);

  return _transition(
    id,
    ctx,
    ["DRAFT", "ISSUED", "APPROVED"],
    "CANCELLED",
    "certification.cancelled",
    reason,
  );
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _transition(
  id: string,
  ctx: ServiceContext,
  allowedFrom: CertificationStatus[],
  to: CertificationStatus,
  action: string,
  reason?: string,
): Promise<Certification> {
  const cert = await requireCertificationAccess(id, ctx);
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForOperationalMutation(tx, cert.projectId, ctx);
      // Same lock as measurement, issue and billing: no invoice can be created during cancellation.
      await _lockCertificationProject(tx, cert.projectId);
      const current = await loadCertificationRecord(id, ctx, tx);
      if (current.projectId !== cert.projectId)
        throw new ServiceError("CONFLICT", "La certificación cambió. Recargá e intentá de nuevo.");
      if (to === "CANCELLED" && current.status === "CANCELLED") return current;
      if (to === "APPROVED") assertCertificationBudgetActive(current.budget.status);
      if (!allowedFrom.includes(current.status)) {
        throw new ServiceError(
          "CONFLICT",
          `No se puede cambiar el estado desde "${current.status}"`,
        );
      }
      if (to === "CANCELLED") {
        const activeInvoice = await tx.salesInvoice.findFirst({
          where: { certificationId: id, status: { not: "CANCELLED" } },
          select: { id: true },
        });
        if (activeInvoice) {
          throw new ServiceError(
            "CONFLICT",
            "No se puede cancelar la certificación porque tiene una factura activa. Anule la factura primero.",
          );
        }
        if (current.status !== "DRAFT" && !reason?.trim())
          throw new ServiceError(
            "VALIDATION",
            "Indicá el motivo de la anulación de la certificación emitida",
          );
      }
      const updated = await tx.certification.update({
        where: { id },
        data: { status: to, updatedBy: ctx.actorUserId },
      });
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          projectId: cert.projectId,
          action,
          entityType: "Certification",
          entityId: id,
          before: { status: current.status },
          after: { status: to, ...(reason?.trim() ? { cancellationReason: reason.trim() } : {}) },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
      return updated;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawCert = CertificationRecord;

function serializeCertification(cert: RawCert): CertificationWithLines {
  return {
    id: cert.id,
    tenantId: cert.tenantId,
    companyId: cert.companyId,
    projectId: cert.projectId,
    budgetId: cert.budgetId,
    number: cert.number,
    periodStart: cert.periodStart,
    periodEnd: cert.periodEnd,
    issueDate: cert.issueDate,
    status: cert.status,
    notes: cert.notes,
    internalNotes: cert.internalNotes,
    createdBy: cert.createdBy,
    updatedBy: cert.updatedBy,
    createdAt: cert.createdAt,
    updatedAt: cert.updatedAt,
    code: `CERT-${String(cert.number).padStart(3, "0")}`,
    currency: cert.budget.currency,
    totalAmount: serializeMoneyDecimal(cert.totalAmount),
    lines: cert.lines.map((l) => {
      const remaining = l.budgetQty.minus(l.cumulativeQty);
      return {
        id: l.id,
        certificationId: l.certificationId,
        wbsNodeId: l.wbsNodeId,
        unitSalePriceSnapshot: serializeUnitPriceDecimal(l.unitSalePriceSnapshot),
        budgetQty: serializeQtyDecimal(l.budgetQty),
        physicalPct: serializeRatePctDecimal(l.physicalPct),
        previousQty: serializeQtyDecimal(l.previousQty),
        currentQty: serializeQtyDecimal(l.currentQty),
        cumulativeQty: serializeQtyDecimal(l.cumulativeQty),
        remainingQty: serializeQtyDecimal(remaining),
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
