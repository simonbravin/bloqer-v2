import { Prisma, prisma } from "@bloqer/database";
import type { JournalEntrySourceType, AccountingMappingEventType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { roundMoney } from "@bloqer/utils";
import type { CreateJournalEntryInput, GenerateJournalSuggestionInput } from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
import { isCrossCompany } from "../company-scope";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { findActiveMappingRule } from "./accounting-mapping.service";
import {
  createJournalEntry,
  getJournalEntryBySourceIfNotCancelled,
  type JournalEntryView,
} from "./journal-entry.service";
import { resolveAccountingCompanyId } from "./accounting-company-context";
import {
  treasuryMovementSupportsAccountingDraft,
  treasuryMovementTypeSupportsAccountingDraft,
} from "./accounting-treasury-gl-eligibility";
import { suggestTreasuryGlAccountCode } from "./treasury-gl-account-hint";
import {
  buildSalesInvoiceJournalInput,
  buildSupplierInvoiceJournalInput,
  COA_IVA_CREDIT_FISCAL,
  COA_IVA_DEBIT_FISCAL,
} from "./accounting-invoice-journal-lines";

async function resolveActiveGlAccountId(
  tenantId: string,
  companyId: string,
  code: string,
): Promise<string | null> {
  const acc = await prisma.accountingAccount.findFirst({
    where: { tenantId, companyId, code, isActive: true },
    select: { id: true },
  });
  return acc?.id ?? null;
}

export {
  treasuryMovementSupportsAccountingDraft,
  treasuryMovementTypeSupportsAccountingDraft,
} from "./accounting-treasury-gl-eligibility";

async function assertOptionalCompanyFilter(
  ctx: ServiceContext,
  filterCompanyId: string | null | undefined,
  entityCompanyId: string,
): Promise<void> {
  if (filterCompanyId == null || filterCompanyId === "") return;
  const resolved = await resolveAccountingCompanyId(ctx, filterCompanyId);
  if (resolved !== entityCompanyId) {
    throw new ServiceError("VALIDATION", "La empresa indicada no coincide con el documento origen");
  }
}

async function assertEdit(ctx: ServiceContext): Promise<void> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para generar asientos contables");
  }
}

