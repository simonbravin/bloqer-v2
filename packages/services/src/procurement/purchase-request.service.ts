import { Prisma, prisma, type PurchaseRequest } from "@bloqer/database";
import type { CreatePurchaseRequestInput, UpdatePurchaseRequestInput } from "@bloqer/validators";
import { auditProcurement } from "./procurement-audit";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditPurchaseRequests, canViewPurchaseRequests } from "./procurement-access";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertWbsLineForProject } from "./procurement-wbs";
import {
  assertWbsRequiredOnLines,
  budgetBaselineForWbs,
} from "./procurement-budget-baseline";
import { notifyPurchaseRequestSubmitted } from "./procurement-notifications.service";

export type PurchaseRequestLineView = {
  id: string;
  wbsNodeId: string | null;
  productId: string | null;
  lineType: string;
  description: string;
  unit: string;
  quantity: string;
  budgetUnitCostSnapshot: string | null;
};

export type PurchaseRequestView = Omit<PurchaseRequest, never> & {
  code: string;
  lines: PurchaseRequestLineView[];
};

async function resolveCompanyId(projectId: string, ctx: ServiceContext): Promise<string> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { companyId: true },
  });
  if (!project?.companyId) {
    throw new ServiceError("CONFLICT", "El proyecto no tiene empresa asignada");
  }
  if (ctx.companyId && ctx.companyId !== project.companyId) {
    throw new ServiceError("CONFLICT", "La empresa activa no coincide con la del proyecto");
  }
  return project.companyId;
}

async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId: string,
): Promise<number> {
  const max = await tx.purchaseRequest.aggregate({
    where: { tenantId, companyId },
    _max: { number: true },
  });
  return (max._max.number ?? 0) + 1;
}

function serialize(pr: PurchaseRequest & { lines: PurchaseRequestLineView[] }): PurchaseRequestView {
  return {
    ...pr,
    code: `SC-${String(pr.number).padStart(3, "0")}`,
    lines: pr.lines,
  };
}

function assertDraftPr(status: string): void {
  if (status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se puede editar una solicitud en borrador");
  }
}

export async function listPurchaseRequestsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PurchaseRequestView[]> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const rows = await prisma.purchaseRequest.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { number: "desc" },
  });
  return rows.map((r) =>
    serialize({
      ...r,
      lines: r.lines.map((l) => ({
        id: l.id,
        wbsNodeId: l.wbsNodeId,
        productId: l.productId,
        lineType: l.lineType,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity.toString(),
        budgetUnitCostSnapshot: l.budgetUnitCostSnapshot?.toString() ?? null,
      })),
    }),
  );
}

export async function getPurchaseRequestById(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const pr = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!pr || pr.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  return serialize({
    ...pr,
    lines: pr.lines.map((l) => ({
      id: l.id,
      wbsNodeId: l.wbsNodeId,
      productId: l.productId,
      lineType: l.lineType,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity.toString(),
      budgetUnitCostSnapshot: l.budgetUnitCostSnapshot?.toString() ?? null,
    })),
  });
}

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
  ctx: ServiceContext,
): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear solicitudes de compra");
  }
  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);
  const companyId = await resolveCompanyId(input.projectId, ctx);

  assertWbsRequiredOnLines(input.lines);
  for (const line of input.lines) {
    await assertWbsLineForProject(line.wbsNodeId, input.projectId, ctx.tenantId);
  }

  const pr = await prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, ctx.tenantId, companyId);
    const created = await tx.purchaseRequest.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        projectId: input.projectId,
        number,
        requestedByUserId: ctx.actorUserId,
        neededByDate: input.neededByDate ? new Date(input.neededByDate) : null,
        notes: input.notes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
        lines: {
          create: input.lines.map((line, i) => ({
            wbsNodeId: line.wbsNodeId,
            productId: line.productId ?? null,
            lineType: line.lineType,
            description: line.description,
            unit: line.unit ?? "",
            quantity: new Prisma.Decimal(line.quantity),
            sortOrder: line.sortOrder ?? i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    await auditProcurement(
      ctx,
      "purchase_request.created",
      "PurchaseRequest",
      created.id,
      { projectId: created.projectId, companyId: created.companyId },
      { after: { number: created.number }, tx },
    );
    return created;
  });

  return getPurchaseRequestById(pr.id, ctx);
}

export async function submitPurchaseRequest(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const existing = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing || existing.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  assertDraftPr(existing.status);
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);

  await prisma.$transaction(async (tx) => {
    for (const line of existing.lines) {
      if (!line.wbsNodeId) {
        throw new ServiceError(
          "CONFLICT",
          "Todas las líneas deben tener WBS antes de enviar la solicitud",
        );
      }
      const baseline = await budgetBaselineForWbs(line.wbsNodeId, tx);
      await tx.purchaseRequestLine.update({
        where: { id: line.id },
        data: {
          budgetUnitCostSnapshot: baseline.unitCost,
          budgetQuantitySnapshot: baseline.quantity,
        },
      });
    }
    await tx.purchaseRequest.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        updatedBy: ctx.actorUserId,
      },
    });
    await auditProcurement(
      ctx,
      "purchase_request.submitted",
      "PurchaseRequest",
      id,
      { projectId: existing.projectId, companyId: existing.companyId },
      { after: { status: "SUBMITTED" }, tx },
    );
  });

  const code = `SC-${String(existing.number).padStart(3, "0")}`;
  await notifyPurchaseRequestSubmitted({
    ctx,
    purchaseRequestId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    code,
  });

  return getPurchaseRequestById(id, ctx);
}

export async function getActivePurchaseOrderForRequest(
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<{ id: string; code: string; status: string; projectId: string } | null> {
  await assertProcurementTenantModule(ctx);
  if (!canViewPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      purchaseRequestId,
      tenantId: ctx.tenantId,
      status: { not: "CANCELLED" },
    },
    select: { id: true, number: true, status: true, projectId: true },
  });
  if (!po) return null;
  return {
    id: po.id,
    code: `OC-${String(po.number).padStart(3, "0")}`,
    status: po.status,
    projectId: po.projectId,
  };
}

export async function cancelPurchaseRequest(id: string, ctx: ServiceContext): Promise<PurchaseRequestView> {
  await assertProcurementTenantModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada");
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La solicitud no puede anularse en este estado");
  }

  const activePo = await prisma.purchaseOrder.count({
    where: {
      purchaseRequestId: id,
      status: { notIn: ["CANCELLED", "DRAFT"] },
    },
  });
  if (activePo > 0) {
    throw new ServiceError("CONFLICT", "Hay órdenes de compra activas vinculadas a esta solicitud");
  }

  await prisma.purchaseRequest.update({
    where: { id },
    data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
  });
  await auditProcurement(ctx, "purchase_request.cancelled", "PurchaseRequest", id, {
    projectId: existing.projectId,
    companyId: existing.companyId,
  });

  return getPurchaseRequestById(id, ctx);
}
