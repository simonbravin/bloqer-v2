import { Prisma, prisma } from "@bloqer/database";
import type { JournalEntrySourceType, AccountingMappingEventType } from "@bloqer/database";
import type { CreateJournalEntryInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { isTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { ServiceContext } from "../types";
import { findActiveMappingRule } from "./accounting-mapping.service";
import {
  createJournalEntryAsAutomation,
  lookupNonCancelledJournalEntryIdBySource,
  getJournalEntryByIdUnchecked,
  type JournalEntryView,
} from "./journal-entry.service";
import { treasuryMovementSupportsAccountingDraft } from "./accounting-treasury-gl-eligibility";
import { notifyAccountingDraftsPendingSoft } from "./accounting-draft-notifications.service";
import { suggestTreasuryGlAccountCode } from "./treasury-gl-account-hint";
import {
  buildSalesInvoiceJournalInput,
  buildSupplierInvoiceJournalInput,
  buildTwoLineJournalInput,
  COA_IVA_CREDIT_FISCAL,
  COA_IVA_DEBIT_FISCAL,
} from "./accounting-invoice-journal-lines";

type EnsureResult =
  | { status: "created" | "existing"; entry: JournalEntryView }
  | { status: "skipped"; reason: string };

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

async function auditSkip(
  ctx: ServiceContext,
  params: {
    companyId: string;
    sourceType: JournalEntrySourceType;
    sourceId: string;
    reason: string;
  },
): Promise<void> {
  try {
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "journal_entry.auto_draft_skipped",
      entityType: "JournalEntry",
      entityId: params.sourceId,
      after: {
        companyId: params.companyId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        reason: params.reason,
      },
      ipAddress: ctx.ipAddress,
    });
  } catch {
    // Soft path: never fail ops because audit failed.
  }
}

async function ensureFromRule(params: {
  ctx: ServiceContext;
  companyId: string;
  projectId: string | null;
  eventType: AccountingMappingEventType;
  sourceType: JournalEntrySourceType;
  sourceId: string;
  entryDate: string;
  description: string;
  reference: string | null;
  currency: string;
  amount: Prisma.Decimal;
  lineDebit: string;
  lineCredit: string;
  /** Soft override for cash/bank side (treasury type/currency heuristic). */
  debitAccountIdOverride?: string | null;
  creditAccountIdOverride?: string | null;
}): Promise<EnsureResult> {
  const { ctx } = params;

  const moduleOn = await isTenantModuleEnabled(ctx, "ACCOUNTING");
  if (!moduleOn) {
    await auditSkip(ctx, {
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      reason: "module_disabled",
    });
    return { status: "skipped", reason: "module_disabled" };
  }

  const existingId = await lookupNonCancelledJournalEntryIdBySource(ctx, {
    companyId: params.companyId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
  });
  if (existingId) {
    const entry = await getJournalEntryByIdUnchecked(existingId, ctx.tenantId, params.companyId);
    return { status: "existing", entry };
  }

  const rule = await findActiveMappingRule(ctx.tenantId, params.companyId, params.eventType);
  if (!rule) {
    await auditSkip(ctx, {
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      reason: "no_mapping_rule",
    });
    return { status: "skipped", reason: "no_mapping_rule" };
  }

  if (params.amount.lte(0)) {
    await auditSkip(ctx, {
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      reason: "non_positive_amount",
    });
    return { status: "skipped", reason: "non_positive_amount" };
  }

  const debitAccountId = params.debitAccountIdOverride ?? rule.debitAccountId;
  const creditAccountId = params.creditAccountIdOverride ?? rule.creditAccountId;

  try {
    const input = buildTwoLineJournalInput({
      companyId: params.companyId,
      projectId: params.projectId,
      entryDate: params.entryDate,
      description: params.description,
      reference: params.reference,
      currency: params.currency,
      amount: params.amount,
      debitAccountId,
      creditAccountId,
      lineDescriptionDebit: params.lineDebit,
      lineDescriptionCredit: params.lineCredit,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
    });
    const entry = await createJournalEntryAsAutomation(input, ctx, params.companyId);
    try {
      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "journal_entry.auto_draft_created",
        entityType: "JournalEntry",
        entityId: entry.id,
        after: {
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          companyId: params.companyId,
        },
        ipAddress: ctx.ipAddress,
      });
    } catch {
      // ignore
    }
    await notifyAccountingDraftsPendingSoft(ctx, { companyId: params.companyId });
    return { status: "created", entry };
  } catch (err) {
    const existingAfterRace = await lookupNonCancelledJournalEntryIdBySource(ctx, {
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
    });
    if (existingAfterRace) {
      const entry = await getJournalEntryByIdUnchecked(
        existingAfterRace,
        ctx.tenantId,
        params.companyId,
      );
      return { status: "existing", entry };
    }
    await auditSkip(ctx, {
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      reason: err instanceof Error ? err.message.slice(0, 200) : "create_failed",
    });
    return { status: "skipped", reason: "create_failed" };
  }
}