function assertCompanyScope(ctx: ServiceContext, entityCompanyId: string) {
  if (isCrossCompany(entityCompanyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El documento pertenece a otra empresa");
  }
}

function decimalToAmountString(d: Prisma.Decimal): string {
  return roundMoney(d.toString());
}

function noRuleError(label: string): ServiceError {
  return new ServiceError(
    "CONFLICT",
    `No hay regla contable activa para ${label}. Configurá una en Contabilidad → Reglas contables.`,
  );
}

function buildTwoLineDraftInput(params: {
  companyId:     string;
  projectId:     string | null;
  entryDate:     string;
  description:   string;
  reference:     string | null;
  currency:      string;
  amountStr:     string;
  debitAccountId:  string;
  creditAccountId: string;
  lineDescriptionDebit:  string;
  lineDescriptionCredit: string;
  sourceType:    JournalEntrySourceType;
  sourceId:      string;
}): CreateJournalEntryInput {
  return {
    companyId:   params.companyId,
    projectId:   params.projectId,
    entryDate:   params.entryDate,
    description: params.description,
    reference:   params.reference,
    sourceType:  params.sourceType,
    sourceId:    params.sourceId,
    lines:       [
      {
        accountId:   params.debitAccountId,
        projectId:   params.projectId,
        description: params.lineDescriptionDebit,
        debit:       params.amountStr,
        credit:      "0",
        currency:    params.currency,
      },
      {
        accountId:   params.creditAccountId,
        projectId:   params.projectId,
        description: params.lineDescriptionCredit,
        debit:       "0",
        credit:      params.amountStr,
        currency:    params.currency,
      },
    ],
  };
}

function movementToEventType(m: { type: string }): AccountingMappingEventType {
  if (m.type === "INFLOW") return "TREASURY_INFLOW";
  if (m.type === "OUTFLOW") return "TREASURY_OUTFLOW";
  if (m.type === "TRANSFER_IN" || m.type === "TRANSFER_OUT") return "TREASURY_TRANSFER";
  throw new ServiceError("CONFLICT", "Este tipo de movimiento de tesorería aún no admite sugerencia automática de asiento");
}

function movementToJournalSourceType(m: { type: string }): JournalEntrySourceType {
  if (m.type === "INFLOW") return "TREASURY_INFLOW";
  if (m.type === "OUTFLOW") return "TREASURY_OUTFLOW";
  if (m.type === "TRANSFER_IN" || m.type === "TRANSFER_OUT") return "INTERNAL_TRANSFER";
  return "ADJUSTMENT";
}

export async function suggestJournalFromCollection(
  collectionId: string,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const col = await prisma.collection.findFirst({
    where: { id: collectionId, tenantId: ctx.tenantId },
    include: { account: { select: { type: true, currency: true } } },
  });
  if (!col) throw new ServiceError("NOT_FOUND", "Cobranza no encontrada");
  if (col.status !== "CONFIRMED") {
    throw new ServiceError("CONFLICT", "Solo se pueden sugerir asientos para cobranzas confirmadas");
  }
  assertCompanyScope(ctx, col.companyId);
  await resolveAccountingCompanyId(ctx, col.companyId);

  const existingCol = await getJournalEntryBySourceIfNotCancelled(ctx, {
    companyId:  col.companyId,
    sourceType: "COLLECTION",
    sourceId:   col.id,
  });
  if (existingCol) return existingCol;

  const rule = await findActiveMappingRule(ctx.tenantId, col.companyId, "COLLECTION_CONFIRMED");
  if (!rule) throw noRuleError("cobranza confirmada");

  const treasuryGlCode = suggestTreasuryGlAccountCode(col.account);
  const debitOverride = await resolveActiveGlAccountId(
    ctx.tenantId,
    col.companyId,
    treasuryGlCode,
  );

  const amountStr = decimalToAmountString(col.amount);
  const entryDate = col.collectionDate.toISOString().slice(0, 10);
  const input = buildTwoLineDraftInput({
    companyId:     col.companyId,
    projectId:     col.projectId,
    entryDate,
    description:   `Asiento sugerido — cobranza (${col.id.slice(0, 8)}…)`,
    reference:     `COB-${col.id.slice(0, 8)}`,
    currency:      col.currency,
    amountStr,
    debitAccountId:  debitOverride ?? rule.debitAccountId,
    creditAccountId: rule.creditAccountId,
    lineDescriptionDebit:  "Debe — según regla contable",
    lineDescriptionCredit: "Haber — según regla contable",
    sourceType:    "COLLECTION",
    sourceId:      col.id,
  });
  return createJournalEntry(input, ctx);
}

export async function suggestJournalFromPayment(
  paymentId: string,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const pay = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId: ctx.tenantId },
    include: { account: { select: { type: true, currency: true } } },
  });
  if (!pay) throw new ServiceError("NOT_FOUND", "Pago no encontrado");
  if (pay.status !== "CONFIRMED") {
    throw new ServiceError("CONFLICT", "Solo se pueden sugerir asientos para pagos confirmados");
  }
  assertCompanyScope(ctx, pay.companyId);
  await resolveAccountingCompanyId(ctx, pay.companyId);

  const existingPay = await getJournalEntryBySourceIfNotCancelled(ctx, {
    companyId:  pay.companyId,
    sourceType: "PAYMENT",
    sourceId:   pay.id,
  });
  if (existingPay) return existingPay;

  const rule = await findActiveMappingRule(ctx.tenantId, pay.companyId, "PAYMENT_CONFIRMED");
  if (!rule) throw noRuleError("pago confirmado");

  const treasuryGlCode = suggestTreasuryGlAccountCode(pay.account);
  const creditOverride = await resolveActiveGlAccountId(
    ctx.tenantId,
    pay.companyId,
    treasuryGlCode,
  );

  const amountStr = decimalToAmountString(pay.amount);
  const entryDate = pay.paymentDate.toISOString().slice(0, 10);
  const input = buildTwoLineDraftInput({
    companyId:     pay.companyId,
    projectId:     pay.projectId,
    entryDate,
    description:   `Asiento sugerido — pago a proveedor (${pay.id.slice(0, 8)}…)`,
    reference:     `PAGO-${pay.id.slice(0, 8)}`,
    currency:      pay.currency,
    amountStr,
    debitAccountId:  rule.debitAccountId,
    creditAccountId: creditOverride ?? rule.creditAccountId,
    lineDescriptionDebit:  "Debe — según regla contable",
    lineDescriptionCredit: "Haber — según regla contable",
    sourceType:    "PAYMENT",
    sourceId:      pay.id,
  });
  return createJournalEntry(input, ctx);
}

