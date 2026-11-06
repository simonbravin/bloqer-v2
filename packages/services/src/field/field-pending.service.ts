import { Prisma, prisma } from "@bloqer/database";
import { productCalendarDateUtc } from "@bloqer/utils";
import {
  computePendingToInvoiceAmount,
  poLineReceivedAmount,
  poLinesWithUncoveredInvoiceQuantity,
} from "../ap/supplier-invoice-from-po-pure";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { resolveUserDisplayNames } from "../user/resolve-user-display-names";
import type { ServiceContext } from "../types";
import { companyScopeFilter } from "../company-scope";
import {
  FIELD_PENDING_GROUP_BY_SOURCE,
  fieldPendingComprasStageOrder,
  fieldPendingSourcesForActor,
  resolveFieldPendingProjectFilter,
  type FieldPendingGroup,
  type FieldPendingSource,
} from "./field-pending-access";
import { getCompanyProcurementSettings } from "../procurement/company-procurement-settings.service";
import { willApproveAutoConfirmPo } from "../procurement/purchase-order-workflow.service";
import {
  projectIdWhereForScope,
  requireProjectAccess,
  resolveAccessibleProjectScope,
} from "../security/access";

const INBOX_LIMIT = 80;
const INVOICE_COVERAGE_BATCH_SIZE = 200;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between a Date column and the product calendar “today”. Negative → not yet due (0). */
function daysOverdueFromDate(reference: Date | null | undefined): number {
  if (!reference) return 0;
  const today = productCalendarDateUtc().getTime();
  const ref = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()),
  ).getTime();
  return Math.max(0, Math.floor((today - ref) / DAY_MS));
}

export type FieldPendingItem = {
  entityType: FieldPendingSource;
  entityId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  group: FieldPendingGroup;
  typeLabel: string;
  title: string;
  description: string | null;
  statusLabel: string;
  /** Primary CTA on the card (Cotizar / Aprobar / Confirmar al proveedor / Recibir / Registrar factura). */
  actionLabel: string;
  amount: string | null;
  currency: string | null;
  requestedByName: string | null;
  occurredAt: Date;
  href: string;
  priority: "normal" | "stale";
  /** Days past a date field relevant to the item ([D-097]). 0 = on time. */
  overdueDays: number;
};

export type FieldPendingCounts = {
  total: number;
  purchaseRequests: number;
  purchaseOrders: number;
  purchaseOrdersToConfirm: number;
  purchaseOrdersToReceive: number;
  /** OC parcial/totalmente recibida con cobertura de facturación pendiente ([D-097], [D-108]). */
  purchaseOrdersToInvoice: number;
  jobsiteLogs: number;
  certifications: number;
  subcontractCertifications: number;
};

export type FieldPendingList = {
  items: FieldPendingItem[];
  counts: FieldPendingCounts;
  queryMs: number;
};

export type FieldPendingFilters = {
  projectId?: string;
  group?: FieldPendingGroup;
};

function stalePriority(occurredAt: Date): "normal" | "stale" {
  return Date.now() - occurredAt.getTime() >= STALE_MS ? "stale" : "normal";
}

function emptyCounts(): FieldPendingCounts {
  return {
    total: 0,
    purchaseRequests: 0,
    purchaseOrders: 0,
    purchaseOrdersToConfirm: 0,
    purchaseOrdersToReceive: 0,
    purchaseOrdersToInvoice: 0,
    jobsiteLogs: 0,
    certifications: 0,
    subcontractCertifications: 0,
  };
}

const invoiceCoverageSelect = {
  id: true, tenantId: true, companyId: true, projectId: true, supplierContactId: true, currency: true,
  lines: { select: { id: true, quantity: true, receivedQuantity: true, lineTotal: true } },
  supplierInvoices: {
    where: { status: "ISSUED", documentKind: "INVOICE" },
    select: {
      tenantId: true, companyId: true, projectId: true, supplierContactId: true, currency: true,
      subtotal: true, taxAmount: true,
      lines: { select: { purchaseOrderLineId: true, quantity: true } },
    },
  },
} as const satisfies Prisma.PurchaseOrderSelect;

type InvoiceCoverageOrder = Prisma.PurchaseOrderGetPayload<{ select: typeof invoiceCoverageSelect }>;
type InvoiceOrderScope = Pick<InvoiceCoverageOrder, "tenantId" | "companyId" | "projectId" | "supplierContactId" | "currency">;