async function createDraftFromInput(
  ctx: ServiceContext,
  companyId: string,
  sourceType: JournalEntrySourceType,
  sourceId: string,
  input: CreateJournalEntryInput,
): Promise<EnsureResult> {
  try {
    const entry = await createJournalEntryAsAutomation(input, ctx, companyId);
    try {
      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "journal_entry.auto_draft_created",
        entityType: "JournalEntry",
        entityId: entry.id,
        after: { sourceType, sourceId, companyId },
        ipAddress: ctx.ipAddress,
      });
    } catch {
      // ignore
    }
    await notifyAccountingDraftsPendingSoft(ctx, { companyId });
    return { status: "created", entry };
  } catch (err) {
    const existingAfterRace = await lookupNonCancelledJournalEntryIdBySource(ctx, {
      companyId,
      sourceType,
      sourceId,
    });
    if (existingAfterRace) {
      const entry = await getJournalEntryByIdUnchecked(existingAfterRace, ctx.tenantId, companyId);
      return { status: "existing", entry };
    }
    await auditSkip(ctx, {
      companyId,
      sourceType,
      sourceId,
      reason: err instanceof Error ? err.message.slice(0, 200) : "create_failed",
    });
    return { status: "skipped", reason: "create_failed" };
  }
}
/** Best-effort: never throws to caller. Call only after operational commit. */
export async function ensureDraftJournalFromCollection(
  collectionId: string,
  ctx: ServiceContext,
): Promise<EnsureResult> {
  try {
    const col = await prisma.collection.findFirst({
      where: { id: collectionId, tenantId: ctx.tenantId },
      include: { account: { select: { type: true, currency: true } } },
    });
    if (!col || col.status !== "CONFIRMED") {
      return { status: "skipped", reason: "not_found_or_not_confirmed" };
    }
    const treasuryGlCode = suggestTreasuryGlAccountCode(col.account);
    const debitOverride = await resolveActiveGlAccountId(ctx.tenantId, col.companyId, treasuryGlCode);
    return ensureFromRule({
      ctx,
      companyId: col.companyId,
      projectId: col.projectId,
      eventType: "COLLECTION_CONFIRMED",
      sourceType: "COLLECTION",
      sourceId: col.id,
      entryDate: col.collectionDate.toISOString().slice(0, 10),
      description: `Asiento automático — cobranza (${col.id.slice(0, 8)}…)`,
      reference: `COB-${col.id.slice(0, 8)}`,
      currency: col.currency,
      amount: col.amount,
      lineDebit: "Debe — según regla contable",
      lineCredit: "Haber — según regla contable",
      debitAccountIdOverride: debitOverride,
    });
  } catch {
    return { status: "skipped", reason: "unexpected_error" };
  }
}

