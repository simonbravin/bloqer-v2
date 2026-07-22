import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { RegisterApExpenseInput } from "@bloqer/validators";
import { auditAp } from "./ap-audit";
import { applyPaymentToPayable } from "./apply-payment-to-payable";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { buildFinancialHref } from "../finance/financial-trace.service";
import type { FinancialTraceLink, RegisterTransactionResult } from "../finance/register-transaction.types";
import { assertApTenantModule, assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { ServiceContext, ServiceError } from "../types";
import { calcLine, recalcSupplierInvoiceTotals } from "./supplier-invoice-calc.service";
import { toMoneyDecimal } from "../finance/money-decimal";
import {
  assertPurchaseOrderLinkableForAp,
  resolveCompanyIdForAp,
} from "./supplier-invoice.service";
import { getCompanyProcurementSettingsForProject } from "../procurement/company-procurement-settings.service";
import { assertProjectApDirectSpendAllowed } from "../procurement/procurement-policy.service";

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  );
}

function invoiceCode(number: number): string {
  return `FP-${String(number).padStart(5, "0")}`;
}

type ApExpenseOutcome = {
  invoiceId: string;
  payableId: string;
  number: number;
  companyId: string;
  projectId: string | null;
  paymentId?: string;
  movementId?: string;
  payAccountId?: string;
};

function buildApExpenseTraceChain(outcome: ApExpenseOutcome): FinancialTraceLink[] {
  const chain: FinancialTraceLink[] = [
    {
      entityType: "SupplierInvoice",
      entityId: outcome.invoiceId,
      code: invoiceCode(outcome.number),
      href: buildFinancialHref("SupplierInvoice", outcome.invoiceId, {
        projectId: outcome.projectId,
      }),
    },
    {
      entityType: "Payable",
      entityId: outcome.payableId,
      href: buildFinancialHref("Payable", outcome.payableId, {
        projectId: outcome.projectId,
      }),
    },
  ];
  if (outcome.paymentId && outcome.movementId && outcome.payAccountId) {
    chain.push(
      {
        entityType: "Payment",
        entityId: outcome.paymentId,
        href: buildFinancialHref("Payment", outcome.paymentId, {
          projectId: outcome.projectId,
        }),
      },
      {
        entityType: "AccountMovement",
        entityId: outcome.movementId,
        href: buildFinancialHref("AccountMovement", outcome.movementId, {
          accountId: outcome.payAccountId,
        }),
      },
    );
  }
  return chain;
}

/**
 * Composite AP expense: ISSUED SupplierInvoice + Payable (+ optional Payment).
 * `projectId` null = company-level; set = project workspace ([D-052]).
 */
