import { Prisma } from "@bloqer/database";
import type { JournalEntrySourceType } from "@bloqer/database";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import type { CreateJournalEntryInput } from "@bloqer/validators";

/** CoA template codes ([D-085]) — Argentine construction seed. */
export const COA_IVA_CREDIT_FISCAL = "1.1.20";
export const COA_IVA_DEBIT_FISCAL = "2.1.10";

function moneyAmountString(d: Prisma.Decimal): string {
  return serializeMoneyDecimal(d);
}

export function buildTwoLineJournalInput(params: {
  companyId: string;
  projectId: string | null;
  entryDate: string;
  description: string;
  reference: string | null;
  currency: string;
  amount: Prisma.Decimal;
  debitAccountId: string;
  creditAccountId: string;
  lineDescriptionDebit: string;
  lineDescriptionCredit: string;
  sourceType: JournalEntrySourceType;
  sourceId: string;
}): CreateJournalEntryInput {
  const amountStr = moneyAmountString(params.amount);
  return {
    companyId: params.companyId,
    projectId: params.projectId,
    entryDate: params.entryDate,
    description: params.description,
    reference: params.reference,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    lines: [
      {
        accountId: params.debitAccountId,
        projectId: params.projectId,
        description: params.lineDescriptionDebit,
        debit: amountStr,
        credit: "0",
        currency: params.currency,
      },
      {
        accountId: params.creditAccountId,
        projectId: params.projectId,
        description: params.lineDescriptionCredit,
        debit: "0",
        credit: amountStr,
        currency: params.currency,
      },
    ],
  };
}

/**
 * AR issued invoice: Clientes (total) / Ingresos (neto) + IVA Débito (tax) when tax > 0.
 * Falls back to two-line total when tax is zero or IVA account missing.
 */
export function buildSalesInvoiceJournalInput(params: {
  companyId: string;
  projectId: string | null;
  entryDate: string;
  description: string;
  reference: string | null;
  currency: string;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  clientsAccountId: string;
  incomeAccountId: string;
  ivaDebitAccountId: string | null;
  sourceId: string;
}): { input: CreateJournalEntryInput; usedIvaSplit: boolean } {
  const taxPositive = params.taxAmount.gt(0);
  if (!taxPositive || !params.ivaDebitAccountId) {
    return {
      usedIvaSplit: false,
      input: buildTwoLineJournalInput({
        companyId: params.companyId,
        projectId: params.projectId,
        entryDate: params.entryDate,
        description: params.description,
        reference: params.reference,
        currency: params.currency,
        amount: params.totalAmount,
        debitAccountId: params.clientsAccountId,
        creditAccountId: params.incomeAccountId,
        lineDescriptionDebit: "Debe — clientes",
        lineDescriptionCredit: "Haber — ingresos",
        sourceType: "SALES_INVOICE",
        sourceId: params.sourceId,
      }),
    };
  }

  return {
    usedIvaSplit: true,
    input: {
      companyId: params.companyId,
      projectId: params.projectId,
      entryDate: params.entryDate,
      description: params.description,
      reference: params.reference,
      sourceType: "SALES_INVOICE",
      sourceId: params.sourceId,
      lines: [
        {
          accountId: params.clientsAccountId,
          projectId: params.projectId,
          description: "Debe — clientes (total c/IVA)",
          debit: moneyAmountString(params.totalAmount),
          credit: "0",
          currency: params.currency,
        },
        {
          accountId: params.incomeAccountId,
          projectId: params.projectId,
          description: "Haber — ingresos (neto)",
          debit: "0",
          credit: moneyAmountString(params.subtotal),
          currency: params.currency,
        },
        {
          accountId: params.ivaDebitAccountId,
          projectId: params.projectId,
          description: "Haber — IVA débito fiscal",
          debit: "0",
          credit: moneyAmountString(params.taxAmount),
          currency: params.currency,
        },
      ],
    },
  };
}

/**
 * AP issued invoice: Gasto (neto) + IVA Crédito (tax) / Proveedores (total) when tax > 0.
 */
export function buildSupplierInvoiceJournalInput(params: {
  companyId: string;
  projectId: string | null;
  entryDate: string;
  description: string;
  reference: string | null;
  currency: string;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  expenseAccountId: string;
  suppliersAccountId: string;
  ivaCreditAccountId: string | null;
  sourceId: string;
}): { input: CreateJournalEntryInput; usedIvaSplit: boolean } {
  const taxPositive = params.taxAmount.gt(0);
  if (!taxPositive || !params.ivaCreditAccountId) {
    return {
      usedIvaSplit: false,
      input: buildTwoLineJournalInput({
        companyId: params.companyId,
        projectId: params.projectId,
        entryDate: params.entryDate,
        description: params.description,
        reference: params.reference,
        currency: params.currency,
        amount: params.totalAmount,
        debitAccountId: params.expenseAccountId,
        creditAccountId: params.suppliersAccountId,
        lineDescriptionDebit: "Debe — gasto/costo",
        lineDescriptionCredit: "Haber — proveedores",
        sourceType: "SUPPLIER_INVOICE",
        sourceId: params.sourceId,
      }),
    };
  }

  return {
    usedIvaSplit: true,
    input: {
      companyId: params.companyId,
      projectId: params.projectId,
      entryDate: params.entryDate,
      description: params.description,
      reference: params.reference,
      sourceType: "SUPPLIER_INVOICE",
      sourceId: params.sourceId,
      lines: [
        {
          accountId: params.expenseAccountId,
          projectId: params.projectId,
          description: "Debe — gasto/costo (neto)",
          debit: moneyAmountString(params.subtotal),
          credit: "0",
          currency: params.currency,
        },
        {
          accountId: params.ivaCreditAccountId,
          projectId: params.projectId,
          description: "Debe — IVA crédito fiscal",
          debit: moneyAmountString(params.taxAmount),
          credit: "0",
          currency: params.currency,
        },
        {
          accountId: params.suppliersAccountId,
          projectId: params.projectId,
          description: "Haber — proveedores (total c/IVA)",
          debit: "0",
          credit: moneyAmountString(params.totalAmount),
          currency: params.currency,
        },
      ],
    },
  };
}
