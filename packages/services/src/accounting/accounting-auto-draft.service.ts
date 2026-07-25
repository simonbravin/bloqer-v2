import { Prisma, prisma } from "@bloqer/database";
import type { JournalEntrySourceType, AccountingMappingEventType } from "@bloqer/database";
import { roundMoney } from "@bloqer/utils";
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

type EnsureResult =
  | { status: "created" | "existing"; entry: JournalEntryView }
  | { status: "skipped"; reason: string };

function moneyAmountString(d: Prisma.Decimal): string {
  return roundMoney(d.toString());
}

function buildTwoLineDraftInput(params: {
  companyId: string;
  projectId: string | null;
  entryDate: string;
  description: string;
  reference: string | null;
  currency: string;
  amountStr: string;
  debitAccountId: string;
  creditAccountId: string;
  lineDescriptionDebit: string;
  lineDescriptionCredit: string;
  sourceType: JournalEntrySourceType;
  sourceId: string;
}): CreateJournalEntryInput {
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
        debit: params.amountStr,
        credit: "0",
        currency: params.currency,
      },
      {
        accountId: params.creditAccountId,
        projectId: params.projectId,
        description: params.lineDescriptionCredit,
        debit: "0",
        credit: params.amountStr,
        currency: params.currency,
      },
    ],
  };
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

  try {
    const input = buildTwoLineDraftInput({
      companyId: params.companyId,
      projectId: params.projectId,
      entryDate: params.entryDate,
      description: params.description,
      reference: params.reference,
      currency: params.currency,
      amountStr: moneyAmountString(params.amount),
      debitAccountId: rule.debitAccountId,
      creditAccountId: rule.creditAccountId,
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

/** Best-effort: never throws to caller. Call only after operational commit. */
export async function ensureDraftJournalFromCollection(
  collectionId: string,
  ctx: ServiceContext,
): Promise<EnsureResult> {
  try {
    const col = await prisma.collection.findFirst({
      where: { id: collectionId, tenantId: ctx.tenantId },
    });
    if (!col || col.status !== "CONFIRMED") {
      return { status: "skipped", reason: "not_found_or_not_confirmed" };
    }
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
    });
    if (!pay || pay.status !== "CONFIRMED") {
      return { status: "skipped", reason: "not_found_or_not_confirmed" };
    }
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
    if (!mov || mov.status !== "CONFIRMED") {
      return { status: "skipped", reason: "not_found_or_not_confirmed" };
    }
    if (!treasuryMovementSupportsAccountingDraft({ type: mov.type, sourceType: mov.sourceType })) {
      return { status: "skipped", reason: "source_excluded_from_treasury_gl" };
    }
    const companyId = mov.companyId ?? mov.account.companyId ?? null;
    if (!companyId) {
      return { status: "skipped", reason: "missing_company" };
    }

    let eventType: AccountingMappingEventType;
    let sourceType: JournalEntrySourceType;
    if (mov.type === "INFLOW") {
      eventType = "TREASURY_INFLOW";
      sourceType = "TREASURY_INFLOW";
    } else if (mov.type === "OUTFLOW") {
      eventType = "TREASURY_OUTFLOW";
      sourceType = "TREASURY_OUTFLOW";
    } else if (mov.type === "TRANSFER_IN" || mov.type === "TRANSFER_OUT") {
      eventType = "TREASURY_TRANSFER";
      sourceType = "INTERNAL_TRANSFER";
    } else {
      return { status: "skipped", reason: "unsupported_movement_type" };
    }

    const sourceId = mov.transferId ?? mov.id;
    return ensureFromRule({
      ctx,
      companyId,
      projectId: null,
      eventType,
      sourceType,
      sourceId,
      entryDate: mov.movementDate.toISOString().slice(0, 10),
      description: `Asiento automático — tesorería: ${mov.description.slice(0, 200)}`,
      reference: `MOV-${mov.id.slice(0, 8)}`,
      currency: mov.currency,
      amount: mov.amount,
      lineDebit: `Debe — ${mov.type}`,
      lineCredit: `Haber — ${mov.type}`,
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
    const leg = await prisma.accountMovement.findFirst({
      where: {
        tenantId: ctx.tenantId,
        transferId: transfer.id,
        status: "CONFIRMED",
      },
      include: { account: true },
      orderBy: { id: "asc" },
    });
    if (!leg) return { status: "skipped", reason: "missing_movement_leg" };
    return ensureDraftJournalFromTreasuryMovement(leg.id, ctx);
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
    return ensureFromRule({
      ctx,
      companyId: inv.companyId,
      projectId: inv.projectId,
      eventType: "SALES_INVOICE_ISSUED",
      sourceType: "SALES_INVOICE",
      sourceId: inv.id,
      entryDate: inv.issueDate.toISOString().slice(0, 10),
      description: `Asiento automático — factura venta ${inv.number}`,
      reference: String(inv.number),
      currency: inv.currency,
      amount: inv.totalAmount,
      lineDebit: "Debe — clientes",
      lineCredit: "Haber — ingresos",
    });
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
    return ensureFromRule({
      ctx,
      companyId: inv.companyId,
      projectId: inv.projectId,
      eventType: "SUPPLIER_INVOICE_ISSUED",
      sourceType: "SUPPLIER_INVOICE",
      sourceId: inv.id,
      entryDate: inv.issueDate.toISOString().slice(0, 10),
      description: `Asiento automático — factura proveedor ${inv.number}`,
      reference: String(inv.number),
      currency: inv.currency,
      amount: inv.totalAmount,
      lineDebit: "Debe — gasto/costo",
      lineCredit: "Haber — proveedores",
    });
  } catch {
    return { status: "skipped", reason: "unexpected_error" };
  }
}