export async function suggestJournalFromTreasuryMovement(
  accountMovementId: string,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const mov = await prisma.accountMovement.findFirst({
    where: { id: accountMovementId, tenantId: ctx.tenantId },
    include: { account: true },
  });
  if (!mov) throw new ServiceError("NOT_FOUND", "Movimiento de tesorería no encontrado");
  if (mov.status !== "CONFIRMED" && mov.status !== "RECONCILED") {
    throw new ServiceError(
      "CONFLICT",
      "Solo se pueden sugerir asientos para movimientos confirmados o conciliados",
    );
  }
  if (!treasuryMovementSupportsAccountingDraft({ type: mov.type, sourceType: mov.sourceType })) {
    throw new ServiceError(
      "CONFLICT",
      "Este movimiento ya está cubierto por el asiento de cobranza/pago (o es saldo inicial). Generá el asiento desde el documento origen.",
    );
  }

  const companyId = mov.companyId ?? mov.account.companyId ?? null;
  if (!companyId) {
    throw new ServiceError(
      "CONFLICT",
      "El movimiento no tiene empresa contable asociada; no se puede generar un asiento sugerido",
    );
  }
  assertCompanyScope(ctx, companyId);
  await resolveAccountingCompanyId(ctx, companyId);

  const eventType = movementToEventType(mov);
  const sourceType = movementToJournalSourceType(mov);
  // Canonical INTERNAL_TRANSFER sourceId is InternalTransfer.id (same as auto-draft / cancel-sync).
  const transferId =
    mov.transferId
    ?? (mov.sourceType === "INTERNAL_TRANSFER" ? mov.sourceId : null);
  if ((mov.type === "TRANSFER_IN" || mov.type === "TRANSFER_OUT") && !transferId) {
    throw new ServiceError(
      "CONFLICT",
      "El movimiento de transferencia no tiene id de transferencia; no se puede generar el asiento",
    );
  }
  const sourceId = transferId ?? mov.id;

  const existingMov = await getJournalEntryBySourceIfNotCancelled(ctx, {
    companyId,
    sourceType,
    sourceId,
  });
  if (existingMov) return existingMov;

  const rule = await findActiveMappingRule(ctx.tenantId, companyId, eventType);
  if (!rule) throw noRuleError("movimiento de tesorería de este tipo");

  let debitAccountId = rule.debitAccountId;
  let creditAccountId = rule.creditAccountId;
  let lineDescriptionDebit = `Debe — ${mov.type}`;
  let lineDescriptionCredit = `Haber — ${mov.type}`;

  if (transferId && (mov.type === "TRANSFER_IN" || mov.type === "TRANSFER_OUT")) {
    const legs = await prisma.accountMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["CONFIRMED", "RECONCILED"] },
        OR: [
          { transferId },
          { sourceType: "INTERNAL_TRANSFER", sourceId: transferId },
        ],
      },
      include: { account: true },
      orderBy: { id: "asc" },
    });
    const outLeg = legs.find((l) => l.type === "TRANSFER_OUT");
    const inLeg = legs.find((l) => l.type === "TRANSFER_IN");
    if (inLeg) {
      const debitGl = await resolveActiveGlAccountId(
        ctx.tenantId,
        companyId,
        suggestTreasuryGlAccountCode({
          type: inLeg.account.type,
          currency: inLeg.account.currency,
        }),
      );
      if (debitGl) debitAccountId = debitGl;
      lineDescriptionDebit = "Debe — cuenta destino";
    }
    if (outLeg) {
      const creditGl = await resolveActiveGlAccountId(
        ctx.tenantId,
        companyId,
        suggestTreasuryGlAccountCode({
          type: outLeg.account.type,
          currency: outLeg.account.currency,
        }),
      );
      if (creditGl) creditAccountId = creditGl;
      lineDescriptionCredit = "Haber — cuenta origen";
    }
  } else {
    const treasuryGlId = await resolveActiveGlAccountId(
      ctx.tenantId,
      companyId,
      suggestTreasuryGlAccountCode({
        type: mov.account.type,
        currency: mov.account.currency,
      }),
    );
    if (treasuryGlId) {
      if (mov.type === "INFLOW") debitAccountId = treasuryGlId;
      if (mov.type === "OUTFLOW") creditAccountId = treasuryGlId;
    }
  }

  const amountStr = decimalToAmountString(mov.amount);
  const entryDate = mov.movementDate.toISOString().slice(0, 10);

  const input = buildTwoLineDraftInput({
    companyId,
    projectId:     null,
    entryDate,
    description:   `Asiento sugerido — tesorería: ${mov.description.slice(0, 200)}`,
    reference:     `MOV-${mov.id.slice(0, 8)}`,
    currency:      mov.currency,
    amountStr,
    debitAccountId,
    creditAccountId,
    lineDescriptionDebit,
    lineDescriptionCredit,
    sourceType,
    sourceId,
  });
  return createJournalEntry(input, ctx);
}

