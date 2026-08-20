import { Prisma, prisma, Payment } from "@bloqer/database";
import type { CreatePaymentInput } from "@bloqer/validators";
import { auditAp } from "./ap-audit";
import { applyPaymentToPayable } from "./apply-payment-to-payable";
import { serializeMoneyDecimal, toMoneyDecimal } from "../finance/money-decimal";
import { resolveObligationStoredStatus } from "../finance/obligation-stored-status";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { assertApTenantModule, assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { canRegisterApPayment, canViewApProjectArea, canViewCompanyAp } from "./ap-access";
import { notifyPaymentConfirmed } from "./ap-notifications.service";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { ensureDraftJournalFromPayment } from "../accounting/accounting-auto-draft.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";
import { assertPeriodOpenUnderCompanyLock } from "../treasury/treasury-write-locks";
import { assertResourceTenant } from "../security/tenant-isolation";
import {
  paymentReplayMatches,
  requireIdempotencyKey,
  withIdempotentCreate,
} from "../idempotency/idempotency";

export type PaymentView = Omit<Payment, "amount"> & {
  amount: string;
  accountName: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPaymentById(
  id: string,
  ctx: ServiceContext,
  /** When set (project workspace routes), corporate payments and cross-project IDs are rejected. */
  projectScopeId?: string,
): Promise<PaymentView> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver pagos");
  }
  const p = await prisma.payment.findUnique({
    where: { id },
    include: { account: { select: { name: true } } },
  });
  if (!p) throw new ServiceError("NOT_FOUND", "Pago no encontrado");
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(p.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El pago no pertenece a la empresa activa");
  }
  if (projectScopeId !== undefined && p.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "El pago no pertenece a este proyecto");
  }
  return serialize(p);
}

/** Payment for corporate AP (`projectId` null). VIEW AP only. */
export async function getCompanyPaymentById(id: string, ctx: ServiceContext): Promise<PaymentView> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver pagos a nivel empresa");
  }
  const p = await prisma.payment.findUnique({
    where: { id },
    include: { account: { select: { name: true } } },
  });
  if (!p) throw new ServiceError("NOT_FOUND", "Pago no encontrado");
  if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (p.projectId !== null) {
    throw new ServiceError("FORBIDDEN", "Este pago pertenece a un proyecto; usá el espacio de trabajo del proyecto");
  }
  if (isCrossCompany(p.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El pago no pertenece a la empresa activa");
  }
  return serialize(p);
}

export type ProjectPaymentListFilters = {
  page?: number;
  pageSize?: number;
};

export async function listPaymentsByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectPaymentListFilters,
): Promise<{ data: PaymentView[]; total: number }> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver pagos");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where = { projectId, tenantId: ctx.tenantId };

  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}

export async function listPaymentsByPayable(
  payableId: string,
  ctx: ServiceContext,
): Promise<PaymentView[]> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver pagos");
  }
  const rows = await prisma.payment.findMany({
    where: { payableId, tenantId: ctx.tenantId },
    include: { account: { select: { name: true } } },
    orderBy: { paymentDate: "desc" },
  });
  return rows.map(serialize);
}

export type CompanyPaymentListFilters = {
  status?:           "CONFIRMED" | "CANCELLED";
  paymentDateFrom?:  string;
  paymentDateTo?:    string;
  page?:             number;
  pageSize?:         number;
};