export async function ensureDraftJournalFromPayment(
  paymentId: string,
  ctx: ServiceContext,
): Promise<EnsureResult> {
  try {
    const pay = await prisma.payment.findFirst({
      where: { id: paymentId, tenantId: ctx.tenantId },
      include: { account: { select: { type: true, currency: true } } },
    });
    if (!pay || pay.status !== "CONFIRMED") {
      return { status: "skipped", reason: "not_found_or_not_confirmed" };
    }
    const treasuryGlCode = suggestTreasuryGlAccountCode(pay.account);
    const creditOverride = await resolveActiveGlAccountId(ctx.tenantId, pay.companyId, treasuryGlCode);
    return ensureFromRule({
      ctx,
      companyId: pay.companyId,
      projectId: pay.projectId,
      eventType: "PAYMENT_CONFIRMED",
      sourceType: "PAYMENT",
      sourceId: pay.id,
      entryDate: pay.paymentDate.toISOString().slice(0, 10),
      description: `Asiento automático — pago (${pay.id.slice(0, 8)}…)`,
      reference: `PAGO-${pay.id.slice(0, 8)}`,
      currency: pay.currency,
      amount: pay.amount,
      lineDebit: "Debe — según regla contable",
      lineCredit: "Haber — según regla contable",
      creditAccountIdOverride: creditOverride,
    });
  } catch {
    return { status: "skipped", reason: "unexpected_error" };
  }
}

export async function ensureDraftJournalFromTreasuryMovement(
  accountMovementId: string,
  ctx: ServiceContext,
): Promise<EnsureResult> {
  try {
    const mov = await prisma.accountMovement.findFirst({
      where: { id: accountMovementId, tenantId: ctx.tenantId },
      include: { account: true },
    });
    // RECONCILED still needs a DRAFT journal when created via recon “crear movimiento”.
    if (!mov || (mov.status !== "CONFIRMED" && mov.status !== "RECONCILED")) {
      return { status: "skipped", reason: "not_found_or_not_confirmed" };
    }
    if (!treasuryMovementSupportsAccountingDraft({ type: mov.type, sourceType: mov.sourceType })) {
      return { status: "skipped", reason: "source_excluded_from_treasury_gl" };
    }
    const companyId = mov.companyId ?? mov.account.companyId ?? null;
    if (!companyId) {
      return { status: "skipped", reason: "missing_company" };
    }

    // Transfer journals need both legs for correct debit/credit GL overrides.
    if (mov.type === "TRANSFER_IN" || mov.type === "TRANSFER_OUT") {
      const transferId =
        mov.transferId
        ?? (mov.sourceType === "INTERNAL_TRANSFER" ? mov.sourceId : null);
      if (!transferId) return { status: "skipped", reason: "missing_transfer_id" };
      return ensureDraftJournalFromInternalTransfer(transferId, ctx);
    }

    let eventType: AccountingMappingEventType;
    let sourceType: JournalEntrySourceType;
    if (mov.type === "INFLOW") {
      eventType = "TREASURY_INFLOW";
      sourceType = "TREASURY_INFLOW";
    } else if (mov.type === "OUTFLOW") {
      eventType = "TREASURY_OUTFLOW";
      sourceType = "TREASURY_OUTFLOW";
    } else {
      return { status: "skipped", reason: "unsupported_movement_type" };
    }

    const treasuryGlCode = suggestTreasuryGlAccountCode({
      type: mov.account.type,
      currency: mov.account.currency,
    });
    const treasuryGlId = await resolveActiveGlAccountId(ctx.tenantId, companyId, treasuryGlCode);
    const debitOverride =
      mov.type === "INFLOW" ? treasuryGlId : undefined;
    const creditOverride =
      mov.type === "OUTFLOW" ? treasuryGlId : undefined;

    return ensureFromRule({
      ctx,
      companyId,
      projectId: null,
      eventType,
      sourceType,
      sourceId: mov.id,
      entryDate: mov.movementDate.toISOString().slice(0, 10),
      description: `Asiento automático — tesorería: ${mov.description.slice(0, 200)}`,
      reference: `MOV-${mov.id.slice(0, 8)}`,
      currency: mov.currency,
      amount: mov.amount,
      lineDebit: `Debe — ${mov.type}`,
      lineCredit: `Haber — ${mov.type}`,
      debitAccountIdOverride: debitOverride,
      creditAccountIdOverride: creditOverride,
    });
  } catch {
    return { status: "skipped", reason: "unexpected_error" };
  }
}