export async function suggestJournalFromStockMovement(
  stockMovementId: string,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const sm = await prisma.stockMovement.findFirst({
    where: { id: stockMovementId, tenantId: ctx.tenantId },
  });
  if (!sm) throw new ServiceError("NOT_FOUND", "Movimiento de stock no encontrado");
  if (sm.status !== "CONFIRMED") {
    throw new ServiceError("CONFLICT", "Solo se pueden sugerir asientos para movimientos confirmados");
  }
  if (sm.type !== "OUT" || sm.sourceType !== "CONSUMPTION") {
    throw new ServiceError(
      "CONFLICT",
      "Solo los consumos de inventario (salida CONSUMPTION) usan la regla STOCK_CONSUMPTION",
    );
  }

  assertCompanyScope(ctx, sm.companyId);
  await resolveAccountingCompanyId(ctx, sm.companyId);

  const existingSm = await getJournalEntryBySourceIfNotCancelled(ctx, {
    companyId:  sm.companyId,
    sourceType: "STOCK_MOVEMENT",
    sourceId:   sm.id,
  });
  if (existingSm) return existingSm;

  const rule = await findActiveMappingRule(ctx.tenantId, sm.companyId, "STOCK_CONSUMPTION");
  if (!rule) throw noRuleError("consumo de inventario");

  const cost = sm.totalCost ?? sm.unitCost;
  if (!cost || cost.lte(0)) {
    throw new ServiceError("CONFLICT", "El movimiento de stock no tiene costo contable para imputar");
  }
  const amountStr = decimalToAmountString(cost);
  const entryDate = sm.movementDate.toISOString().slice(0, 10);
  const projectId = sm.projectId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { baseCurrency: true },
  });
  const stockCurrency = tenant?.baseCurrency ?? "ARS";
  const input = buildTwoLineDraftInput({
    companyId:     sm.companyId,
    projectId,
    entryDate,
    description:   `Asiento sugerido — consumo de inventario (${sm.id.slice(0, 8)}…)`,
    reference:     `STK-${sm.id.slice(0, 8)}`,
    currency:      stockCurrency,
    amountStr,
    debitAccountId:  rule.debitAccountId,
    creditAccountId: rule.creditAccountId,
    lineDescriptionDebit:  "Debe — costo consumo",
    lineDescriptionCredit: "Haber — salida inventario",
    sourceType:    "STOCK_MOVEMENT",
    sourceId:      sm.id,
  });
  return createJournalEntry(input, ctx);
}