function invoiceMatchesOrder(order: InvoiceOrderScope, invoice: Omit<InvoiceOrderScope, "projectId"> & { projectId: string | null }) {
  return invoice.tenantId === order.tenantId && invoice.companyId === order.companyId &&
    invoice.projectId === order.projectId && invoice.supplierContactId === order.supplierContactId &&
    invoice.currency === order.currency;
}

function hasUninvoicedReceipts(order: InvoiceCoverageOrder): boolean {
  const coveredQtyByLine = new Map<string, Prisma.Decimal>();
  const lineIds = new Set(order.lines.map((line) => line.id));
  let coveredAmount = new Prisma.Decimal(0);
  let hasUnlinkedLines = false;
  for (const invoice of order.supplierInvoices) {
    if (!invoiceMatchesOrder(order, invoice)) return false;
    coveredAmount = coveredAmount.plus(invoice.subtotal).plus(invoice.taxAmount);
    for (const { purchaseOrderLineId, quantity } of invoice.lines) {
      if (!purchaseOrderLineId) {
        hasUnlinkedLines = true;
        continue;
      }
      if (!lineIds.has(purchaseOrderLineId)) return false;
      coveredQtyByLine.set(purchaseOrderLineId, quantity.plus(coveredQtyByLine.get(purchaseOrderLineId) ?? 0));
    }
  }
  const hasUncoveredQuantity = poLinesWithUncoveredInvoiceQuantity(order.lines, coveredQtyByLine).length > 0;
  if (!hasUncoveredQuantity || !hasUnlinkedLines) return hasUncoveredQuantity;

  const receivedAmount = order.lines.reduce((sum, line) => sum.plus(poLineReceivedAmount({
    orderQuantity: line.quantity, receivedQuantity: line.receivedQuantity, lineTotal: serializeMoneyDecimal(line.lineTotal),
  })), new Prisma.Decimal(0));
  return serializeMoneyDecimal(computePendingToInvoiceAmount(receivedAmount, coveredAmount)) !== "0.00";
}

/** Apply the same coverage to the badge and the first page of eligible orders. */
async function readPendingPurchaseOrderInvoices(where: Prisma.PurchaseOrderWhereInput, list: boolean) {
  const orderBy = [{ createdAt: "asc" }, { id: "asc" }] as const;
  let after: string | undefined;
  let count = 0;
  const eligible = new Map<string, boolean>();
  for (;;) {
    const orders: InvoiceCoverageOrder[] = await prisma.purchaseOrder.findMany({
      where,
      orderBy: [...orderBy],
      take: INVOICE_COVERAGE_BATCH_SIZE,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      select: invoiceCoverageSelect,
    });
    for (const order of orders) {
      if (!hasUninvoicedReceipts(order)) continue;
      count++;
      if (list && eligible.size < INBOX_LIMIT) eligible.set(order.id, order.supplierInvoices.length > 0);
    }
    if (orders.length < INVOICE_COVERAGE_BATCH_SIZE) break;
    after = orders.at(-1)!.id;
  }
  const orders = eligible.size ? await prisma.purchaseOrder.findMany({
    where: { ...where, id: { in: [...eligible.keys()] } },
    orderBy: [...orderBy],
    select: {
      id: true, number: true, totalAmount: true, currency: true, createdAt: true, status: true,
      createdBy: true, originRequestedByUserId: true, projectId: true, companyId: true,
      tenantId: true, supplierContactId: true,
      project: { select: { code: true, name: true } },
      supplierContact: { select: { fantasyName: true, legalName: true } },
      receipts: {
        where: { status: "CONFIRMED" }, orderBy: { receiptDate: "asc" },
        select: { receiptDate: true, tenantId: true, companyId: true, projectId: true },
      },
      supplierInvoices: {
        where: { status: "DRAFT", documentKind: "INVOICE" }, orderBy: { createdAt: "asc" },
        select: { id: true, tenantId: true, companyId: true, projectId: true, supplierContactId: true, currency: true },
      },
    },
  }) : [];
  const items = orders.map((order) => ({
    ...order,
    firstReceiptDate: order.receipts.find((receipt) => receipt.tenantId === order.tenantId &&
      receipt.companyId === order.companyId && receipt.projectId === order.projectId)?.receiptDate ?? null,
    draftId: order.supplierInvoices.find((invoice) => invoiceMatchesOrder(order, invoice))?.id ?? null,
    hasIssuedInvoice: eligible.get(order.id) === true,
  }));
  return { count, items };
}

