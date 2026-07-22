import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { RegisterArIncomeInput } from "@bloqer/validators";
import { auditAr } from "./ar-audit";
import { canEditCompanyAr } from "./ar-access";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { resolveObligationStoredStatus } from "../finance/obligation-stored-status";
import { effectiveObligationPaidAfterPayment } from "../finance/obligation-balance";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { buildFinancialHref } from "../finance/financial-trace.service";
import type { FinancialTraceLink, RegisterTransactionResult } from "../finance/register-transaction.types";
import { assertArTenantModule, assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { calcLine, recalcInvoiceTotals } from "./sales-invoice-calc.service";
import { toMoneyDecimal } from "../finance/money-decimal";
import { resolveCompanyIdForAr } from "./sales-invoice.service";

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  );
}

function salesInvoiceCode(number: number): string {
  return `FAC-${String(number).padStart(5, "0")}`;
}

type ArIncomeOutcome = {
  invoiceId: string;
  receivableId: string;
  number: number;
  companyId: string;
  collectionId?: string;
  movementId?: string;
  collectAccountId?: string;
};

function buildArIncomeTraceChain(outcome: ArIncomeOutcome): FinancialTraceLink[] {
  const chain: FinancialTraceLink[] = [
    {
      entityType: "SalesInvoice",
      entityId: outcome.invoiceId,
      code: salesInvoiceCode(outcome.number),
      href: buildFinancialHref("SalesInvoice", outcome.invoiceId),
    },
    {
      entityType: "Receivable",
      entityId: outcome.receivableId,
      href: buildFinancialHref("Receivable", outcome.receivableId),
    },
  ];
  if (outcome.collectionId && outcome.movementId && outcome.collectAccountId) {
    chain.push(
      {
        entityType: "Collection",
        entityId: outcome.collectionId,
        href: buildFinancialHref("Collection", outcome.collectionId),
      },
      {
        entityType: "AccountMovement",
        entityId: outcome.movementId,
        href: buildFinancialHref("AccountMovement", outcome.movementId, {
          accountId: outcome.collectAccountId,
        }),
      },
    );
  }
  return chain;
}

/**
 * Corporate AR composite flow (D-051 / Q-030 option 1).
 * Mirrors `registerApExpense`: SalesInvoice(projectId=null) → Receivable → optional Collection.
 */
