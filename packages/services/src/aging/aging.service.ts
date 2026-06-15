import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { assertApTenantModule, assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { deriveObligationDisplayStatus, hasOpenObligationBalance, obligationDaysOverdue, parseObligationAsOfDate, startOfDayUtc } from "../finance/obligation-date";

const ZERO = new Prisma.Decimal(0);

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export type AgingFilters = {
  companyId?: string;
  projectId?: string;
  /** Finanzas empresa AP: solo obligaciones sin obra (`projectId` null). */
  corporateOnly?: boolean;
  contactId?: string;
  currency?: string;
  asOfDate?: string;
  includePaid?: boolean;
  bucket?: AgingBucket;
  search?: string;
};

/** Display label in aging rows when AP line has no project (es-AR product copy). */
export const AGING_AP_COMPANY_PROJECT_LABEL = "Empresa (general)";

export type AgingItem = {
  id: string;
  invoiceId: string;
  invoiceNumber: number;
  projectId: string | null;
  projectName: string;
  issueDate: string;
  dueDate: string;
  daysOverdue: number;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  status: string;
  bucket: AgingBucket;
  currency: string;
};

export type AgingRow = {
  contactId: string;
  contactName: string;
  currency: string;
  totalBalance: string;
  current: string;
  bucket1_30: string;
  bucket31_60: string;
  bucket61_90: string;
  bucket90Plus: string;
  items: AgingItem[];
};

export type AgingTotals = {
  current: string;
  bucket1_30: string;
  bucket31_60: string;
  bucket61_90: string;
  bucket90Plus: string;
  totalOverdue: string;
  totalBalance: string;
};

export type AgingReport = {
  asOfDate: string;
  totals: AgingTotals;
  byCurrency: Record<string, AgingTotals>;
  rows: AgingRow[];
};

// ─── Internal accumulator ─────────────────────────────────────────────────────

type BucketAcc = {
  current: Prisma.Decimal;
  b1_30: Prisma.Decimal;
  b31_60: Prisma.Decimal;
  b61_90: Prisma.Decimal;
  b90Plus: Prisma.Decimal;
};

function newAcc(): BucketAcc {
  return { current: ZERO, b1_30: ZERO, b31_60: ZERO, b61_90: ZERO, b90Plus: ZERO };
}

function addToBucket(acc: BucketAcc, bucket: AgingBucket, amount: Prisma.Decimal) {
  if (bucket === "current")  { acc.current  = acc.current.add(amount);  return; }
  if (bucket === "1_30")     { acc.b1_30    = acc.b1_30.add(amount);    return; }
  if (bucket === "31_60")    { acc.b31_60   = acc.b31_60.add(amount);   return; }
  if (bucket === "61_90")    { acc.b61_90   = acc.b61_90.add(amount);   return; }
  acc.b90Plus = acc.b90Plus.add(amount);
}

function serializeAcc(acc: BucketAcc): AgingTotals {
  const totalOverdue = acc.b1_30.add(acc.b31_60).add(acc.b61_90).add(acc.b90Plus);
  const totalBalance = acc.current.add(totalOverdue);
  return {
    current:     acc.current.toString(),
    bucket1_30:  acc.b1_30.toString(),
    bucket31_60: acc.b31_60.toString(),
    bucket61_90: acc.b61_90.toString(),
    bucket90Plus: acc.b90Plus.toString(),
    totalOverdue: totalOverdue.toString(),
    totalBalance: totalBalance.toString(),
  };
}

function rowBalance(acc: BucketAcc): string {
  return acc.current.add(acc.b1_30).add(acc.b31_60).add(acc.b61_90).add(acc.b90Plus).toString();
}

function getBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1_30";
  if (daysOverdue <= 60) return "31_60";
  if (daysOverdue <= 90) return "61_90";
  return "90_plus";
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function matchesSearch(q: string, contactName: string, invoiceNumber: number, projectName: string): boolean {
  const lower = q.toLowerCase();
  return (
    contactName.toLowerCase().includes(lower) ||
    String(invoiceNumber).includes(lower) ||
    projectName.toLowerCase().includes(lower)
  );
}

// ─── AR Aging ─────────────────────────────────────────────────────────────────

export async function getReceivableAgingReport(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<AgingReport> {
  await assertArTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "AR")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el aging de cuentas por cobrar");
  }

  const asOf = parseObligationAsOfDate(filters.asOfDate);

  const rows = await prisma.receivable.findMany({
    where: {
      tenantId: ctx.tenantId,
      status:   { notIn: filters.includePaid ? ["CANCELLED"] : ["CANCELLED", "PAID"] },
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.contactId ? { clientContactId:  filters.contactId } : {}),
      ...(filters.currency  ? { currency:         filters.currency  } : {}),
    },
    include: {
      clientContact: { select: { id: true, legalName: true, fantasyName: true } },
      salesInvoice:  { select: { id: true, number: true, issueDate: true } },
      project:       { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  type GroupEntry = { contactId: string; contactName: string; currency: string; acc: BucketAcc; items: AgingItem[] };
  const groupMap   = new Map<string, GroupEntry>();
  const globalAcc  = newAcc();
  const curMap     = new Map<string, BucketAcc>();

  for (const r of rows) {
    // balanceDue: source of truth is originalAmount - paidAmount (maintained by AR service)
    const balanceDue = r.originalAmount.minus(r.paidAmount);
    if (!filters.includePaid && !hasOpenObligationBalance(balanceDue)) continue;

    const contactName  = r.clientContact.fantasyName ?? r.clientContact.legalName;
    const invoiceNumber = r.salesInvoice.number;
    const projectName  = r.project.name;

    if (filters.search && !matchesSearch(filters.search, contactName, invoiceNumber, projectName)) continue;

    const dueDate = startOfDayUtc(new Date(r.dueDate));
    const daysOverdue = obligationDaysOverdue(dueDate, asOf);
    const bucket = getBucket(daysOverdue);

    if (filters.bucket && bucket !== filters.bucket) continue;

    const status = deriveObligationDisplayStatus(r.status, balanceDue, dueDate, asOf, r.paidAmount);

    const item: AgingItem = {
      id:             r.id,
      invoiceId:      r.salesInvoice.id,
      invoiceNumber,
      projectId:      r.projectId,
      projectName,
      issueDate:      toDateStr(new Date(r.salesInvoice.issueDate)),
      dueDate:        toDateStr(dueDate),
      daysOverdue,
      originalAmount: r.originalAmount.toString(),
      paidAmount:     r.paidAmount.toString(),
      balanceDue:     balanceDue.toString(),
      status,
      bucket,
      currency:       r.currency,
    };

    const key = `${r.clientContactId}::${r.currency}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { contactId: r.clientContactId, contactName, currency: r.currency, acc: newAcc(), items: [] });
    }
    const g = groupMap.get(key)!;
    g.items.push(item);
    addToBucket(g.acc, bucket, balanceDue);
    addToBucket(globalAcc, bucket, balanceDue);
    if (!curMap.has(r.currency)) curMap.set(r.currency, newAcc());
    addToBucket(curMap.get(r.currency)!, bucket, balanceDue);
  }

  return buildReport(toDateStr(asOf), globalAcc, curMap, groupMap);
}

// ─── AP Aging ─────────────────────────────────────────────────────────────────

export async function getPayableAgingReport(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<AgingReport> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el aging de cuentas por pagar");
  }

  const asOf = parseObligationAsOfDate(filters.asOfDate);

  const projectFilter = filters.corporateOnly
    ? { projectId: null as null }
    : filters.projectId
      ? { projectId: filters.projectId }
      : {};

  const rows = await prisma.payable.findMany({
    where: {
      tenantId: ctx.tenantId,
      status:   { notIn: filters.includePaid ? ["CANCELLED"] : ["CANCELLED", "PAID"] },
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...projectFilter,
      ...(filters.contactId ? { supplierContactId: filters.contactId } : {}),
      ...(filters.currency ? { currency: filters.currency } : {}),
    },
    include: {
      supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
      supplierInvoice: { select: { id: true, number: true, issueDate: true } },
      project:         { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  type GroupEntry = { contactId: string; contactName: string; currency: string; acc: BucketAcc; items: AgingItem[] };
  const groupMap  = new Map<string, GroupEntry>();
  const globalAcc = newAcc();
  const curMap    = new Map<string, BucketAcc>();

  for (const p of rows) {
    const balanceDue = p.originalAmount.minus(p.paidAmount);
    if (!filters.includePaid && !hasOpenObligationBalance(balanceDue)) continue;

    const contactName   = p.supplierContact.fantasyName ?? p.supplierContact.legalName;
    const invoiceNumber = p.supplierInvoice.number;
    const projectName   = p.project?.name ?? AGING_AP_COMPANY_PROJECT_LABEL;

    if (filters.search && !matchesSearch(filters.search, contactName, invoiceNumber, projectName)) continue;

    const dueDate = startOfDayUtc(new Date(p.dueDate));
    const daysOverdue = obligationDaysOverdue(dueDate, asOf);
    const bucket = getBucket(daysOverdue);

    if (filters.bucket && bucket !== filters.bucket) continue;

    const status = deriveObligationDisplayStatus(p.status, balanceDue, dueDate, asOf, p.paidAmount);

    const item: AgingItem = {
      id:             p.id,
      invoiceId:      p.supplierInvoice.id,
      invoiceNumber,
      projectId:      p.projectId,
      projectName,
      issueDate:      toDateStr(new Date(p.supplierInvoice.issueDate)),
      dueDate:        toDateStr(dueDate),
      daysOverdue,
      originalAmount: p.originalAmount.toString(),
      paidAmount:     p.paidAmount.toString(),
      balanceDue:     balanceDue.toString(),
      status,
      bucket,
      currency:       p.currency,
    };

    const key = `${p.supplierContactId}::${p.currency}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { contactId: p.supplierContactId, contactName, currency: p.currency, acc: newAcc(), items: [] });
    }
    const g = groupMap.get(key)!;
    g.items.push(item);
    addToBucket(g.acc, bucket, balanceDue);
    addToBucket(globalAcc, bucket, balanceDue);
    if (!curMap.has(p.currency)) curMap.set(p.currency, newAcc());
    addToBucket(curMap.get(p.currency)!, bucket, balanceDue);
  }

  return buildReport(toDateStr(asOf), globalAcc, curMap, groupMap);
}

// ─── Shared builder ───────────────────────────────────────────────────────────

function buildReport(
  asOfDate: string,
  globalAcc: BucketAcc,
  curMap: Map<string, BucketAcc>,
  groupMap: Map<string, { contactId: string; contactName: string; currency: string; acc: BucketAcc; items: AgingItem[] }>,
): AgingReport {
  const byCurrency: Record<string, AgingTotals> = {};
  for (const [cur, acc] of curMap.entries()) {
    byCurrency[cur] = serializeAcc(acc);
  }

  const rows: AgingRow[] = Array.from(groupMap.values()).map((g) => ({
    contactId:   g.contactId,
    contactName: g.contactName,
    currency:    g.currency,
    totalBalance: rowBalance(g.acc),
    current:      g.acc.current.toString(),
    bucket1_30:   g.acc.b1_30.toString(),
    bucket31_60:  g.acc.b31_60.toString(),
    bucket61_90:  g.acc.b61_90.toString(),
    bucket90Plus: g.acc.b90Plus.toString(),
    items:        g.items,
  }));

  return { asOfDate, totals: serializeAcc(globalAcc), byCurrency, rows };
}
