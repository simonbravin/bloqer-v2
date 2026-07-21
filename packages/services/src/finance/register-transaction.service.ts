import { prisma } from "@bloqer/database";
import type { RegisterTransactionInput } from "@bloqer/validators";
import { registerApExpense } from "../ap/register-ap-expense.service";
import { createPayment } from "../ap/payment.service";
import { registerArIncome } from "../ar/register-ar-income.service";
import { registerCorporateTreasuryInflow } from "../treasury/register-corporate-treasury-inflow.service";
import { ServiceContext, ServiceError } from "../types";
import { buildFinancialHref } from "./financial-trace.service";
import { assertCorporatePayableScope } from "./register-transaction-corporate-scope";
import type { FinancialTraceLink, RegisterTransactionResult } from "./register-transaction.types";

export async function registerTransaction(
  input: RegisterTransactionInput,
  ctx: ServiceContext,
): Promise<RegisterTransactionResult> {
  switch (input.kind) {
    case "AP_EXPENSE": {
      const { kind: _k, ...payload } = input;
      return registerApExpense(payload, ctx);
    }
    case "TREASURY_INFLOW": {
      const { kind: _k, ...payload } = input;
      return registerCorporateTreasuryInflow(payload, ctx);
    }
    case "AR_INCOME": {
      const { kind: _k, ...payload } = input;
      return registerArIncome(payload, ctx);
    }
    case "PAYMENT": {
      const { kind: _k, ...paymentInput } = input;
      const payable = await prisma.payable.findUnique({ where: { id: paymentInput.payableId } });
      if (!payable) throw new ServiceError("NOT_FOUND", "Cuenta por pagar no encontrada");
      if (payable.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      assertCorporatePayableScope(payable, ctx);

      const payment = await createPayment(paymentInput, ctx);
      const traceChain: FinancialTraceLink[] = [
        {
          entityType: "Payment",
          entityId: payment.id,
          href: buildFinancialHref("Payment", payment.id),
        },
        {
          entityType: "Payable",
          entityId: payment.payableId,
          href: buildFinancialHref("Payable", payment.payableId),
        },
      ];
      if (payment.supplierInvoiceId) {
        traceChain.push({
          entityType: "SupplierInvoice",
          entityId: payment.supplierInvoiceId,
          href: buildFinancialHref("SupplierInvoice", payment.supplierInvoiceId),
        });
      }
      const href = buildFinancialHref("Payment", payment.id);
      return {
        kind: "PAYMENT",
        primaryEntityId: payment.id,
        primaryEntityType: "Payment",
        href,
        traceChain,
      };
    }
    default:
      throw new ServiceError("VALIDATION", "Tipo de transacción no soportado");
  }
}
