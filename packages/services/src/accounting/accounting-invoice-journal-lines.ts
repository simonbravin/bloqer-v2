import { Prisma } from "@bloqer/database";
import type { JournalEntrySourceType } from "@bloqer/database";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import type { CreateJournalEntryInput } from "@bloqer/validators";

/** CoA template codes ([D-085] / [D-112]) — Argentine construction seed. */
export const COA_IVA_CREDIT_FISCAL = "1.1.20";
export const COA_IVA_DEBIT_FISCAL = "2.1.10";
/** Percepción IIBB sufrida (compras) — activo / crédito fiscal ([D-112]). */
export const COA_IIBB_PERCEPTION_CREDIT = "1.1.22";
/** Percepción IIBB a depositar (ventas) — pasivo ([D-112]). */
export const COA_IIBB_PERCEPTION_DEBIT = "2.1.12";

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

type JournalLineDraft = CreateJournalEntryInput["lines"][number];

function canSplitTaxComponents(params: {
  taxAmount: Prisma.Decimal;
  iibbPerceptionAmount: Prisma.Decimal;
  ivaAccountId: string | null;
  iibbAccountId: string | null;
}): boolean {
  const taxPositive = params.taxAmount.gt(0);
  const iibbPositive = params.iibbPerceptionAmount.gt(0);
  if (!taxPositive && !iibbPositive) return false;
  if (taxPositive && !params.ivaAccountId) return false;
  if (iibbPositive && !params.iibbAccountId) return false;
  return true;
}

/**
 * AR issued invoice: Clientes (total) / Ingresos (neto) + IVA Débito + Perc. IIBB a depositar.
 * Falls back to two-line total when no tax/perception or required accounts missing.
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
  iibbPerceptionAmount?: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  clientsAccountId: string;
  incomeAccountId: string;
  ivaDebitAccountId: string | null;
  iibbPerceptionDebitAccountId?: string | null;
  sourceId: string;
}): { input: CreateJournalEntryInput; usedIvaSplit: boolean } {
  const iibb = params.iibbPerceptionAmount ?? new Prisma.Decimal(0);
  const iibbAccount = params.iibbPerceptionDebitAccountId ?? null;
  if (
    !canSplitTaxComponents({
      taxAmount: params.taxAmount,
      iibbPerceptionAmount: iibb,
      ivaAccountId: params.ivaDebitAccountId,
      iibbAccountId: iibbAccount,
    })
  ) {
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

  const lines: JournalLineDraft[] = [
    {
      accountId: params.clientsAccountId,
      projectId: params.projectId,
      description: "Debe — clientes (total c/impuestos)",
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
  ];
  if (params.taxAmount.gt(0) && params.ivaDebitAccountId) {
    lines.push({
      accountId: params.ivaDebitAccountId,
      projectId: params.projectId,
      description: "Haber — IVA débito fiscal",
      debit: "0",
      credit: moneyAmountString(params.taxAmount),
      currency: params.currency,
    });
  }
  if (iibb.gt(0) && iibbAccount) {
    lines.push({
      accountId: iibbAccount,
      projectId: params.projectId,
      description: "Haber — Percepción IIBB a depositar",
      debit: "0",
      credit: moneyAmountString(iibb),
      currency: params.currency,
    });
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
      lines,
    },
  };
}

/**
 * AP issued invoice: Gasto (neto) + IVA Crédito + Perc. IIBB crédito / Proveedores (total).
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
  iibbPerceptionAmount?: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  expenseAccountId: string;
  suppliersAccountId: string;
  ivaCreditAccountId: string | null;
  iibbPerceptionCreditAccountId?: string | null;
  sourceId: string;
}): { input: CreateJournalEntryInput; usedIvaSplit: boolean } {
  const iibb = params.iibbPerceptionAmount ?? new Prisma.Decimal(0);
  const iibbAccount = params.iibbPerceptionCreditAccountId ?? null;
  if (
    !canSplitTaxComponents({
      taxAmount: params.taxAmount,
      iibbPerceptionAmount: iibb,
      ivaAccountId: params.ivaCreditAccountId,
      iibbAccountId: iibbAccount,
    })
  ) {
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

  const lines: JournalLineDraft[] = [
    {
      accountId: params.expenseAccountId,
      projectId: params.projectId,
      description: "Debe — gasto/costo (neto)",
      debit: moneyAmountString(params.subtotal),
      credit: "0",
      currency: params.currency,
    },
  ];
  if (params.taxAmount.gt(0) && params.ivaCreditAccountId) {
    lines.push({
      accountId: params.ivaCreditAccountId,
      projectId: params.projectId,
      description: "Debe — IVA crédito fiscal",
      debit: moneyAmountString(params.taxAmount),
      credit: "0",
      currency: params.currency,
    });
  }
  if (iibb.gt(0) && iibbAccount) {
    lines.push({
      accountId: iibbAccount,
      projectId: params.projectId,
      description: "Debe — Percepción IIBB crédito fiscal",
      debit: moneyAmountString(iibb),
      credit: "0",
      currency: params.currency,
    });
  }
  lines.push({
    accountId: params.suppliersAccountId,
    projectId: params.projectId,
    description: "Haber — proveedores (total c/impuestos)",
    debit: "0",
    credit: moneyAmountString(params.totalAmount),
    currency: params.currency,
  });

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
      lines,
    },
  };
}
