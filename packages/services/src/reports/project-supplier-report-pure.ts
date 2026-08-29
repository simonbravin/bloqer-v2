import { Prisma } from "@bloqer/database";
import { isPositiveMoneyDecimal, serializeMoneyDecimal } from "../finance/money-decimal";
import { computeCostExposureLayers } from "../cost-control/cost-exposure";

export const PROJECT_SUPPLIER_LEADER_LIMIT = 5;

const ZERO = new Prisma.Decimal(0);

export type ProjectSupplierSourcePo = {
  id: string;
  supplierContactId: string;
  supplierName: string;
  status: string;
  issueDate: Date;
  lineSubtotal: Prisma.Decimal;
};

export type ProjectSupplierSourceInvoice = {
  id: string;
  supplierContactId: string;
  supplierName: string;
  issueDate: Date;
  netAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  purchaseOrderId: string | null;
};

export type ProjectSupplierSourcePayable = {
  supplierContactId: string;
  supplierName: string;
  balanceDue: Prisma.Decimal;
  overdueAmount: Prisma.Decimal;
};

export type ProjectSupplierSourceReceipt = {
  supplierContactId: string;
  supplierName: string;
  receiptDate: Date;
};

export type ProjectSupplierReportRow = {
  supplierContactId: string;
  supplierName: string;
  poCount: number;
  openPoCount: number;
  invoiceCount: number;
  receiptCount: number;
  committedCost: string;
  accruedCost: string;
  paidCost: string;
  openCommitted: string;
  expectedExposure: string;
  payableBalance: string;
  overduePayable: string;
  shareOfExposurePct: string | null;
  lastActivityDate: string | null;
};

export type ProjectSupplierLeaderRow = {
  supplierContactId: string;
  supplierName: string;
  value: string;
  count: number;
  sharePct: string | null;
};

export type ProjectSupplierReportTotals = {
  supplierCount: number;
  poCount: number;
  invoiceCount: number;
  receiptCount: number;
  committedCost: string;
  accruedCost: string;
  paidCost: string;
  openCommitted: string;
  expectedExposure: string;
  payableBalance: string;
  overduePayable: string;
  top1SharePct: string | null;
  top3SharePct: string | null;
  avgPoAmount: string | null;
};

export type ProjectSupplierReportBuilt = {
  rows: ProjectSupplierReportRow[];
  totals: ProjectSupplierReportTotals;
  leadersByAmount: ProjectSupplierLeaderRow[];
  leadersByOrders: ProjectSupplierLeaderRow[];
  leadersByPayable: ProjectSupplierLeaderRow[];
};

type Acc = {
  supplierName: string;
  poIds: Set<string>;
  openPoIds: Set<string>;
  invoiceIds: Set<string>;
  receiptCount: number;
  committed: Prisma.Decimal;
  accrued: Prisma.Decimal;
  accruedLinked: Prisma.Decimal;
  paid: Prisma.Decimal;
  payableBalance: Prisma.Decimal;
  overduePayable: Prisma.Decimal;
  lastActivity: Date | null;
};

function emptyAcc(supplierName: string): Acc {
  return {
    supplierName,
    poIds: new Set(),
    openPoIds: new Set(),
    invoiceIds: new Set(),
    receiptCount: 0,
    committed: ZERO,
    accrued: ZERO,
    accruedLinked: ZERO,
    paid: ZERO,
    payableBalance: ZERO,
    overduePayable: ZERO,
    lastActivity: null,
  };
}

function touch(acc: Acc, name: string, date?: Date | null) {
  if (name) acc.supplierName = name;
  if (date && (!acc.lastActivity || date > acc.lastActivity)) acc.lastActivity = date;
}

function pctOf(part: Prisma.Decimal, total: Prisma.Decimal): string | null {
  if (total.isZero()) return null;
  return part.div(total).times(100).toFixed(2);
}

function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function compareMoneyDesc(a: string, b: string): number {
  return new Prisma.Decimal(b).comparedTo(new Prisma.Decimal(a));
}