export async function getMyFieldPendingCounts(
  ctx: ServiceContext,
  filters?: { projectId?: string },
): Promise<FieldPendingCounts> {
  const list = await getMyFieldPendingItems(ctx, { ...filters, countsOnly: true });
  return list.counts;
}

export async function getMyFieldPendingItems(
  ctx: ServiceContext,
  filters?: FieldPendingFilters & { countsOnly?: boolean },
): Promise<FieldPendingList> {
  const started = Date.now();
  const gate = await getTenantModuleGate(ctx);
  const sources = fieldPendingSourcesForActor(ctx.roles, gate);
  const projectFilter = resolveFieldPendingProjectFilter(filters?.projectId);
  if (projectFilter) {
    await requireProjectAccess(projectFilter, ctx);
  }
  const scope = await resolveAccessibleProjectScope(ctx);
  const groupFilter = filters?.group;
  const countsOnly = filters?.countsOnly === true;

  const activeSources = groupFilter
    ? sources.filter((s) => FIELD_PENDING_GROUP_BY_SOURCE[s] === groupFilter)
    : sources;

  const projectScopeWhere = projectFilter ? { projectId: projectFilter } : projectIdWhereForScope(scope);
  const projectWhere = {
    ...projectScopeWhere,
    // These operational sources have companyId NOT NULL; Certification is nullable below.
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
  };
  const certificationProjectWhere = {
    ...projectScopeWhere,
    ...companyScopeFilter(ctx),
    // Legacy certifications can have no company of their own and inherit a budget's scope.
    budget: { tenantId: ctx.tenantId, ...projectScopeWhere, ...companyScopeFilter(ctx) },
  };
  const counts = emptyCounts();
  const items: FieldPendingItem[] = [];

  const runPr = activeSources.includes("PURCHASE_REQUEST");
  const runPo = activeSources.includes("PURCHASE_ORDER");
  const runPoConfirm = activeSources.includes("PURCHASE_ORDER_CONFIRM");
  const runPoReceipt = activeSources.includes("PURCHASE_ORDER_RECEIPT");
  const runPoInvoice = activeSources.includes("PURCHASE_ORDER_INVOICE");
  const runLog = activeSources.includes("JOBSITE_LOG");
  const runCert = activeSources.includes("CERTIFICATION");
  const runSubCert = activeSources.includes("SUBCONTRACT_CERTIFICATION");

  const countPr = sources.includes("PURCHASE_REQUEST");
  const countPo = sources.includes("PURCHASE_ORDER");
  const countPoConfirm = sources.includes("PURCHASE_ORDER_CONFIRM");
  const countPoReceipt = sources.includes("PURCHASE_ORDER_RECEIPT");
  const countPoInvoice = sources.includes("PURCHASE_ORDER_INVOICE");
  const countLog = sources.includes("JOBSITE_LOG");
  const countCert = sources.includes("CERTIFICATION");
  const countSubCert = sources.includes("SUBCONTRACT_CERTIFICATION");

  const poReceiptStatuses = ["CONFIRMED", "PARTIALLY_RECEIVED"] as Array<
    "CONFIRMED" | "PARTIALLY_RECEIVED"
  >;
  const poReceiptWhere = {
    tenantId: ctx.tenantId,
    status: { in: poReceiptStatuses },
    ...projectWhere,
  };

  const prListPromise =
    runPr && !countsOnly
      ? prisma.purchaseRequest.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: "SUBMITTED",
            ...projectWhere,
            // Align with count: exclude fully awarded SCs ([BR-PUR-024]).
            lines: { some: { awardedPurchaseOrderId: null } },
          },
          orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
          take: INBOX_LIMIT * 2,
          select: {
            id: true,
            number: true,
            createdAt: true,
            submittedAt: true,
            neededByDate: true,
            requestedByUserId: true,
            createdBy: true,
            projectId: true,
            project: { select: { code: true, name: true } },
            quotes: {
              where: { status: { in: ["RECEIVED", "SELECTED"] } },
              select: { id: true },
              take: 1,
            },
            lines: { select: { awardedPurchaseOrderId: true } },
          },
        })
      : Promise.resolve(null);

  const poListPromise =
    runPo && !countsOnly
      ? prisma.purchaseOrder.findMany({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            currency: true,
            fxRate: true,
            totalAmountArs: true,
            createdAt: true,
            createdBy: true,
            originRequestedByUserId: true,
            companyId: true,
            projectId: true,
            project: { select: { code: true, name: true } },
            supplierContact: { select: { fantasyName: true, legalName: true } },
            lines: { select: { varianceTier: true } },
          },
        })
      : Promise.resolve(null);

  const poConfirmListPromise =
    runPoConfirm && !countsOnly
      ? prisma.purchaseOrder.findMany({
          where: { tenantId: ctx.tenantId, status: "APPROVED", ...projectWhere },
          // FIFO by approval time (not OC creation) so recently-approved old drafts don't starve.
          orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            currency: true,
            createdAt: true,
            approvedAt: true,
            createdBy: true,
            originRequestedByUserId: true,
            projectId: true,
            project: { select: { code: true, name: true } },
            supplierContact: { select: { fantasyName: true, legalName: true } },
          },
        })
      : Promise.resolve(null);

  const poReceiptListPromise =
    runPoReceipt && !countsOnly
      ? prisma.purchaseOrder.findMany({
          where: poReceiptWhere,
          orderBy: [{ confirmedAt: "asc" }, { createdAt: "asc" }],
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            currency: true,
            createdAt: true,
            confirmedAt: true,
            expectedDeliveryDate: true,
            status: true,
            createdBy: true,
            originRequestedByUserId: true,
            projectId: true,
            project: { select: { code: true, name: true } },
            supplierContact: { select: { fantasyName: true, legalName: true } },
          },
        })
      : Promise.resolve(null);

  const logListPromise =
    runLog && !countsOnly
      ? prisma.jobsiteLog.findMany({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            title: true,
            logDate: true,
            createdAt: true,
            createdBy: true,
            projectId: true,
            project: { select: { code: true, name: true } },
          },
        })
      : Promise.resolve(null);

  const certListPromise =
    runCert && !countsOnly
      ? prisma.certification.findMany({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...certificationProjectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            totalAmount: true,
            createdAt: true,
            createdBy: true,
            issueDate: true,
            projectId: true,
            project: { select: { code: true, name: true } },
            budget: { select: { currency: true } },
          },
        })
      : Promise.resolve(null);

  const subCertListPromise =
    runSubCert && !countsOnly
      ? prisma.subcontractCertification.findMany({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...projectWhere },
          orderBy: { createdAt: "asc" },
          take: INBOX_LIMIT,
          select: {
            id: true,
            number: true,
            createdAt: true,
            createdBy: true,
            projectId: true,
            subcontractId: true,
            project: { select: { code: true, name: true } },
            subcontractorContact: { select: { fantasyName: true, legalName: true } },
          },
        })
      : Promise.resolve(null);

  const poInvoiceWhere: Prisma.PurchaseOrderWhereInput = {
    tenantId: ctx.tenantId,
    status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] },
    receipts: { some: { tenantId: ctx.tenantId, status: "CONFIRMED", ...projectWhere } },
    lines: { some: { receivedQuantity: { gt: 0 }, lineTotal: { gt: 0 } } },
    ...projectWhere,
  };

  const [
    prs,
    pos,
    posConfirm,
    posReceipt,
    pendingInvoiceOrders,
    logs,
    certs,
    subCerts,
    prCount,
    poCount,
    poConfirmCount,
    poReceiptCount,
    logCount,
    certCount,
    subCertCount,
  ] = await Promise.all([
    prListPromise,
    poListPromise,
    poConfirmListPromise,
    poReceiptListPromise,
    countPoInvoice
      ? readPendingPurchaseOrderInvoices(poInvoiceWhere, runPoInvoice && !countsOnly)
      : Promise.resolve({ count: 0, items: [] }),
    logListPromise,
    certListPromise,
    subCertListPromise,
    countPr
      ? prisma.purchaseRequest.count({
          where: {
            tenantId: ctx.tenantId,
            status: "SUBMITTED",
            ...projectWhere,
            // Exclude fully awarded SCs still in SUBMITTED race windows ([BR-PUR-024]).
            lines: { some: { awardedPurchaseOrderId: null } },
          },
        })
      : Promise.resolve(0),
    countPo
      ? prisma.purchaseOrder.count({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
        })
      : Promise.resolve(0),
    countPoConfirm
      ? prisma.purchaseOrder.count({
          where: { tenantId: ctx.tenantId, status: "APPROVED", ...projectWhere },
        })
      : Promise.resolve(0),
    countPoReceipt
      ? prisma.purchaseOrder.count({ where: poReceiptWhere })
      : Promise.resolve(0),
    countLog
      ? prisma.jobsiteLog.count({
          where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...projectWhere },
        })
      : Promise.resolve(0),
    countCert
      ? prisma.certification.count({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...certificationProjectWhere },
        })
      : Promise.resolve(0),
    countSubCert
      ? prisma.subcontractCertification.count({
          where: { tenantId: ctx.tenantId, status: "ISSUED", ...projectWhere },
        })
      : Promise.resolve(0),
  ]);

  counts.purchaseRequests = prCount;
  counts.purchaseOrders = poCount;
  counts.purchaseOrdersToConfirm = poConfirmCount;
  counts.purchaseOrdersToReceive = poReceiptCount;
  counts.purchaseOrdersToInvoice = pendingInvoiceOrders.count;
  counts.jobsiteLogs = logCount;
  counts.certifications = certCount;
  counts.subcontractCertifications = subCertCount;
  counts.total =
    counts.purchaseRequests +
    counts.purchaseOrders +
    counts.purchaseOrdersToConfirm +
    counts.purchaseOrdersToReceive +
    counts.purchaseOrdersToInvoice +
    counts.jobsiteLogs +
    counts.certifications +
    counts.subcontractCertifications;

  if (countsOnly) {
    return { items: [], counts, queryMs: Date.now() - started };
  }
  const posInvoice = pendingInvoiceOrders.items;

  const actorIds: Array<string | null> = [];
  if (Array.isArray(prs)) {
    for (const row of prs) actorIds.push(row.requestedByUserId, row.createdBy);
  }
  if (Array.isArray(pos)) {
    for (const row of pos) actorIds.push(row.originRequestedByUserId, row.createdBy);
  }
  if (Array.isArray(posConfirm)) {
    for (const row of posConfirm) actorIds.push(row.originRequestedByUserId, row.createdBy);
  }
  if (Array.isArray(posReceipt)) {
    for (const row of posReceipt) actorIds.push(row.originRequestedByUserId, row.createdBy);
  }
  for (const row of posInvoice) actorIds.push(row.originRequestedByUserId, row.createdBy);
  if (Array.isArray(logs)) {
    for (const row of logs) actorIds.push(row.createdBy);
  }
  if (Array.isArray(certs)) {
    for (const row of certs) actorIds.push(row.createdBy);
  }
  if (Array.isArray(subCerts)) {
    for (const row of subCerts) actorIds.push(row.createdBy);
  }
  const names = await resolveUserDisplayNames(actorIds);

  if (Array.isArray(prs)) {
    const openPrs = prs
      .filter((row) => {
        const total = row.lines.length;
        const awarded = row.lines.filter((l) => l.awardedPurchaseOrderId != null).length;
        // Fully awarded SC leave pendientes — follow-through is on the N OCs ([BR-PUR-024]).
        return !(total > 0 && awarded === total);
      })
      .slice(0, INBOX_LIMIT);

    for (const row of openPrs) {
      const occurredAt = row.submittedAt ?? row.createdAt;
      const hasQuotes = row.quotes.length > 0;
      const awarded = row.lines.filter((l) => l.awardedPurchaseOrderId != null).length;
      const partial = awarded > 0;
      const overdueDays = daysOverdueFromDate(row.neededByDate);
      items.push({
        entityType: "PURCHASE_REQUEST",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "compras",
        typeLabel: "Solicitud de compra",
        title: `SC-${String(row.number).padStart(3, "0")}`,
        description: null,
        statusLabel: partial
          ? "Adjudicar resto"
          : hasQuotes
            ? "Elegir cotización"
            : "Espera cotizaciones",
        actionLabel: partial
          ? "Adjudicar resto"
          : hasQuotes
            ? "Elegir cotización"
            : "Cotizar",
        amount: null,
        currency: null,
        requestedByName:
          (row.requestedByUserId && names.get(row.requestedByUserId)) ||
          (row.createdBy && names.get(row.createdBy)) ||
          null,
        occurredAt,
        href: `/proyectos/${row.projectId}/solicitudes-compra/${row.id}`,
        priority: stalePriority(occurredAt),
        overdueDays,
      });
    }
  }

  if (Array.isArray(pos)) {
    const settingsByCompany = new Map<
      string,
      Awaited<ReturnType<typeof getCompanyProcurementSettings>>
    >();
    for (const row of pos) {
      if (!settingsByCompany.has(row.companyId)) {
        settingsByCompany.set(
          row.companyId,
          await getCompanyProcurementSettings(row.companyId, ctx),
        );
      }
      const settings = settingsByCompany.get(row.companyId)!;
      const willAutoConfirm = willApproveAutoConfirmPo(settings, {
        totalAmount: row.totalAmount,
        currency: row.currency,
        fxRate: row.fxRate,
        totalAmountArs: row.totalAmountArs,
        lines: row.lines,
      });
      const requestedBy =
        (row.originRequestedByUserId && names.get(row.originRequestedByUserId)) ||
        (row.createdBy && names.get(row.createdBy)) ||
        null;
      items.push({
        entityType: "PURCHASE_ORDER",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "compras",
        typeLabel: "Orden de compra",
        title: `OC-${String(row.number).padStart(3, "0")}`,
        description: row.supplierContact.fantasyName ?? row.supplierContact.legalName,
        statusLabel: willAutoConfirm
          ? "Pendiente de aprobación (compromete al aprobar)"
          : "Pendiente de aprobación",
        actionLabel: willAutoConfirm ? "Aprobar y comprometer" : "Aprobar",
        amount: serializeMoneyDecimal(row.totalAmount),
        currency: row.currency,
        requestedByName: requestedBy,
        occurredAt: row.createdAt,
        href: `/proyectos/${row.projectId}/ordenes-compra/${row.id}`,
        priority: stalePriority(row.createdAt),
        overdueDays: 0,
      });
    }
  }

  if (Array.isArray(posConfirm)) {
    for (const row of posConfirm) {
      const occurredAt = row.approvedAt ?? row.createdAt;
      const requestedBy =
        (row.originRequestedByUserId && names.get(row.originRequestedByUserId)) ||
        (row.createdBy && names.get(row.createdBy)) ||
        null;
      items.push({
        entityType: "PURCHASE_ORDER_CONFIRM",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "compras",
        typeLabel: "Orden de compra",
        title: `OC-${String(row.number).padStart(3, "0")}`,
        description: `${row.supplierContact.fantasyName ?? row.supplierContact.legalName} · Confirmar reserva $ (Comprometido)`,
        statusLabel: "Pendiente de confirmar",
        actionLabel: "Confirmar al proveedor",
        amount: serializeMoneyDecimal(row.totalAmount),
        currency: row.currency,
        requestedByName: requestedBy,
        occurredAt,
        href: `/proyectos/${row.projectId}/ordenes-compra/${row.id}`,
        priority: stalePriority(occurredAt),
        overdueDays: 0,
      });
    }
  }

  if (Array.isArray(posReceipt)) {
    for (const row of posReceipt) {
      const occurredAt = row.confirmedAt ?? row.createdAt;
      const requestedBy =
        (row.originRequestedByUserId && names.get(row.originRequestedByUserId)) ||
        (row.createdBy && names.get(row.createdBy)) ||
        null;
      const overdueDays = daysOverdueFromDate(row.expectedDeliveryDate);
      items.push({
        entityType: "PURCHASE_ORDER_RECEIPT",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "compras",
        typeLabel: "Orden de compra",
        title: `OC-${String(row.number).padStart(3, "0")}`,
        description: row.supplierContact.fantasyName ?? row.supplierContact.legalName,
        statusLabel:
          row.status === "PARTIALLY_RECEIVED"
            ? "Recepción parcial"
            : "Pendiente de recepción",
        actionLabel: "Recibir",
        amount: serializeMoneyDecimal(row.totalAmount),
        currency: row.currency,
        requestedByName: requestedBy,
        occurredAt,
        // Deep-link to the receive form (CTA says Recibir, not Revisar).
        href: `/proyectos/${row.projectId}/ordenes-compra/${row.id}/recepciones/nueva`,
        priority: stalePriority(occurredAt),
        overdueDays,
      });
    }
  }

  for (const row of posInvoice) {
    const firstReceiptDate = row.firstReceiptDate;
    const occurredAt = firstReceiptDate ?? row.createdAt;
    const requestedBy =
      (row.originRequestedByUserId && names.get(row.originRequestedByUserId)) ||
      (row.createdBy && names.get(row.createdBy)) ||
      null;
    const overdueDays = daysOverdueFromDate(firstReceiptDate);
    const draftId = row.draftId;
    items.push({
      entityType: "PURCHASE_ORDER_INVOICE",
      entityId: row.id,
      projectId: row.projectId,
      projectCode: row.project.code,
      projectName: row.project.name,
      group: "compras",
      typeLabel: "Orden de compra",
      title: `OC-${String(row.number).padStart(3, "0")}`,
      description: row.supplierContact.fantasyName ?? row.supplierContact.legalName,
      statusLabel: draftId
        ? "Borrador de factura pendiente de emitir"
        : row.hasIssuedInvoice
          ? "Recepción con facturación pendiente"
          : row.status === "PARTIALLY_RECEIVED"
            ? "Recibida parcialmente sin factura"
            : "Recibida sin factura",
      actionLabel: draftId ? "Completar factura" : "Registrar factura",
      amount: serializeMoneyDecimal(row.totalAmount),
      currency: row.currency,
      requestedByName: requestedBy,
      occurredAt,
      href: draftId
        ? `/proyectos/${row.projectId}/facturas-proveedor/${draftId}`
        : `/proyectos/${row.projectId}/ordenes-compra/${row.id}?siguiente=facturar#facturar`,
      priority: stalePriority(occurredAt),
      overdueDays,
    });
  }

  if (Array.isArray(logs)) {
    for (const row of logs) {
      items.push({
        entityType: "JOBSITE_LOG",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "obra",
        typeLabel: "Parte de obra",
        title: row.title?.trim() || "Parte de obra",
        description: null,
        statusLabel: "Pendiente de aprobación",
        actionLabel: "Revisar",
        amount: null,
        currency: null,
        requestedByName: (row.createdBy && names.get(row.createdBy)) || null,
        occurredAt: row.createdAt,
        href: `/proyectos/${row.projectId}/libro-obra/${row.id}`,
        priority: stalePriority(row.createdAt),
        overdueDays: 0,
      });
    }
  }

  if (Array.isArray(certs)) {
    for (const row of certs) {
      items.push({
        entityType: "CERTIFICATION",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "certificaciones",
        typeLabel: "Certificación cliente",
        title: `CERT-${String(row.number).padStart(3, "0")}`,
        description: null,
        statusLabel: "Pendiente de aprobación",
        actionLabel: "Revisar",
        amount: serializeMoneyDecimal(row.totalAmount),
        currency: row.budget.currency,
        requestedByName: (row.createdBy && names.get(row.createdBy)) || null,
        occurredAt: row.issueDate ?? row.createdAt,
        href: `/proyectos/${row.projectId}/certificaciones/${row.id}`,
        priority: stalePriority(row.issueDate ?? row.createdAt),
        overdueDays: 0,
      });
    }
  }

  if (Array.isArray(subCerts)) {
    for (const row of subCerts) {
      items.push({
        entityType: "SUBCONTRACT_CERTIFICATION",
        entityId: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        group: "certificaciones",
        typeLabel: "Certificación de subcontrato",
        title: `CERT-SC-${String(row.number).padStart(3, "0")}`,
        description:
          row.subcontractorContact.fantasyName ?? row.subcontractorContact.legalName,
        statusLabel: "Pendiente de aprobación",
        actionLabel: "Revisar",
        amount: null,
        currency: null,
        requestedByName: (row.createdBy && names.get(row.createdBy)) || null,
        occurredAt: row.createdAt,
        href: `/proyectos/${row.projectId}/subcontratos/${row.subcontractId}/certificaciones/${row.id}`,
        priority: stalePriority(row.createdAt),
        overdueDays: 0,
      });
    }
  }

  // Portero: within Compras filter, pipeline stage then overdue then FIFO.
  // Other filters / Todos: overdue-first ([D-097]) then FIFO (do not sink obra/cert).
  items.sort((a, b) => {
    if (groupFilter === "compras") {
      const stageA = fieldPendingComprasStageOrder(a.entityType);
      const stageB = fieldPendingComprasStageOrder(b.entityType);
      if (stageA !== stageB) return stageA - stageB;
    }
    if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
    return a.occurredAt.getTime() - b.occurredAt.getTime();
  });

  return { items, counts, queryMs: Date.now() - started };
}