export async function registerApExpense(
  input: RegisterApExpenseInput,
  ctx: ServiceContext,
): Promise<RegisterTransactionResult> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar gastos");
  }
  if (input.payNow) {
    await assertTreasuryTenantModule(ctx);
    if (!can(ctx.roles, "EDIT", "TREASURY")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para registrar movimientos de tesorería");
    }
  }

  const projectId = input.projectId ?? null;
  if (projectId) {
    await assertProjectAllowsOperationalMutation(projectId, ctx.tenantId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { tenantId: true, companyId: true },
    });
    if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
    if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (ctx.companyId && project.companyId && project.companyId !== ctx.companyId) {
      throw new ServiceError("FORBIDDEN", "El proyecto no pertenece a la empresa activa");
    }
  }

  if (input.purchaseOrderId && !projectId) {
    throw new ServiceError("VALIDATION", "Una OC solo puede vincularse a una factura de proyecto");
  }

  if (input.purchaseOrderId && projectId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
    if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
    if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    assertPurchaseOrderLinkableForAp(po.status);
    if (po.projectId !== projectId) {
      throw new ServiceError("CONFLICT", "La orden de compra no pertenece al mismo proyecto");
    }
    if (po.supplierContactId !== input.supplierContactId) {
      throw new ServiceError("CONFLICT", "La orden de compra corresponde a un proveedor diferente");
    }
    if (po.currency !== (input.currency ?? "ARS")) {
      throw new ServiceError("CONFLICT", "La moneda de la factura no coincide con la de la orden de compra");
    }
  }

  const supplierRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
  });
  if (!supplierRole || supplierRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de proveedor activo");
  }

  let invoiceTotal = new Prisma.Decimal(0);
  for (const line of input.lines) {
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(line.taxRate ?? "0");
    invoiceTotal = invoiceTotal.plus(calcLine(qty, price, rate).lineTotal);
  }
  const estimatedFx = computeDocumentFxAmounts(
    input.currency ?? "ARS",
    invoiceTotal,
    input.fxRate ? new Prisma.Decimal(input.fxRate) : null,
  );
  if (projectId && !input.purchaseOrderId) {
    const settings = await getCompanyProcurementSettingsForProject(projectId, ctx);
    assertProjectApDirectSpendAllowed(settings, estimatedFx.amountArs, ctx);
  }

  const companyId = await resolveCompanyIdForAp(projectId, ctx);

  let outcome!: ApExpenseOutcome;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const maxNum = await tx.supplierInvoice.aggregate({
          where: { tenantId: ctx.tenantId, companyId },
          _max: { number: true },
        });
        const number = (maxNum._max.number ?? 0) + 1;

        const created = await tx.supplierInvoice.create({
          data: {
            tenantId: ctx.tenantId,
            companyId,
            projectId,
            supplierContactId: input.supplierContactId,
            number,
            issueDate: new Date(input.issueDate),
            dueDate: new Date(input.dueDate),
            currency: input.currency ?? "ARS",
            fxRate: input.fxRate ? new Prisma.Decimal(input.fxRate) : new Prisma.Decimal(1),
            notes: input.notes ?? null,
            internalNotes: input.internalNotes ?? null,
            purchaseOrderId: input.purchaseOrderId ?? null,
            createdBy: ctx.actorUserId,
            updatedBy: ctx.actorUserId,
          },
        });

        for (const line of input.lines) {
          const qty = new Prisma.Decimal(line.quantity);
          const price = new Prisma.Decimal(line.unitPrice);
          const rate = new Prisma.Decimal(line.taxRate ?? "0");
          const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
          await tx.supplierInvoiceLine.create({
            data: {
              invoiceId: created.id,
              description: line.description,
              quantity: qty,
              unitPrice: price,
              taxRate: rate,
              lineSubtotal,
              lineTax,
              lineTotal,
              sortOrder: line.sortOrder ?? 0,
            },
          });
        }

        await recalcSupplierInvoiceTotals(tx, created.id);
        const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: created.id } });
        if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
          throw new ServiceError("CONFLICT", "El total de la factura debe ser mayor a 0");
        }

        const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);
        await tx.supplierInvoice.update({
          where: { id: created.id },
          data: {
            status: "ISSUED",
            fxRate: fx.fxRate,
            amountArs: fx.amountArs,
            updatedBy: ctx.actorUserId,
          },
        });

        const payable = await tx.payable.create({
          data: {
            tenantId: refreshed.tenantId,
            companyId: refreshed.companyId,
            projectId,
            supplierContactId: refreshed.supplierContactId,
            supplierInvoiceId: refreshed.id,
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

        let paymentId: string | undefined;
        let movementId: string | undefined;
        let payAccountId: string | undefined;

        if (input.payNow) {
          // D-053: payFullBalance / omitted amount → stored invoice total.
          const payAmount =
            input.payNow.payFullBalance || input.payNow.amount == null
              ? refreshed.totalAmount
              : toMoneyDecimal(input.payNow.amount);

          const applied = await applyPaymentToPayable(
            tx,
            {
              payable,
              accountId: input.payNow.accountId,
              amount: payAmount,
              paymentDate: input.payNow.paymentDate,
              notes: input.payNow.notes ?? null,
            },
            ctx,
          );
          paymentId = applied.paymentId;
          movementId = applied.movementId;
          payAccountId = applied.accountId;
        }

        await auditAp(
          ctx,
          "supplier_invoice.registered_expense",
          "SupplierInvoice",
          refreshed.id,
          { companyId, projectId },
          { after: { number, issued: true, paid: Boolean(input.payNow) }, tx },
        );

        if (paymentId) {
          await auditAp(
            ctx,
            "payment.confirmed",
            "Payment",
            paymentId,
            { companyId, projectId },
            { after: { number, payableId: payable.id }, tx },
          );
        }

        return {
          invoiceId: refreshed.id,
          payableId: payable.id,
          number,
          companyId,
          projectId,
          paymentId,
          movementId,
          payAccountId,
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

  const traceChain = buildApExpenseTraceChain(outcome);

  if (outcome.paymentId) {
    const href = buildFinancialHref("Payment", outcome.paymentId, {
      projectId: outcome.projectId,
    });
    return {
      kind: "AP_EXPENSE",
      primaryEntityId: outcome.paymentId,
      primaryEntityType: "Payment",
      href,
      traceChain,
    };
  }

  const href = buildFinancialHref("SupplierInvoice", outcome.invoiceId, {
    projectId: outcome.projectId,
  });
  return {
    kind: "AP_EXPENSE",
    primaryEntityId: outcome.invoiceId,
    primaryEntityType: "SupplierInvoice",
    href,
    traceChain,
  };
}