export async function registerArIncome(
  input: RegisterArIncomeInput,
  ctx: ServiceContext,
): Promise<RegisterTransactionResult> {
  await assertArTenantModule(ctx);
  if (!canEditCompanyAr(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar ingresos / facturas de venta");
  }
  if (input.collectNow) {
    await assertTreasuryTenantModule(ctx);
    if (!can(ctx.roles, "EDIT", "TREASURY")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para registrar movimientos de tesorería");
    }
  }

  if (!ctx.companyId) {
    throw new ServiceError(
      "VALIDATION",
      "Selecciona una empresa activa para registrar una factura de venta corporativa",
    );
  }

  if (input.dueDate < input.issueDate) {
    throw new ServiceError("VALIDATION", "La fecha de vencimiento no puede ser anterior a la de emisión");
  }

  const contact = await prisma.contact.findUnique({
    where: { id: input.clientContactId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!contact || contact.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cliente no encontrado");
  }
  if (contact.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El cliente seleccionado no está activo");
  }

  const clientRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.clientContactId, role: "CLIENT" } },
  });
  if (!clientRole || clientRole.tenantId !== ctx.tenantId || clientRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de cliente activo");
  }

  const companyId = await resolveCompanyIdForAr(null, ctx);

  let outcome!: ArIncomeOutcome;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const maxNum = await tx.salesInvoice.aggregate({
          where: { tenantId: ctx.tenantId, companyId },
          _max: { number: true },
        });
        const number = (maxNum._max.number ?? 0) + 1;

        const created = await tx.salesInvoice.create({
          data: {
            tenantId: ctx.tenantId,
            companyId,
            projectId: null,
            clientContactId: input.clientContactId,
            certificationId: null,
            number,
            issueDate: new Date(input.issueDate),
            dueDate: new Date(input.dueDate),
            currency: input.currency ?? "ARS",
            notes: input.notes ?? null,
            internalNotes: input.internalNotes ?? null,
            externalInvoiceRef: input.externalInvoiceRef ?? null,
            createdBy: ctx.actorUserId,
            updatedBy: ctx.actorUserId,
          },
        });

        for (const line of input.lines) {
          const qty = new Prisma.Decimal(line.quantity);
          const price = new Prisma.Decimal(line.unitPrice);
          const rate = new Prisma.Decimal(line.taxRate ?? "0");
          const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
          await tx.salesInvoiceLine.create({
            data: {
              invoiceId: created.id,
              description: line.description,
              quantity: qty,
              unitPrice: price,
              taxRate: rate,
              lineSubtotal,
              lineTax,
              lineTotal,
              certificationLineId: null,
              sortOrder: line.sortOrder ?? 0,
            },
          });
        }

        await recalcInvoiceTotals(tx as never, created.id);
        const refreshed = await tx.salesInvoice.findUniqueOrThrow({ where: { id: created.id } });
        if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
          throw new ServiceError("CONFLICT", "El total de la factura debe ser mayor a 0");
        }

        const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);
        await tx.salesInvoice.update({
          where: { id: created.id },
          data: {
            status: "ISSUED",
            fxRate: fx.fxRate,
            amountArs: fx.amountArs,
            updatedBy: ctx.actorUserId,
          },
        });

        const receivable = await tx.receivable.create({
          data: {
            tenantId: refreshed.tenantId,
            companyId: refreshed.companyId,
            projectId: null,
            clientContactId: refreshed.clientContactId,
            salesInvoiceId: refreshed.id,
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

        let collectionId: string | undefined;
        let movementId: string | undefined;
        let collectAccountId: string | undefined;

        if (input.collectNow) {
          // D-053: collectFullBalance / omitted amount → stored invoice total.
          const collectAmount =
            input.collectNow.collectFullBalance || input.collectNow.amount == null
              ? refreshed.totalAmount
              : toMoneyDecimal(input.collectNow.amount);
          if (collectAmount.lessThanOrEqualTo(0)) {
            throw new ServiceError("VALIDATION", "El monto de cobro debe ser mayor a 0");
          }
          const balanceDue = receivable.originalAmount.minus(receivable.paidAmount);
          if (collectAmount.greaterThan(balanceDue)) {
            throw new ServiceError(
              "CONFLICT",
              `El monto (${collectAmount}) supera el saldo pendiente (${balanceDue}).`,
            );
          }

          const account = await tx.treasuryAccount.findUnique({ where: { id: input.collectNow.accountId } });
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
          if (account.currency !== receivable.currency) {
            throw new ServiceError(
              "CONFLICT",
              `Moneda de cuenta (${account.currency}) no coincide con la del saldo (${receivable.currency}).`,
            );
          }

          const collectionFx = computeDocumentFxAmounts(receivable.currency, collectAmount);
          const collection = await tx.collection.create({
            data: {
              tenantId: ctx.tenantId,
              companyId: ctx.companyId ?? account.companyId ?? receivable.companyId,
              projectId: null,
              clientContactId: receivable.clientContactId,
              receivableId: receivable.id,
              salesInvoiceId: receivable.salesInvoiceId,
              accountId: input.collectNow.accountId,
              collectionDate: new Date(input.collectNow.collectionDate),
              currency: receivable.currency,
              amount: collectAmount,
              fxRate: collectionFx.fxRate,
              amountArs: collectionFx.amountArs,
              notes: input.collectNow.notes ?? null,
              status: "CONFIRMED",
              createdBy: ctx.actorUserId,
              updatedBy: ctx.actorUserId,
            },
          });
          collectionId = collection.id;
          collectAccountId = input.collectNow.accountId;

          const movement = await tx.accountMovement.create({
            data: {
              tenantId: ctx.tenantId,
              companyId: account.companyId ?? ctx.companyId ?? receivable.companyId,
              projectId: null,
              accountId: input.collectNow.accountId,
              movementDate: new Date(input.collectNow.collectionDate),
              type: "INFLOW",
              sourceType: "COLLECTION",
              sourceId: collection.id,
              currency: receivable.currency,
              amount: collectAmount,
              description: `Cobranza factura ${salesInvoiceCode(number)}`,
              status: "CONFIRMED",
              createdBy: ctx.actorUserId,
            },
          });
          movementId = movement.id;

          const newPaid = effectiveObligationPaidAfterPayment(
            receivable.originalAmount,
            receivable.paidAmount.plus(collectAmount),
          );
          const newStatus = resolveObligationStoredStatus(newPaid, receivable.originalAmount);
          const receivableUpdate = await tx.receivable.updateMany({
            where: {
              id: receivable.id,
              paidAmount: receivable.paidAmount,
              status: { in: [...ACTIVE_OBLIGATION_STATUSES] },
            },
            data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
          });
          assertOptimisticRowUpdate(
            receivableUpdate.count,
            "El saldo cambió mientras registrabas la cobranza. Revisá el saldo pendiente e intentá de nuevo.",
          );
        }

        await auditAr(
          ctx,
          "sales_invoice.registered_income",
          "SalesInvoice",
          refreshed.id,
          { companyId, projectId: null },
          { after: { number, issued: true, collected: Boolean(input.collectNow), corporate: true }, tx },
        );

        if (collectionId) {
          const collectAmount =
            input.collectNow!.collectFullBalance || input.collectNow!.amount == null
              ? refreshed.totalAmount
              : toMoneyDecimal(input.collectNow!.amount);
          await auditAr(
            ctx,
            "collection.confirmed",
            "Collection",
            collectionId,
            { companyId, projectId: null },
            {
              after: {
                number,
                receivableId: receivable.id,
                amount: collectAmount.toString(),
              },
              tx,
            },
          );
        }

        return {
          invoiceId: refreshed.id,
          receivableId: receivable.id,
          number,
          companyId,
          collectionId,
          movementId,
          collectAccountId,
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

  const traceChain = buildArIncomeTraceChain(outcome);

  // Always land on the receivable detail (corporate collection detail page does not exist).
  const href = buildFinancialHref("Receivable", outcome.receivableId);
  return {
    kind: "AR_INCOME",
    primaryEntityId: outcome.collectionId ?? outcome.receivableId,
    primaryEntityType: outcome.collectionId ? "Collection" : "Receivable",
    href,
    traceChain,
  };
}
