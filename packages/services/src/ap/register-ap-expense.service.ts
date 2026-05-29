import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { RegisterApExpenseInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { buildFinancialHref } from "../finance/financial-trace.service";
import type { FinancialTraceLink, RegisterTransactionResult } from "../finance/register-transaction.types";
import { assertApTenantModule, assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { calcLine, recalcSupplierInvoiceTotals } from "./supplier-invoice-calc.service";
import { resolveCompanyIdForAp } from "./supplier-invoice.service";

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  );
}

function invoiceCode(number: number): string {
  return `FP-${String(number).padStart(5, "0")}`;
}

type ApExpenseOutcome = {
  invoiceId: string;
  payableId: string;
  number: number;
  paymentId?: string;
  movementId?: string;
  payAccountId?: string;
};

function buildApExpenseTraceChain(outcome: ApExpenseOutcome): FinancialTraceLink[] {
  const chain: FinancialTraceLink[] = [
    {
      entityType: "SupplierInvoice",
      entityId: outcome.invoiceId,
      code: invoiceCode(outcome.number),
      href: buildFinancialHref("SupplierInvoice", outcome.invoiceId),
    },
    {
      entityType: "Payable",
      entityId: outcome.payableId,
      href: buildFinancialHref("Payable", outcome.payableId),
    },
  ];
  if (outcome.paymentId && outcome.movementId && outcome.payAccountId) {
    chain.push(
      {
        entityType: "Payment",
        entityId: outcome.paymentId,
        href: buildFinancialHref("Payment", outcome.paymentId),
      },
      {
        entityType: "AccountMovement",
        entityId: outcome.movementId,
        href: buildFinancialHref("AccountMovement", outcome.movementId, {
          accountId: outcome.payAccountId,
        }),
      },
    );
  }
  return chain;
}