export function isOpenPurchaseOrderStatus(status: string): boolean {
  return status === "CONFIRMED" || status === "PARTIALLY_RECEIVED";
}

export function buildProjectSupplierReport(input: {
  purchaseOrders: ProjectSupplierSourcePo[];
  invoices: ProjectSupplierSourceInvoice[];
  payables: ProjectSupplierSourcePayable[];
  receipts: ProjectSupplierSourceReceipt[];
}): ProjectSupplierReportBuilt {
  const byId = new Map<string, Acc>();

  function accFor(id: string, name: string): Acc {
    const existing = byId.get(id);
    if (existing) return existing;
    const created = emptyAcc(name);
    byId.set(id, created);
    return created;
  }

  for (const po of input.purchaseOrders) {
    const acc = accFor(po.supplierContactId, po.supplierName);
    touch(acc, po.supplierName, po.issueDate);
    acc.poIds.add(po.id);
    if (isOpenPurchaseOrderStatus(po.status)) acc.openPoIds.add(po.id);
    acc.committed = acc.committed.add(po.lineSubtotal);
  }

  for (const inv of input.invoices) {
    const acc = accFor(inv.supplierContactId, inv.supplierName);
    touch(acc, inv.supplierName, inv.issueDate);
    acc.invoiceIds.add(inv.id);
    acc.accrued = acc.accrued.add(inv.netAmount);
    acc.paid = acc.paid.add(inv.paidAmount);
    if (inv.purchaseOrderId) acc.accruedLinked = acc.accruedLinked.add(inv.netAmount);
  }

  for (const rec of input.receipts) {
    const acc = accFor(rec.supplierContactId, rec.supplierName);
    touch(acc, rec.supplierName, rec.receiptDate);
    acc.receiptCount += 1;
  }

  for (const pay of input.payables) {
    const acc = accFor(pay.supplierContactId, pay.supplierName);
    touch(acc, pay.supplierName, null);
    acc.payableBalance = acc.payableBalance.add(pay.balanceDue);
    acc.overduePayable = acc.overduePayable.add(pay.overdueAmount);
  }

  let totalCommitted = ZERO;
  let totalAccrued = ZERO;
  let totalPaid = ZERO;
  let totalOpen = ZERO;
  let totalExposure = ZERO;
  let totalPayable = ZERO;
  let totalOverdue = ZERO;
  let totalPos = 0;
  let totalInvoices = 0;
  let totalReceipts = 0;

  const intermediate = [...byId.entries()].map(([supplierContactId, acc]) => {
    const { openCommitted, expectedCostExposure } = computeCostExposureLayers({
      committed: acc.committed,
      accrued: acc.accrued,
      accruedLinked: acc.accruedLinked,
    });
    totalCommitted = totalCommitted.add(acc.committed);
    totalAccrued = totalAccrued.add(acc.accrued);
    totalPaid = totalPaid.add(acc.paid);
    totalOpen = totalOpen.add(openCommitted);
    totalExposure = totalExposure.add(expectedCostExposure);
    totalPayable = totalPayable.add(acc.payableBalance);
    totalOverdue = totalOverdue.add(acc.overduePayable);
    totalPos += acc.poIds.size;
    totalInvoices += acc.invoiceIds.size;
    totalReceipts += acc.receiptCount;
    return {
      supplierContactId,
      acc,
      openCommitted,
      expectedCostExposure,
    };
  });

  const rows: ProjectSupplierReportRow[] = intermediate
    .map(({ supplierContactId, acc, openCommitted, expectedCostExposure }) => ({
      supplierContactId,
      supplierName: acc.supplierName,
      poCount: acc.poIds.size,
      openPoCount: acc.openPoIds.size,
      invoiceCount: acc.invoiceIds.size,
      receiptCount: acc.receiptCount,
      committedCost: serializeMoneyDecimal(acc.committed),
      accruedCost: serializeMoneyDecimal(acc.accrued),
      paidCost: serializeMoneyDecimal(acc.paid),
      openCommitted: serializeMoneyDecimal(openCommitted),
      expectedExposure: serializeMoneyDecimal(expectedCostExposure),
      payableBalance: serializeMoneyDecimal(acc.payableBalance),
      overduePayable: serializeMoneyDecimal(acc.overduePayable),
      shareOfExposurePct: pctOf(expectedCostExposure, totalExposure),
      lastActivityDate: toIsoDate(acc.lastActivity),
    }))
    .sort((a, b) => {
      const exp = compareMoneyDesc(a.expectedExposure, b.expectedExposure);
      if (exp !== 0) return exp;
      const pos = b.poCount - a.poCount;
      if (pos !== 0) return pos;
      return a.supplierName.localeCompare(b.supplierName, "es");
    });

  const leadersByAmount: ProjectSupplierLeaderRow[] = rows
    .filter((r) => isPositiveMoneyDecimal(r.expectedExposure))
    .slice(0, PROJECT_SUPPLIER_LEADER_LIMIT)
    .map((r) => ({
      supplierContactId: r.supplierContactId,
      supplierName: r.supplierName,
      value: r.expectedExposure,
      count: r.poCount,
      sharePct: r.shareOfExposurePct,
    }));

  const leadersByOrders: ProjectSupplierLeaderRow[] = [...rows]
    .filter((r) => r.poCount > 0)
    .sort((a, b) => {
      const n = b.poCount - a.poCount;
      if (n !== 0) return n;
      return compareMoneyDesc(a.committedCost, b.committedCost);
    })
    .slice(0, PROJECT_SUPPLIER_LEADER_LIMIT)
    .map((r) => ({
      supplierContactId: r.supplierContactId,
      supplierName: r.supplierName,
      value: String(r.poCount),
      count: r.poCount,
      sharePct: pctOf(new Prisma.Decimal(r.poCount), new Prisma.Decimal(totalPos)),
    }));

  const leadersByPayable: ProjectSupplierLeaderRow[] = [...rows]
    .filter((r) => isPositiveMoneyDecimal(r.payableBalance))
    .sort((a, b) => compareMoneyDesc(a.payableBalance, b.payableBalance))
    .slice(0, PROJECT_SUPPLIER_LEADER_LIMIT)
    .map((r) => ({
      supplierContactId: r.supplierContactId,
      supplierName: r.supplierName,
      value: r.payableBalance,
      count: r.invoiceCount,
      sharePct: pctOf(new Prisma.Decimal(r.payableBalance), totalPayable),
    }));

  const byExposure = [...intermediate].sort((a, b) =>
    b.expectedCostExposure.comparedTo(a.expectedCostExposure),
  );
  const top1 = byExposure[0]?.expectedCostExposure;
  const top3 = byExposure.slice(0, 3).reduce((s, n) => s.add(n.expectedCostExposure), ZERO);

  return {
    rows,
    totals: {
      supplierCount: rows.length,
      poCount: totalPos,
      invoiceCount: totalInvoices,
      receiptCount: totalReceipts,
      committedCost: serializeMoneyDecimal(totalCommitted),
      accruedCost: serializeMoneyDecimal(totalAccrued),
      paidCost: serializeMoneyDecimal(totalPaid),
      openCommitted: serializeMoneyDecimal(totalOpen),
      expectedExposure: serializeMoneyDecimal(totalExposure),
      payableBalance: serializeMoneyDecimal(totalPayable),
      overduePayable: serializeMoneyDecimal(totalOverdue),
      top1SharePct: top1 && !top1.isZero() ? pctOf(top1, totalExposure) : null,
      top3SharePct: intermediate.length === 0 || totalExposure.isZero() ? null : pctOf(top3, totalExposure),
      avgPoAmount: totalPos === 0 ? null : serializeMoneyDecimal(totalCommitted.div(totalPos)),
    },
    leadersByAmount,
    leadersByOrders,
    leadersByPayable,
  };
}
