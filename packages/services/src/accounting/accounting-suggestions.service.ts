import { Prisma, prisma } from "@bloqer/database";
import type { JournalEntrySourceType, AccountingMappingEventType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateJournalEntryInput, GenerateJournalSuggestionInput } from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { findActiveMappingRule } from "./accounting-mapping.service";
import {
  createJournalEntry,
  getJournalEntryBySourceIfNotCancelled,
  type JournalEntryView,
} from "./journal-entry.service";
import { resolveAccountingCompanyId } from "./accounting-company-context";

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
  if (ctx.companyId && ctx.companyId !== entityCompanyId) {
    throw new ServiceError("FORBIDDEN", "El documento pertenece a otra empresa");
  }
}

function decimalToAmountString(d: Prisma.Decimal): string {
  const fixed = d.toDecimalPlaces(4).toFixed(4);
  const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
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

/** Movement ledger rows that map to `AccountingMappingEventType` / `movementToEventType`. */
export function treasuryMovementTypeSupportsAccountingDraft(type: string): boolean {
  return type === "INFLOW" || type === "OUTFLOW" || type === "TRANSFER_IN" || type === "TRANSFER_OUT";
}

export async function suggestJournalFromCollection(
  collectionId: string,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const col = await prisma.collection.findFirst({
    where: { id: collectionId, tenantId: ctx.tenantId },
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
    debitAccountId:  rule.debitAccountId,
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
    creditAccountId: rule.creditAccountId,
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
  if (mov.status !== "CONFIRMED") {
    throw new ServiceError("CONFLICT", "Solo se pueden sugerir asientos para movimientos confirmados");
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
  const sourceId = mov.transferId ?? mov.id;

  const existingMov = await getJournalEntryBySourceIfNotCancelled(ctx, {
    companyId,
    sourceType,
    sourceId,
  });
  if (existingMov) return existingMov;

  const rule = await findActiveMappingRule(ctx.tenantId, companyId, eventType);
  if (!rule) throw noRuleError("movimiento de tesorería de este tipo");

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
    debitAccountId:  rule.debitAccountId,
    creditAccountId: rule.creditAccountId,
    lineDescriptionDebit:  `Debe — ${mov.type}`,
    lineDescriptionCredit: `Haber — ${mov.type}`,
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
    case "TREASURY_OUTFLOW":
    case "TREASURY_TRANSFER": {
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
    case "STOCK_CONSUMPTION": {
      const sm = await prisma.stockMovement.findFirst({
        where: { id: input.sourceId, tenantId: ctx.tenantId },
      });
      if (!sm) throw new ServiceError("NOT_FOUND", "Movimiento de stock no encontrado");
      await assertOptionalCompanyFilter(ctx, input.companyId, sm.companyId);
      return suggestJournalFromStockMovement(input.sourceId, ctx);
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
