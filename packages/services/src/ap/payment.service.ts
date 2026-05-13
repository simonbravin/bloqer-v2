import { Prisma, prisma, Payment } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreatePaymentInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canViewApProjectArea } from "./ap-access";

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
  if (projectScopeId !== undefined && p.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "El pago no pertenece a este proyecto");
  }
  return serialize(p);
}

export async function listPaymentsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<PaymentView[]> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver pagos");
  }
  const rows = await prisma.payment.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: { account: { select: { name: true } } },
    orderBy: { paymentDate: "desc" },
  });
  return rows.map(serialize);
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

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPayment(
  input: CreatePaymentInput,
  ctx: ServiceContext,
  /** When set, blocks paying corporate payables from a project workspace action. */
  projectScopeId?: string,
): Promise<PaymentView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar pagos");
  }

  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Load payable inside txn for consistency
    const payable = await tx.payable.findUnique({ where: { id: input.payableId } });
    if (!payable) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
    if (payable.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
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
    // BR-AP-005: block overpayment
    if (amount.greaterThan(balanceDue)) {
      throw new ServiceError(
        "CONFLICT",
        `El monto (${amount}) supera el saldo pendiente (${balanceDue}). No se permiten sobrepagos.`,
      );
    }

    // Validate account
    const account = await tx.treasuryAccount.findUnique({ where: { id: input.accountId } });
    if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
    if (account.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (account.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
    }
    // Currency guard — no FX in Phase 4A
    if (account.currency !== payable.currency) {
      throw new ServiceError(
        "CONFLICT",
        `Moneda de cuenta (${account.currency}) no coincide con la del saldo (${payable.currency}). FX no disponible.`,
      );
    }

    const companyId = ctx.companyId ?? account.companyId ?? payable.companyId;

    // Create Payment
    const payment = await tx.payment.create({
      data: {
        tenantId:          ctx.tenantId,
        companyId,
        projectId:         payable.projectId,
        supplierContactId: payable.supplierContactId,
        payableId:         payable.id,
        supplierInvoiceId: payable.supplierInvoiceId,
        accountId:         input.accountId,
        paymentDate:       new Date(input.paymentDate),
        currency:          payable.currency,
        amount,
        notes:             input.notes ?? null,
        status:            "CONFIRMED",
        createdBy:         ctx.actorUserId,
        updatedBy:         ctx.actorUserId,
      },
    });

    // Create AccountMovement OUTFLOW
    await tx.accountMovement.create({
      data: {
        tenantId:    ctx.tenantId,
        companyId:   account.companyId,
        accountId:   input.accountId,
        movementDate: new Date(input.paymentDate),
        type:        "OUTFLOW",
        sourceType:  "PAYMENT",
        sourceId:    payment.id,
        currency:    payable.currency,
        amount,
        description: `Pago factura proveedor ${payable.supplierInvoiceId}`,
        status:      "CONFIRMED",
        createdBy:   ctx.actorUserId,
      },
    });

    // Update Payable
    const newPaid    = payable.paidAmount.plus(amount);
    const newBalance = payable.originalAmount.minus(newPaid);
    const newStatus  = newBalance.isZero() ? "PAID"
      : newPaid.greaterThan(0) ? "PARTIAL"
      : "OPEN";

    await tx.payable.update({
      where: { id: payable.id },
      data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
    });

    return tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { account: { select: { name: true } } },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "payment.confirmed",
    entityType: "Payment",
    entityId: result.id,
    after: { payableId: input.payableId, amount: input.amount },
    ipAddress: ctx.ipAddress,
  });

  return serialize(result);
}

export async function cancelPayment(
  id: string,
  ctx: ServiceContext,
  /** When set, rejects cancelling corporate payments from a project workspace action. */
  projectScopeId?: string,
): Promise<Payment> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar pagos");
  }

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

    // Cancel linked AccountMovement
    await tx.accountMovement.updateMany({
      where: { sourceType: "PAYMENT", sourceId: id, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });

    // Reverse Payable.paidAmount
    const payable = await tx.payable.findUnique({ where: { id: p.payableId } });
    if (payable && payable.status !== "CANCELLED") {
      const newPaid    = Prisma.Decimal.max(payable.paidAmount.minus(p.amount), new Prisma.Decimal(0));
      const newBalance = payable.originalAmount.minus(newPaid);
      const newStatus  = newBalance.isZero() ? "PAID"
        : newPaid.greaterThan(0) ? "PARTIAL"
        : "OPEN";
      await tx.payable.update({
        where: { id: payable.id },
        data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
      });
    }

    return tx.payment.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "payment.cancelled",
    entityType: "Payment",
    entityId: id,
    after: { status: "CANCELLED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawPayment = Payment & { account: { name: string } };

function serialize(p: RawPayment): PaymentView {
  return { ...p, amount: p.amount.toString(), accountName: p.account.name };
}
