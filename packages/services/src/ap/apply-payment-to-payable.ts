import { Prisma, prisma } from "@bloqer/database";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { resolveObligationStoredStatus } from "../finance/obligation-stored-status";
import { effectiveObligationPaidAfterPayment } from "../finance/obligation-balance";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { toMoneyDecimal } from "../finance/money-decimal";
import { getAccountBalance } from "../treasury/balance.service";
import { assertTreasuryAccountCurrencyMatches } from "../treasury/treasury-currency-guards";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type ApplyPaymentPayableSnapshot = {
  id: string;
  tenantId: string;
  companyId: string;
  projectId: string | null;
  supplierContactId: string;
  supplierInvoiceId: string;
  currency: string;
  originalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
};

export type ApplyPaymentToPayableInput = {
  payable: ApplyPaymentPayableSnapshot;
  accountId: string;
  amount: Prisma.Decimal;
  /** YYYY-MM-DD */
  paymentDate: string;
  notes?: string | null;
};

export type ApplyPaymentToPayableResult = {
  paymentId: string;
  movementId: string;
  accountId: string;
  paymentCompanyId: string;
};

/**
 * Shared core for Payment + AccountMovement OUTFLOW + Payable balance update.
 * Used by `createPayment` and the AP composite “pay now” flow ([D-052]).
 * Blocks insufficient funds (same rule as InternalTransfer / BR-TRZ-004).
 */
export async function applyPaymentToPayable(
  tx: TxClient,
  input: ApplyPaymentToPayableInput,
  ctx: ServiceContext,
): Promise<ApplyPaymentToPayableResult> {
  const { payable, accountId, paymentDate, notes } = input;

  const balanceDue = payable.originalAmount.minus(payable.paidAmount);
  // D-053: if caller passes the exact stored balance (payFullBalance), keep it;
  // otherwise quantize partial payments to 2 dp.
  const amountToApply = input.amount.eq(balanceDue)
    ? balanceDue
    : toMoneyDecimal(input.amount);

  if (amountToApply.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto del pago debe ser mayor a 0");
  }

  if (amountToApply.greaterThan(balanceDue)) {
    throw new ServiceError(
      "CONFLICT",
      `El monto (${amountToApply}) supera el saldo pendiente (${balanceDue}). No se permiten sobrepagos.`,
    );
  }

  const account = await tx.treasuryAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
  if (account.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (account.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
  }
  // Tesorería es tenant-wide: cuentas corporativas (companyId null) son usables.
  // Rechazamos sólo cuentas de OTRA empresa.
  if (isCrossCompany(account.companyId, ctx)) {
    throw new ServiceError(
      "FORBIDDEN",
      "La cuenta de tesorería no pertenece a la empresa activa.",
    );
  }
  assertTreasuryAccountCurrencyMatches(account.currency, payable.currency);

  // BR-TRZ-004 / D-052: block negative balance on payment source account
  const sourceBalance = await getAccountBalance(account.id, tx);
  if (amountToApply.greaterThan(sourceBalance)) {
    throw new ServiceError(
      "CONFLICT",
      `Saldo insuficiente en la cuenta de pago. Disponible: ${sourceBalance.toFixed(2)} ${account.currency}.`,
    );
  }

  const paymentCompanyId = ctx.companyId ?? account.companyId ?? payable.companyId;
  const movementCompanyId = account.companyId ?? ctx.companyId ?? payable.companyId;
  const fx = computeDocumentFxAmounts(payable.currency, amountToApply);

  const payment = await tx.payment.create({
    data: {
      tenantId: ctx.tenantId,
      companyId: paymentCompanyId,
      projectId: payable.projectId,
      supplierContactId: payable.supplierContactId,
      payableId: payable.id,
      supplierInvoiceId: payable.supplierInvoiceId,
      accountId,
      paymentDate: new Date(paymentDate),
      currency: payable.currency,
      amount: amountToApply,
      fxRate: fx.fxRate,
      amountArs: fx.amountArs,
      notes: notes ?? null,
      status: "CONFIRMED",
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    },
  });

  const movement = await tx.accountMovement.create({
    data: {
      tenantId: ctx.tenantId,
      companyId: movementCompanyId,
      projectId: payable.projectId,
      accountId,
      movementDate: new Date(paymentDate),
      type: "OUTFLOW",
      sourceType: "PAYMENT",
      sourceId: payment.id,
      currency: payable.currency,
      amount: amountToApply,
      description: `Pago factura proveedor ${payable.supplierInvoiceId}`,
      status: "CONFIRMED",
      createdBy: ctx.actorUserId,
    },
  });

  const newPaid = effectiveObligationPaidAfterPayment(
    payable.originalAmount,
    payable.paidAmount.plus(amountToApply),
  );
  const newStatus = resolveObligationStoredStatus(newPaid, payable.originalAmount);
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

  return {
    paymentId: payment.id,
    movementId: movement.id,
    accountId,
    paymentCompanyId,
  };
}