export async function ensureDraftJournalFromInternalTransfer(
  transferId: string,
  ctx: ServiceContext,
): Promise<EnsureResult> {
  try {
    const transfer = await prisma.internalTransfer.findFirst({
      where: { id: transferId, tenantId: ctx.tenantId },
    });
    if (!transfer || transfer.status !== "CONFIRMED") {
      return { status: "skipped", reason: "not_found_or_not_confirmed" };
    }
    // Legs store transferId === InternalTransfer.id. Also match sourceId for legacy rows
    // that used a separate random transferId pair key.
    const legs = await prisma.accountMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["CONFIRMED", "RECONCILED"] },
        OR: [
          { transferId: transfer.id },
          { sourceType: "INTERNAL_TRANSFER", sourceId: transfer.id },
        ],
      },
      include: { account: true },
      orderBy: { id: "asc" },
    });
    const outLeg = legs.find((l) => l.type === "TRANSFER_OUT") ?? legs[0];
    const inLeg = legs.find((l) => l.type === "TRANSFER_IN");
    if (!outLeg) return { status: "skipped", reason: "missing_movement_leg" };

    // Prefer destination (IN) for the base movement path; override both GL sides from legs.
    const primary = inLeg ?? outLeg;
    const companyId = primary.companyId ?? primary.account.companyId ?? null;
    if (!companyId) return { status: "skipped", reason: "missing_company" };

    const debitGl = inLeg
      ? await resolveActiveGlAccountId(
          ctx.tenantId,
          companyId,
          suggestTreasuryGlAccountCode({ type: inLeg.account.type, currency: inLeg.account.currency }),
        )
      : null;
    const creditGl = await resolveActiveGlAccountId(
      ctx.tenantId,
      companyId,
      suggestTreasuryGlAccountCode({ type: outLeg.account.type, currency: outLeg.account.currency }),
    );

    return ensureFromRule({
      ctx,
      companyId,
      projectId: null,
      eventType: "TREASURY_TRANSFER",
      sourceType: "INTERNAL_TRANSFER",
      sourceId: transfer.id,
      entryDate: primary.movementDate.toISOString().slice(0, 10),
      description: `Asiento automático — transferencia interna (${transfer.id.slice(0, 8)}…)`,
      reference: `TRF-${transfer.id.slice(0, 8)}`,
      currency: primary.currency,
      amount: primary.amount,
      lineDebit: "Debe — cuenta destino",
      lineCredit: "Haber — cuenta origen",
      debitAccountIdOverride: debitGl ?? undefined,
      creditAccountIdOverride: creditGl ?? undefined,
    });
  } catch {
    return { status: "skipped", reason: "unexpected_error" };
  }
}