export async function suggestJournalFromSalesInvoice(
  salesInvoiceId: string,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const inv = await prisma.salesInvoice.findFirst({
    where: { id: salesInvoiceId, tenantId: ctx.tenantId },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura de venta no encontrada");
  if (inv.status !== "ISSUED") {
    throw new ServiceError("CONFLICT", "Solo se pueden sugerir asientos para facturas emitidas");
  }
  assertCompanyScope(ctx, inv.companyId);
  await resolveAccountingCompanyId(ctx, inv.companyId);

  const existing = await getJournalEntryBySourceIfNotCancelled(ctx, {
    companyId: inv.companyId,
    sourceType: "SALES_INVOICE",
    sourceId: inv.id,
  });
  if (existing) return existing;

  const rule = await findActiveMappingRule(ctx.tenantId, inv.companyId, "SALES_INVOICE_ISSUED");
  if (!rule) throw noRuleError("factura de venta emitida");

  const ivaDebitAccountId = await resolveActiveGlAccountId(
    ctx.tenantId,
    inv.companyId,
    COA_IVA_DEBIT_FISCAL,
  );
  const { input } = buildSalesInvoiceJournalInput({
    companyId: inv.companyId,
    projectId: inv.projectId,
    entryDate: inv.issueDate.toISOString().slice(0, 10),
    description: `Asiento sugerido — factura venta ${inv.number}`,
    reference: String(inv.number),
    currency: inv.currency,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    totalAmount: inv.totalAmount,
    clientsAccountId: rule.debitAccountId,
    incomeAccountId: rule.creditAccountId,
    ivaDebitAccountId,
    sourceId: inv.id,
  });
  return createJournalEntry(input, ctx);
}

export async function suggestJournalFromSupplierInvoice(
  supplierInvoiceId: string,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const inv = await prisma.supplierInvoice.findFirst({
    where: { id: supplierInvoiceId, tenantId: ctx.tenantId },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura de proveedor no encontrada");
  if (inv.status !== "ISSUED") {
    throw new ServiceError("CONFLICT", "Solo se pueden sugerir asientos para facturas emitidas");
  }
  assertCompanyScope(ctx, inv.companyId);
  await resolveAccountingCompanyId(ctx, inv.companyId);

  const existing = await getJournalEntryBySourceIfNotCancelled(ctx, {
    companyId: inv.companyId,
    sourceType: "SUPPLIER_INVOICE",
    sourceId: inv.id,
  });
  if (existing) return existing;

  const rule = await findActiveMappingRule(ctx.tenantId, inv.companyId, "SUPPLIER_INVOICE_ISSUED");
  if (!rule) throw noRuleError("factura de proveedor emitida");

  const ivaCreditAccountId = await resolveActiveGlAccountId(
    ctx.tenantId,
    inv.companyId,
    COA_IVA_CREDIT_FISCAL,
  );
  const { input } = buildSupplierInvoiceJournalInput({
    companyId: inv.companyId,
    projectId: inv.projectId,
    entryDate: inv.issueDate.toISOString().slice(0, 10),
    description: `Asiento sugerido — factura proveedor ${inv.number}`,
    reference: String(inv.number),
    currency: inv.currency,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    totalAmount: inv.totalAmount,
    expenseAccountId: rule.debitAccountId,
    suppliersAccountId: rule.creditAccountId,
    ivaCreditAccountId,
    sourceId: inv.id,
  });
  return createJournalEntry(input, ctx);
}

/** Router for optional tooling / future UI; validates treasury event vs movement type. */
export async function generateDraftJournalFromSuggestion(
  input: GenerateJournalSuggestionInput,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  switch (input.eventType) {
    case "COLLECTION_CONFIRMED": {
      const col = await prisma.collection.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
      });
      if (!col) throw new ServiceError("NOT_FOUND", "Cobranza no encontrada");
      await assertOptionalCompanyFilter(ctx, input.companyId, col.companyId);
      return suggestJournalFromCollection(input.sourceId, ctx);
    }
    case "PAYMENT_CONFIRMED": {
      const pay = await prisma.payment.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
      });
      if (!pay) throw new ServiceError("NOT_FOUND", "Pago no encontrado");
      await assertOptionalCompanyFilter(ctx, input.companyId, pay.companyId);
      return suggestJournalFromPayment(input.sourceId, ctx);
    }
    case "TREASURY_INFLOW":
    case "TREASURY_OUTFLOW": {
      const mov = await prisma.accountMovement.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
        include: { account: true },
      });
      if (!mov) throw new ServiceError("NOT_FOUND", "Movimiento de tesorería no encontrado");
      const derived = movementToEventType(mov);
      if (derived !== input.eventType) {
        throw new ServiceError(
          "VALIDATION",
          "El tipo de evento no coincide con el movimiento de tesorería seleccionado",
        );
      }
      const movCompanyId = mov.companyId ?? mov.account.companyId ?? null;
      if (movCompanyId) await assertOptionalCompanyFilter(ctx, input.companyId, movCompanyId);
      return suggestJournalFromTreasuryMovement(input.sourceId, ctx);
    }
    case "TREASURY_TRANSFER": {
      // Accept InternalTransfer.id (canonical GL sourceId) or a transfer leg movement id.
      const transfer = await prisma.internalTransfer.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
      });
      if (transfer) {
        await assertOptionalCompanyFilter(ctx, input.companyId, transfer.companyId);
        const leg = await prisma.accountMovement.findFirst({
          where: {
            tenantId: ctx.tenantId,
            status: { in: ["CONFIRMED", "RECONCILED"] },
            OR: [
              { transferId: transfer.id },
              { sourceType: "INTERNAL_TRANSFER", sourceId: transfer.id },
            ],
          },
          orderBy: { id: "asc" },
        });
        if (!leg) {
          throw new ServiceError("NOT_FOUND", "Movimientos de la transferencia no encontrados");
        }
        return suggestJournalFromTreasuryMovement(leg.id, ctx);
      }

      const mov = await prisma.accountMovement.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
        include: { account: true },
      });
      if (!mov) throw new ServiceError("NOT_FOUND", "Transferencia o movimiento no encontrado");
      const derived = movementToEventType(mov);
      if (derived !== "TREASURY_TRANSFER") {
        throw new ServiceError(
          "VALIDATION",
          "El tipo de evento no coincide con el movimiento de tesorería seleccionado",
        );
      }
      const movCompanyId = mov.companyId ?? mov.account.companyId ?? null;
      if (movCompanyId) await assertOptionalCompanyFilter(ctx, input.companyId, movCompanyId);
      return suggestJournalFromTreasuryMovement(input.sourceId, ctx);
    }
    case "STOCK_CONSUMPTION": {
      const sm = await prisma.stockMovement.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
      });
      if (!sm) throw new ServiceError("NOT_FOUND", "Movimiento de stock no encontrado");
      await assertOptionalCompanyFilter(ctx, input.companyId, sm.companyId);
      return suggestJournalFromStockMovement(input.sourceId, ctx);
    }
    case "SALES_INVOICE_ISSUED": {
      const inv = await prisma.salesInvoice.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
      });
      if (!inv) throw new ServiceError("NOT_FOUND", "Factura de venta no encontrada");
      await assertOptionalCompanyFilter(ctx, input.companyId, inv.companyId);
      return suggestJournalFromSalesInvoice(input.sourceId, ctx);
    }
    case "SUPPLIER_INVOICE_ISSUED": {
      const inv = await prisma.supplierInvoice.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
      });
      if (!inv) throw new ServiceError("NOT_FOUND", "Factura de proveedor no encontrada");
      await assertOptionalCompanyFilter(ctx, input.companyId, inv.companyId);
      return suggestJournalFromSupplierInvoice(input.sourceId, ctx);
    }
    case "MANUAL_CAPITAL_CONTRIBUTION":
    case "MANUAL_OWNER_LOAN":
      throw new ServiceError(
        "CONFLICT",
        "Este evento no tiene documento operativo en Bloqer; registrá el asiento manualmente o usá el diario general.",
      );
    default:
      throw new ServiceError("VALIDATION", "Tipo de evento no soportado");
  }
}
