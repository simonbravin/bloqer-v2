import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";

const ZERO = new Prisma.Decimal(0);

export type CompanyOpenPayableBalanceRow = {
  currency: string;
  openLineCount: number;
  totalBalanceDue: string;
};

export type CompanyRecentPaymentRow = {
  id: string;
  paymentDate: string;
  amount: string;
  currency: string;
  supplierLabel: string;
};

/**
 * Read-only snapshot for corporate AP (gastos generales): counts and open balances **per currency only**.
 * Phase 17E — no cross-currency totals.
 */
export type CompanyFinanceOperationsSummary = {
  visible: boolean;
  loadFailed: boolean;
  draftInvoiceCount: number;
  openPayableCount: number;
  openPayableBalancesByCurrency: CompanyOpenPayableBalanceRow[];
  recentCorporatePayments: CompanyRecentPaymentRow[];
  /** Pre-built query for tesorería movimientos (PAYMENT + corporate AP). */
  movimientosCorporateFilterHref: string;
};

function supplierLabel(legalName: string | null, fantasyName: string | null): string {
  return (fantasyName ?? legalName ?? "Proveedor").trim();
}

function emptySummary(visible: boolean, loadFailed: boolean): CompanyFinanceOperationsSummary {
  const movimientosCorporateFilterHref =
    "/tesoreria/reportes/movimientos?sourceType=PAYMENT&type=OUTFLOW&corporateApPayments=true";
  return {
    visible,
    loadFailed,
    draftInvoiceCount: 0,
    openPayableCount: 0,
    openPayableBalancesByCurrency: [],
    recentCorporatePayments: [],
    movimientosCorporateFilterHref,
  };
}

/**
 * Corporate AP operations (projectId null). Returns `visible: false` when AP module off or user lacks VIEW AP.
 */
export async function getCompanyFinanceOperationsSummary(
  ctx: ServiceContext,
): Promise<CompanyFinanceOperationsSummary> {
  const movimientosCorporateFilterHref =
    "/tesoreria/reportes/movimientos?sourceType=PAYMENT&type=OUTFLOW&corporateApPayments=true";

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("AP") || !can(ctx.roles, "VIEW", "AP")) {
    return { ...emptySummary(false, false), movimientosCorporateFilterHref };
  }

  try {
    await assertApTenantModule(ctx);

    const companyWhere = ctx.companyId ? { companyId: ctx.companyId } : {};

    const [draftInvoiceCount, openPayableRows, recentPayRows] = await Promise.all([
      prisma.supplierInvoice.count({
        where: {
          tenantId: ctx.tenantId,
          projectId: null,
          status: "DRAFT",
          ...companyWhere,
        },
      }),
      prisma.payable.findMany({
        where: {
          tenantId: ctx.tenantId,
          projectId: null,
          status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
          ...companyWhere,
        },
        select: {
          originalAmount: true,
          paidAmount: true,
          currency: true,
        },
      }),
      prisma.payment.findMany({
        where: {
          tenantId: ctx.tenantId,
          projectId: null,
          status: "CONFIRMED",
          ...companyWhere,
        },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          currency: true,
          supplierContact: { select: { legalName: true, fantasyName: true } },
        },
      }),
    ]);

    const byCur = new Map<string, { count: number; sum: Prisma.Decimal }>();
    let openPayableCount = 0;
    for (const p of openPayableRows) {
      const bal = p.originalAmount.minus(p.paidAmount);
      if (bal.lte(0)) continue;
      openPayableCount += 1;
      const cur = p.currency;
      const agg = byCur.get(cur) ?? { count: 0, sum: ZERO };
      agg.count += 1;
      agg.sum = agg.sum.add(bal);
      byCur.set(cur, agg);
    }

    const openPayableBalancesByCurrency = [...byCur.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, agg]) => ({
        currency,
        openLineCount: agg.count,
        totalBalanceDue: agg.sum.toString(),
      }));

    const recentCorporatePayments: CompanyRecentPaymentRow[] = recentPayRows.map((r) => ({
      id: r.id,
      paymentDate: r.paymentDate.toISOString().slice(0, 10),
      amount: r.amount.toString(),
      currency: r.currency,
      supplierLabel: supplierLabel(r.supplierContact.legalName, r.supplierContact.fantasyName),
    }));

    return {
      visible: true,
      loadFailed: false,
      draftInvoiceCount,
      openPayableCount,
      openPayableBalancesByCurrency,
      recentCorporatePayments,
      movimientosCorporateFilterHref,
    };
  } catch {
    return { ...emptySummary(true, true), movimientosCorporateFilterHref };
  }
}