/** Payments for corporate AP (`projectId` null). Requires VIEW AP only. */
export async function listCompanyPayments(
  ctx: ServiceContext,
  filters?: CompanyPaymentListFilters,
): Promise<{ data: PaymentView[]; total: number }> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver pagos a nivel empresa");
  }

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where: Prisma.PaymentWhereInput = {
    tenantId:  ctx.tenantId,
    projectId: null,
    // Payment.companyId es NOT NULL → scope directo por empresa.
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.paymentDateFrom || filters?.paymentDateTo
      ? {
          paymentDate: {
            ...(filters.paymentDateFrom ? { gte: new Date(filters.paymentDateFrom) } : {}),
            ...(filters.paymentDateTo ? { lte: new Date(filters.paymentDateTo) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);

  const data = rows.map(serialize);
  return { data, total };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPayment(
  input: CreatePaymentInput,
  ctx: ServiceContext,
  /** When set, blocks paying corporate payables from a project workspace action. */
  projectScopeId?: string,
): Promise<PaymentView> {
  await assertApTenantModule(ctx);
  await assertTreasuryTenantModule(ctx);

  const payablePreview = await prisma.payable.findUnique({
    where: { id: input.payableId },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!payablePreview) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
  if (payablePreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(payablePreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a la empresa activa");
  }
  if (!canRegisterApPayment(ctx.roles)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Sin permisos para registrar pagos (requiere finanzas de empresa o tesorería)",
    );
  }
  if (projectScopeId !== undefined && payablePreview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a este proyecto");
  }
  if (payablePreview.projectId) {
    await assertProjectAllowsOperationalMutation(payablePreview.projectId, ctx.tenantId);
  }

  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const paymentInclude = { account: { select: { name: true } } } as const;

  const payment = await withIdempotentCreate({
    findExisting: () =>
      prisma.payment.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
        include: paymentInclude,
      }),
    payloadsMatch: (existing) =>
      paymentReplayMatches(existing, {
        payableId: input.payableId,
        accountId: input.accountId,
        paymentDate: input.paymentDate,
        payFullBalance: Boolean(input.payFullBalance),
        amount: input.amount,
      }),
    create: async () => {
      const created = await prisma.$transaction(async (tx) => {
        // Load payable inside txn for consistency
        const payable = await tx.payable.findUnique({ where: { id: input.payableId } });
        if (!payable) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
        assertResourceTenant(payable.tenantId, ctx.tenantId);
        if (projectScopeId !== undefined && payable.projectId !== projectScopeId) {
          throw new ServiceError("FORBIDDEN", "La cuenta por pagar no pertenece a este proyecto");
        }
        if (payable.status === "CANCELLED") {
          throw new ServiceError("CONFLICT", "No se puede pagar una cuenta por pagar cancelada");
        }
        if (payable.status === "PAID") {
          throw new ServiceError("CONFLICT", "La cuenta por pagar ya está totalmente pagada");
        }

        const balanceDue = payable.originalAmount.minus(payable.paidAmount);
        // D-053: payFullBalance applies stored balance; never round-then-reapply from UI.
        // Also treat amount that rounds to the same 2dp as balance as full (API clients).
        let amount: Prisma.Decimal;
        if (input.payFullBalance) {
          amount = balanceDue;
        } else {
          const partial = toMoneyDecimal(input.amount ?? "0");
          amount = partial.eq(toMoneyDecimal(balanceDue)) ? balanceDue : partial;
        }
        if (amount.lessThanOrEqualTo(0)) {
          throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
        }

        const supplierInvoice = await tx.supplierInvoice.findUnique({
          where: { id: payable.supplierInvoiceId },
          select: { status: true, number: true },
        });
        if (!supplierInvoice) {
          throw new ServiceError("CONFLICT", "La factura de proveedor asociada no existe");
        }
        if (supplierInvoice.status === "CANCELLED") {
          throw new ServiceError("CONFLICT", "No se puede pagar una factura de proveedor cancelada");
        }

        const applied = await applyPaymentToPayable(
          tx,
          {
            payable,
            accountId: input.accountId,
            amount,
            paymentDate: input.paymentDate,
            notes: input.notes ?? null,
            paymentMethod: input.paymentMethod ?? null,
            reference: input.reference ?? null,
            idempotencyKey,
          },
          ctx,
        );

        const result = await tx.payment.findUniqueOrThrow({
          where: { id: applied.paymentId },
          include: paymentInclude,
        });

        await auditAp(
          ctx,
          "payment.confirmed",
          "Payment",
          result.id,
          { projectId: result.projectId, companyId: result.companyId },
          {
            after: {
              payableId: input.payableId,
              amount: serializeMoneyDecimal(amount),
              payFullBalance: Boolean(input.payFullBalance),
              number: supplierInvoice.number,
            },
            tx,
          },
        );

        return { result, supplierInvoice };
      });

      // Replay must not emit a second in-app/email notification (inside create()).
      await notifyPaymentConfirmed({
        ctx,
        supplierInvoiceId: created.result.supplierInvoiceId,
        projectId: created.result.projectId,
        companyId: created.result.companyId,
        invoiceNumber: created.supplierInvoice.number,
        amountLabel: `${serializeMoneyDecimal(created.result.amount)} ${created.result.currency}`,
        accountName: created.result.account.name,
      }).catch(() => undefined);

      return created.result;
    },
  });

  await ensureDraftJournalFromPayment(payment.id, ctx);
  return serialize(payment);
}

export async function cancelPayment(
  id: string,
  ctx: ServiceContext,
  /** When set, rejects cancelling corporate payments from a project workspace action. */
  projectScopeId?: string,
): Promise<Payment> {
  await assertApTenantModule(ctx);
  await assertTreasuryTenantModule(ctx);

  const paymentPreview = await prisma.payment.findUnique({
    where: { id },
    select: {
      tenantId: true,
      projectId: true,
      companyId: true,
      paymentDate: true,
      status: true,
    },
  });
  if (!paymentPreview) throw new ServiceError("NOT_FOUND", "Pago no encontrado");
  if (paymentPreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(paymentPreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El pago no pertenece a la empresa activa");
  }
  if (!canRegisterApPayment(ctx.roles)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Sin permisos para cancelar pagos (requiere finanzas de empresa o tesorería)",
    );
  }
  if (projectScopeId !== undefined && paymentPreview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "El pago no pertenece a este proyecto");
  }

  const glParams = {
    companyId: paymentPreview.companyId,
    sourceType: "PAYMENT" as const,
    sourceId: id,
    sourceLabel: "el pago",
  };

  if (paymentPreview.status === "CANCELLED") {
    await cancelDraftJournalOnOperationalCancel(ctx, glParams);
    throw new ServiceError("CONFLICT", "El pago ya está cancelado");
  }

  await assertFinancialPeriodOpen({
    tenantId: ctx.tenantId,
    companyId: paymentPreview.companyId,
    date: paymentPreview.paymentDate,
  });

  // Hard stops before GL cancel — avoid orphaning DRAFT journals on RECONCILED conflict.
  const linkedMovementPreview = await prisma.accountMovement.findFirst({
    where: { sourceType: "PAYMENT", sourceId: id, status: { in: ["CONFIRMED", "RECONCILED"] } },
    select: { id: true, status: true },
  });
  if (linkedMovementPreview?.status === "RECONCILED") {
    throw new ServiceError(
      "CONFLICT",
      "El movimiento de tesorería está conciliado. Desconciliá antes de cancelar el pago.",
    );
  }

  await assertJournalAllowsOperationalCancel(ctx, glParams);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id } });
    if (!p) throw new ServiceError("NOT_FOUND", "Pago no encontrado");
    if (p.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && p.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "El pago no pertenece a este proyecto");
    }
    if (p.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "El pago ya está cancelado");
    }

    await assertPeriodOpenUnderCompanyLock(tx, {
      tenantId: ctx.tenantId,
      companyId: p.companyId,
      date: p.paymentDate,
    });

    const linkedMovement = await tx.accountMovement.findFirst({
      where: { sourceType: "PAYMENT", sourceId: id, status: { in: ["CONFIRMED", "RECONCILED"] } },
      select: { id: true, status: true },
    });
    if (linkedMovement?.status === "RECONCILED") {
      throw new ServiceError(
        "CONFLICT",
        "El movimiento de tesorería está conciliado. Desconciliá antes de cancelar el pago.",
      );
    }

    const paymentCancel = await tx.payment.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "CONFIRMED" },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      paymentCancel.count,
      "El pago ya fue cancelado o modificado. Revisá e intentá de nuevo.",
    );

    // Cancel linked AccountMovement (tenant + optimistic claim if present)
    if (linkedMovement) {
      const movementCancel = await tx.accountMovement.updateMany({
        where: {
          id: linkedMovement.id,
          tenantId: ctx.tenantId,
          sourceType: "PAYMENT",
          sourceId: id,
          status: "CONFIRMED",
        },
        data: { status: "CANCELLED" },
      });
      assertOptimisticRowUpdate(
        movementCancel.count,
        "El movimiento de tesorería cambió (p. ej. conciliado). Recargá e intentá de nuevo.",
      );
    }

    // Reverse Payable.paidAmount
    const payable = await tx.payable.findUnique({ where: { id: p.payableId } });
    if (payable && payable.status !== "CANCELLED") {
      const newPaid    = Prisma.Decimal.max(payable.paidAmount.minus(p.amount), new Prisma.Decimal(0));
      const newStatus  = resolveObligationStoredStatus(newPaid, payable.originalAmount);
      const payableReverse = await tx.payable.updateMany({
        where: {
          id: payable.id,
          paidAmount: payable.paidAmount,
          status: { not: "CANCELLED" },
        },
        data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
      });
      assertOptimisticRowUpdate(
        payableReverse.count,
        "El saldo cambió mientras cancelabas el pago. Revisá e intentá de nuevo.",
      );
    }

    const invoice = await tx.supplierInvoice.findUnique({
      where: { id: p.supplierInvoiceId },
      select: { number: true },
    });

    const updated = await tx.payment.findUniqueOrThrow({ where: { id } });

    await auditAp(
      ctx,
      "payment.cancelled",
      "Payment",
      id,
      { projectId: updated.projectId, companyId: updated.companyId },
      { after: { status: "CANCELLED", number: invoice?.number ?? null }, tx },
    );

    return updated;
  });

  await cancelDraftJournalOnOperationalCancel(ctx, glParams);

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawPayment = Payment & { account: { name: string } };

function serialize(p: RawPayment): PaymentView {
  return { ...p, amount: serializeMoneyDecimal(p.amount), accountName: p.account.name };
}