export async function registerApExpense(
  input: RegisterApExpenseInput,
  ctx: ServiceContext,
): Promise<RegisterTransactionResult> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar gastos");
  }
  if (input.payNow) {
    await assertTreasuryTenantModule(ctx);
    if (!can(ctx.roles, "EDIT", "TREASURY")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para registrar movimientos de tesorería");
    }
  }

  const supplierRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
  });
  if (!supplierRole || supplierRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de proveedor activo");
  }

  const companyId = await resolveCompanyIdForAp(null, ctx);

  let outcome!: ApExpenseOutcome;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const maxNum = await tx.supplierInvoice.aggregate({
          where: { tenantId: ctx.tenantId, companyId },
          _max: { number: true },
        });
        const number = (maxNum._max.number ?? 0) + 1;

    const created = await tx.supplierInvoice.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        projectId: null,
        supplierContactId: input.supplierContactId,
        number,
        issueDate: new Date(input.issueDate),
        dueDate: new Date(input.dueDate),
        currency: input.currency ?? "ARS",
        fxRate: input.fxRate ? new Prisma.Decimal(input.fxRate) : new Prisma.Decimal(1),
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        purchaseOrderId: null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    for (const line of input.lines) {
      const qty = new Prisma.Decimal(line.quantity);
      const price = new Prisma.Decimal(line.unitPrice);
      const rate = new Prisma.Decimal(line.taxRate ?? "0");
      const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
      await tx.supplierInvoiceLine.create({
        data: {
          invoiceId: created.id,
          description: line.description,
          quantity: qty,
          unitPrice: price,
          taxRate: rate,
          lineSubtotal,
          lineTax,
          lineTotal,
          sortOrder: line.sortOrder ?? 0,
        },
      });
    }

    await recalcSupplierInvoiceTotals(tx, created.id);
    const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: created.id } });
    if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El total de la factura debe ser mayor a 0");
    }

    const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);
    await tx.supplierInvoice.update({
      where: { id: created.id },
      data: {
        status: "ISSUED",
        fxRate: fx.fxRate,
        amountArs: fx.amountArs,
        updatedBy: ctx.actorUserId,
      },
    });

    const payable = await tx.payable.create({
      data: {
        tenantId: refreshed.tenantId,
        companyId: refreshed.companyId,
        projectId: null,
        supplierContactId: refreshed.supplierContactId,
        supplierInvoiceId: refreshed.id,
        issueDate: refreshed.issueDate,
        dueDate: refreshed.dueDate,
        currency: refreshed.currency,
        originalAmount: refreshed.totalAmount,
        paidAmount: new Prisma.Decimal(0),
        status: "OPEN",
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    let paymentId: string | undefined;
    let movementId: string | undefined;
    let payAccountId: string | undefined;

    if (input.payNow) {
      const payAmount = input.payNow.amount
        ? new Prisma.Decimal(input.payNow.amount)
        : refreshed.totalAmount;
      if (payAmount.lessThanOrEqualTo(0)) {
        throw new ServiceError("VALIDATION", "El monto del pago debe ser mayor a 0");
      }
      const balanceDue = payable.originalAmount.minus(payable.paidAmount);
      if (payAmount.greaterThan(balanceDue)) {
        throw new ServiceError(
          "CONFLICT",
          `El monto (${payAmount}) supera el saldo pendiente (${balanceDue}).`,
        );
      }

      const account = await tx.treasuryAccount.findUnique({ where: { id: input.payNow.accountId } });
      if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
      if (account.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      if (account.status !== "ACTIVE") {
        throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
      }
      if (ctx.companyId && (!account.companyId || account.companyId !== ctx.companyId)) {
        throw new ServiceError(
          "FORBIDDEN",
          "La cuenta de tesorería no pertenece a la empresa activa.",
        );
      }
      if (account.currency !== payable.currency) {
        throw new ServiceError(
          "CONFLICT",
          `Moneda de cuenta (${account.currency}) no coincide con la del saldo (${payable.currency}).`,
        );
      }

      const paymentFx = computeDocumentFxAmounts(payable.currency, payAmount);
      const payment = await tx.payment.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId ?? account.companyId ?? payable.companyId,
          projectId: null,
          supplierContactId: payable.supplierContactId,
          payableId: payable.id,
          supplierInvoiceId: payable.supplierInvoiceId,
          accountId: input.payNow.accountId,
          paymentDate: new Date(input.payNow.paymentDate),
          currency: payable.currency,
          amount: payAmount,
          fxRate: paymentFx.fxRate,
          amountArs: paymentFx.amountArs,
          notes: input.payNow.notes ?? null,
          status: "CONFIRMED",
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      paymentId = payment.id;
      payAccountId = input.payNow.accountId;

      const movement = await tx.accountMovement.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: account.companyId ?? ctx.companyId ?? payable.companyId,
          accountId: input.payNow.accountId,
          movementDate: new Date(input.payNow.paymentDate),
          type: "OUTFLOW",
          sourceType: "PAYMENT",
          sourceId: payment.id,
          currency: payable.currency,
          amount: payAmount,
          description: `Pago factura proveedor ${payable.supplierInvoiceId}`,
          status: "CONFIRMED",
          createdBy: ctx.actorUserId,
        },
      });
      movementId = movement.id;

      const newPaid = payable.paidAmount.plus(payAmount);
      const newBalance = payable.originalAmount.minus(newPaid);
      const newStatus = newBalance.isZero() ? "PAID" : newPaid.greaterThan(0) ? "PARTIAL" : "OPEN";
      const payableUpdate = await tx.payable.updateMany({
        where: {
          id: payable.id,
          paidAmount: payable.paidAmount,
          status: { in: [...ACTIVE_OBLIGATION_STATUSES] },
        },
        data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
      });
      assertOptimisticRowUpdate(
        payableUpdate.count,
        "El saldo cambió mientras registrabas el pago. Revisá el saldo pendiente e intentá de nuevo.",
      );

    }

    return {
      invoiceId: refreshed.id,
      payableId: payable.id,
      number,
      paymentId,
      movementId,
      payAccountId,
    };
      });
      break;
    } catch (err) {
      if (attempt === 0 && isUniqueConstraintError(err)) continue;
      throw err;
    }
  }
  if (!outcome) {
    throw new ServiceError("CONFLICT", "No se pudo asignar número de factura. Intentá de nuevo.");
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "supplier_invoice.registered_expense",
    entityType: "SupplierInvoice",
    entityId: outcome.invoiceId,
    after: { issued: true, paid: Boolean(input.payNow) },
    ipAddress: ctx.ipAddress,
  });

  if (outcome.paymentId) {
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "payment.confirmed",
      entityType: "Payment",
      entityId: outcome.paymentId,
      ipAddress: ctx.ipAddress,
    });
  }

  const traceChain = buildApExpenseTraceChain(outcome);

  if (outcome.paymentId) {
    const href = buildFinancialHref("Payment", outcome.paymentId);
    return {
      kind: "AP_EXPENSE",
      primaryEntityId: outcome.paymentId,
      primaryEntityType: "Payment",
      href,
      traceChain,
    };
  }

  const href = buildFinancialHref("SupplierInvoice", outcome.invoiceId);
  return {
    kind: "AP_EXPENSE",
    primaryEntityId: outcome.invoiceId,
    primaryEntityType: "SupplierInvoice",
    href,
    traceChain,
  };
}
