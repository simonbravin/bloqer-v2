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

/**
 * Decide whether we can emit a multi-line tax split ([D-085]/[D-112]).
 * IVA requires its CoA account when tax > 0.
 * Missing IIBB account does **not** block the split: percepción folds into neto
 * so IVA crédito/débito is preserved on existing companies without v3 CoA.
 */
function canEmitTaxSplit(params: {
  taxAmount: Prisma.Decimal;
  ivaAccountId: string | null;
}): boolean {
  if (params.taxAmount.gt(0) && !params.ivaAccountId) return false;
  // tax == 0 (with or without IIBB) can still split if we have components to show
  return true;
}

/**
 * AR issued invoice: Clientes (total) / Ingresos (neto [+ IIBB folded]) + IVA Débito + Perc. IIBB a depositar.
 * Falls back to two-line total when tax > 0 but IVA account missing, or no tax/perception.
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
  const taxPositive = params.taxAmount.gt(0);
  const iibbPositive = iibb.gt(0);

  if ((!taxPositive && !iibbPositive) || !canEmitTaxSplit({
    taxAmount: params.taxAmount,
    ivaAccountId: params.ivaDebitAccountId,
  })) {
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

  const hasIibbLine = iibbPositive && Boolean(iibbAccount);
  // Fold percepción into ingresos when CoA IIBB is missing so IVA split still works.
  const incomeCredit = hasIibbLine ? params.subtotal : params.subtotal.plus(iibb);

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
      description: hasIibbLine
        ? "Haber — ingresos (neto)"
        : iibbPositive
          ? "Haber — ingresos (neto + Perc. IIBB sin cuenta)"
          : "Haber — ingresos (neto)",
      debit: "0",
      credit: moneyAmountString(incomeCredit),
      currency: params.currency,
    },
  ];
  if (taxPositive && params.ivaDebitAccountId) {
    lines.push({
      accountId: params.ivaDebitAccountId,
      projectId: params.projectId,
      description: "Haber — IVA débito fiscal",
      debit: "0",
      credit: moneyAmountString(params.taxAmount),
      currency: params.currency,
    });
  }
  if (hasIibbLine && iibbAccount) {
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
 * AP issued invoice: Gasto (neto [+ IIBB folded]) + IVA Crédito + Perc. IIBB crédito / Proveedores (total).
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
  const taxPositive = params.taxAmount.gt(0);
  const iibbPositive = iibb.gt(0);

  if ((!taxPositive && !iibbPositive) || !canEmitTaxSplit({
    taxAmount: params.taxAmount,
    ivaAccountId: params.ivaCreditAccountId,
  })) {
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

  const hasIibbLine = iibbPositive && Boolean(iibbAccount);
  const expenseDebit = hasIibbLine ? params.subtotal : params.subtotal.plus(iibb);

  const lines: JournalLineDraft[] = [
    {
      accountId: params.expenseAccountId,
      projectId: params.projectId,
      description: hasIibbLine
        ? "Debe — gasto/costo (neto)"
        : iibbPositive
          ? "Debe — gasto/costo (neto + Perc. IIBB sin cuenta)"
          : "Debe — gasto/costo (neto)",
      debit: moneyAmountString(expenseDebit),
      credit: "0",
      currency: params.currency,
    },
  ];
  if (taxPositive && params.ivaCreditAccountId) {
    lines.push({
      accountId: params.ivaCreditAccountId,
      projectId: params.projectId,
      description: "Debe — IVA crédito fiscal",
      debit: moneyAmountString(params.taxAmount),
      credit: "0",
      currency: params.currency,
    });
  }
  if (hasIibbLine && iibbAccount) {
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
