import { Prisma, prisma } from "@bloqer/database";
import { canViewCompanyAp } from "../ap/ap-access";
import {
  aggregateCorporatePayableOperations,
  countCorporateDraftInvoices,
  fetchCorporatePayableSnapshotRows,
  type CorporatePayableSnapshotRow,
} from "../ap/corporate-ap-snapshot";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";

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

export function buildCompanyFinanceOperationsFromPayables(
  rows: CorporatePayableSnapshotRow[],
  draftInvoiceCount: number,
  recentCorporatePayments: CompanyRecentPaymentRow[],
): Omit<CompanyFinanceOperationsSummary, "visible" | "loadFailed" | "movimientosCorporateFilterHref"> {
  const ops = aggregateCorporatePayableOperations(rows);
  return {
    draftInvoiceCount,
    openPayableCount: ops.openPayableCount,
    openPayableBalancesByCurrency: ops.openPayableBalancesByCurrency,
    recentCorporatePayments,
  };
}

/**
 * Corporate AP operations (projectId null). Returns `visible: false` when AP module off or user lacks VIEW AP.
 */
export async function getCompanyFinanceOperationsSummary(
  ctx: ServiceContext,
  opts?: { payableRows?: CorporatePayableSnapshotRow[] },
): Promise<CompanyFinanceOperationsSummary> {
  const movimientosCorporateFilterHref =
    "/tesoreria/reportes/movimientos?sourceType=PAYMENT&type=OUTFLOW&corporateApPayments=true";

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("AP") || !canViewCompanyAp(ctx.roles)) {
    return { ...emptySummary(false, false), movimientosCorporateFilterHref };
  }

  try {
    await assertApTenantModule(ctx);

    const companyWhere = ctx.companyId ? { companyId: ctx.companyId } : {};

    const [payableRows, draftInvoiceCount, recentPayRows] = await Promise.all([
      opts?.payableRows ?? fetchCorporatePayableSnapshotRows(ctx),
      countCorporateDraftInvoices(ctx),
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

    const recentCorporatePayments: CompanyRecentPaymentRow[] = recentPayRows.map((r) => ({
      id: r.id,
      paymentDate: r.paymentDate.toISOString().slice(0, 10),
      amount: r.amount.toString(),
      currency: r.currency,
      supplierLabel: supplierLabel(r.supplierContact.legalName, r.supplierContact.fantasyName),
    }));

    const built = buildCompanyFinanceOperationsFromPayables(
      payableRows,
      draftInvoiceCount,
      recentCorporatePayments,
    );

    return {
      visible: true,
      loadFailed: false,
      movimientosCorporateFilterHref,
      ...built,
    };
  } catch {
    return { ...emptySummary(true, true), movimientosCorporateFilterHref };
  }
}