export async function ensureDraftJournalFromSalesInvoice(
  salesInvoiceId: string,
  ctx: ServiceContext,
): Promise<EnsureResult> {
  try {
    const inv = await prisma.salesInvoice.findFirst({
      where: { id: salesInvoiceId, tenantId: ctx.tenantId },
    });
    if (!inv || inv.status !== "ISSUED") {
      return { status: "skipped", reason: "not_found_or_not_issued" };
    }

    const moduleOn = await isTenantModuleEnabled(ctx, "ACCOUNTING");
    if (!moduleOn) {
      await auditSkip(ctx, {
        companyId: inv.companyId,
        sourceType: "SALES_INVOICE",
        sourceId: inv.id,
        reason: "module_disabled",
      });
      return { status: "skipped", reason: "module_disabled" };
    }

    const existingId = await lookupNonCancelledJournalEntryIdBySource(ctx, {
      companyId: inv.companyId,
      sourceType: "SALES_INVOICE",
      sourceId: inv.id,
    });
    if (existingId) {
      const entry = await getJournalEntryByIdUnchecked(existingId, ctx.tenantId, inv.companyId);
      return { status: "existing", entry };
    }

    const rule = await findActiveMappingRule(ctx.tenantId, inv.companyId, "SALES_INVOICE_ISSUED");
    if (!rule) {
      await auditSkip(ctx, {
        companyId: inv.companyId,
        sourceType: "SALES_INVOICE",
        sourceId: inv.id,
        reason: "no_mapping_rule",
      });
      return { status: "skipped", reason: "no_mapping_rule" };
    }
    if (inv.totalAmount.lte(0)) {
      await auditSkip(ctx, {
        companyId: inv.companyId,
        sourceType: "SALES_INVOICE",
        sourceId: inv.id,
        reason: "non_positive_amount",
      });
      return { status: "skipped", reason: "non_positive_amount" };
    }

    const ivaDebitAccountId = await resolveActiveGlAccountId(
      ctx.tenantId,
      inv.companyId,
      COA_IVA_DEBIT_FISCAL,
    );
    const { input } = buildSalesInvoiceJournalInput({
      companyId: inv.companyId,
      projectId: inv.projectId,
      entryDate: inv.issueDate.toISOString().slice(0, 10),
      description: `Asiento automático — factura venta ${inv.number}`,
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
    return createDraftFromInput(ctx, inv.companyId, "SALES_INVOICE", inv.id, input);
  } catch {
    return { status: "skipped", reason: "unexpected_error" };
  }
}

export async function ensureDraftJournalFromSupplierInvoice(
  supplierInvoiceId: string,
  ctx: ServiceContext,
): Promise<EnsureResult> {
  try {
    const inv = await prisma.supplierInvoice.findFirst({
      where: { id: supplierInvoiceId, tenantId: ctx.tenantId },
    });
    if (!inv || inv.status !== "ISSUED") {
      return { status: "skipped", reason: "not_found_or_not_issued" };
    }

    const moduleOn = await isTenantModuleEnabled(ctx, "ACCOUNTING");
    if (!moduleOn) {
      await auditSkip(ctx, {
        companyId: inv.companyId,
        sourceType: "SUPPLIER_INVOICE",
        sourceId: inv.id,
        reason: "module_disabled",
      });
      return { status: "skipped", reason: "module_disabled" };
    }

    const existingId = await lookupNonCancelledJournalEntryIdBySource(ctx, {
      companyId: inv.companyId,
      sourceType: "SUPPLIER_INVOICE",
      sourceId: inv.id,
    });
    if (existingId) {
      const entry = await getJournalEntryByIdUnchecked(existingId, ctx.tenantId, inv.companyId);
      return { status: "existing", entry };
    }

    const rule = await findActiveMappingRule(ctx.tenantId, inv.companyId, "SUPPLIER_INVOICE_ISSUED");
    if (!rule) {
      await auditSkip(ctx, {
        companyId: inv.companyId,
        sourceType: "SUPPLIER_INVOICE",
        sourceId: inv.id,
        reason: "no_mapping_rule",
      });
      return { status: "skipped", reason: "no_mapping_rule" };
    }
    if (inv.totalAmount.lte(0)) {
      await auditSkip(ctx, {
        companyId: inv.companyId,
        sourceType: "SUPPLIER_INVOICE",
        sourceId: inv.id,
        reason: "non_positive_amount",
      });
      return { status: "skipped", reason: "non_positive_amount" };
    }

    const ivaCreditAccountId = await resolveActiveGlAccountId(
      ctx.tenantId,
      inv.companyId,
      COA_IVA_CREDIT_FISCAL,
    );
    const { input } = buildSupplierInvoiceJournalInput({
      companyId: inv.companyId,
      projectId: inv.projectId,
      entryDate: inv.issueDate.toISOString().slice(0, 10),
      description: `Asiento automático — factura proveedor ${inv.number}`,
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
    return createDraftFromInput(ctx, inv.companyId, "SUPPLIER_INVOICE", inv.id, input);
  } catch {
    return { status: "skipped", reason: "unexpected_error" };
  }
}
