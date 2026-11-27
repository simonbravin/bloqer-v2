import { Prisma, prisma } from "@bloqer/database";
import { resolveDisplayTimeZone, toIsoDateInTimeZone } from "@bloqer/utils";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { canViewArProjectArea } from "../ar/ar-access";
import { canViewApProjectArea } from "../ap/ap-access";
import { computeObligationBalanceDue, normalizeObligationBalanceDue } from "../finance/obligation-balance";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import { canViewProjectCashFlowReport } from "./project-cash-flow.service";
import { computeDelayedReceivables, computeProjectedCapital, MAX_COLLECTION_DELAY_DAYS, parseCollectionDelayDays } from "./project-cash-position-projection-pure";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d!;
}

export function resolveProjectionAsOfDate(value: string | undefined, today = toIsoDateInTimeZone()): string {
  if (value && isValidIsoDate(value)) return value;
  return today;
}

export type ProjectCashPositionProjectionFilters = {
  asOfDate?: string;
  currency?: string;
  collectionDelayDays?: string | number;
};

export type ProjectCashPositionProjectionCurrency = {
  currency: string;
  collectionsReceived: string;
  paymentsMade: string;
  receivablesDue: string;
  payablesDue: string;
  projectedCapital: string;
  receivableOpenCount: number;
  payableOpenCount: number;
  scenario: {
    receivablesDue: string;
    projectedCapital: string;
    capitalDifference: string;
    deferredReceivables: string;
    deferredReceivableCount: number;
  } | null;
};

export type ProjectCashPositionProjectionContext = {
  type: "CONTEXT";
  today: string;
  timeZone: string;
  receivablesAvailable: boolean;
  payablesAvailable: boolean;
  maxCollectionDelayDays: number;
};

export type ProjectCashPositionProjectionReport = {
  type: "REPORT";
  projectId: string;
  asOfDate: string;
  currencies: ProjectCashPositionProjectionCurrency[];
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
  context: ProjectCashPositionProjectionContext;
  collectionDelayDays: number | null;
  scenarioError: string | null;
};

const OPEN_OBLIGATION = ACTIVE_OBLIGATION_STATUSES;

async function readProjectionContext(projectId: string, ctx: ServiceContext) {
  if (!canViewProjectCashFlowReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver proyección de caja del proyecto");
  }
  await requireProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  const tenant = await prisma.tenant.findFirst({ where: { id: ctx.tenantId }, select: { timezone: true } });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Organización no encontrada");
  const timeZone = resolveDisplayTimeZone(tenant.timezone);
  const context: ProjectCashPositionProjectionContext = {
    type: "CONTEXT", today: toIsoDateInTimeZone(new Date(), timeZone), timeZone,
    receivablesAvailable: gate.isEnabled("AR") && canViewArProjectArea(ctx.roles),
    payablesAvailable: gate.isEnabled("AP") && canViewApProjectArea(ctx.roles),
    maxCollectionDelayDays: MAX_COLLECTION_DELAY_DAYS,
  };
  return { gate, context };
}

/** Calendar and source availability for the collapsed panel; no financial rows are read. */
export async function getProjectCashPositionProjectionContext(projectId: string, ctx: ServiceContext) {
  return (await readProjectionContext(projectId, ctx)).context;
}

/**
 * Proyección puntual de caja del proyecto a una fecha:
 * cobros/pagos confirmados hasta la fecha + saldos abiertos actuales con vencimiento ≤ fecha.
 */
export async function getProjectCashPositionProjection(
  projectId: string,
  filters: ProjectCashPositionProjectionFilters,
  ctx: ServiceContext,
): Promise<ProjectCashPositionProjectionReport> {
  const { gate, context } = await readProjectionContext(projectId, ctx);
  const includeAr = context.receivablesAvailable;
  const includeAp = context.payablesAvailable;

  const warnings: string[] = [
    "Capital proyectado = cobros confirmados − pagos confirmados + saldo CxC actual − saldo CxP actual. Solo considera saldos con vencimiento hasta la fecha elegida y excluye OC sin facturar.",
  ];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  if (!includeAr) {
    sectionsExcluded.push({
      module: "AR",
      section: "collections_and_receivables",
      reason: gate.isEnabled("AR") ? "MISSING_PERMISSION" : "TENANT_MODULE_DISABLED",
    });
    warnings.push("Cuentas por cobrar no disponible. La proyección incluye solo las fuentes visibles.");
  }
  if (!includeAp) {
    sectionsExcluded.push({
      module: "AP",
      section: "payments_and_payables",
      reason: gate.isEnabled("AP") ? "MISSING_PERMISSION" : "TENANT_MODULE_DISABLED",
    });
    warnings.push("Cuentas por pagar no disponible. La proyección incluye solo las fuentes visibles.");
  }

  const asOfDate = resolveProjectionAsOfDate(filters.asOfDate, context.today);
  const asOf = new Date(asOfDate);
  let collectionDelayDays: number | null = null;
  let scenarioError: string | null = null;
  try {
    collectionDelayDays = parseCollectionDelayDays(filters.collectionDelayDays);
    if (collectionDelayDays !== null) {
      if (!includeAr) throw new Error("La comparación requiere acceso a Cuentas por cobrar.");
      if (filters.asOfDate && !isValidIsoDate(filters.asOfDate)) throw new Error("Elegí una fecha de proyección válida para comparar.");
      if (asOfDate < context.today) throw new Error("La comparación requiere una fecha de proyección de hoy o posterior.");
    }
  } catch (error) {
    collectionDelayDays = null;
    scenarioError = error instanceof Error ? error.message : "No se pudo aplicar el escenario.";
  }

  const [collections, payments, receivables, payables] = await Promise.all([
    includeAr
      ? prisma.collection.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            ...(ctx.companyId ? { companyId: ctx.companyId } : {}), // companyId NOT NULL
            status: "CONFIRMED",
            collectionDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: { currency: true, amount: true },
        })
      : Promise.resolve([]),
    includeAp
      ? prisma.payment.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            ...(ctx.companyId ? { companyId: ctx.companyId } : {}), // companyId NOT NULL
            status: "CONFIRMED",
            paymentDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: { currency: true, amount: true },
        })
      : Promise.resolve([]),
    includeAr
      ? prisma.receivable.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            ...(ctx.companyId ? { companyId: ctx.companyId } : {}), // companyId NOT NULL
            status: { in: [...OPEN_OBLIGATION] },
            dueDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: {
            currency: true,
            dueDate: true,
            originalAmount: true,
            paidAmount: true,
            creditedAmount: true,
          },
        })
      : Promise.resolve([]),
    includeAp
      ? prisma.payable.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            ...(ctx.companyId ? { companyId: ctx.companyId } : {}), // companyId NOT NULL
            status: { in: [...OPEN_OBLIGATION] },
            dueDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: {
            currency: true,
            originalAmount: true,
            paidAmount: true,
            creditedAmount: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const currencies = new Set<string>([
    ...collections.map((c) => c.currency),
    ...payments.map((p) => p.currency),
    ...receivables.map((r) => r.currency),
    ...payables.map((p) => p.currency),
  ]);

  const currencyRows: ProjectCashPositionProjectionCurrency[] = [];

  for (const cur of currencies) {
    const collectionsReceived = collections
      .filter((c) => c.currency === cur)
      .reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));

    const paymentsMade = payments
      .filter((p) => p.currency === cur)
      .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));

    let receivablesDue = new Prisma.Decimal(0);
    let receivableOpenCount = 0;
    for (const r of receivables.filter((x) => x.currency === cur)) {
      const balance = normalizeObligationBalanceDue(computeObligationBalanceDue(r.originalAmount, r.paidAmount, r.creditedAmount));
      if (balance.lessThanOrEqualTo(0)) continue;
      receivablesDue = receivablesDue.plus(balance);
      receivableOpenCount += 1;
    }

    let payablesDue = new Prisma.Decimal(0);
    let payableOpenCount = 0;
    for (const p of payables.filter((x) => x.currency === cur)) {
      const balance = normalizeObligationBalanceDue(computeObligationBalanceDue(p.originalAmount, p.paidAmount, p.creditedAmount));
      if (balance.lessThanOrEqualTo(0)) continue;
      payablesDue = payablesDue.plus(balance);
      payableOpenCount += 1;
    }

    const projectedCapital = computeProjectedCapital(
      collectionsReceived,
      paymentsMade,
      receivablesDue,
      payablesDue,
    );
    const delayed = collectionDelayDays === null ? null : computeDelayedReceivables(
      receivables.filter((row) => row.currency === cur), asOfDate, context.today, collectionDelayDays,
    );
    const scenarioCapital = delayed === null ? null : computeProjectedCapital(
      collectionsReceived, paymentsMade, delayed.included, payablesDue,
    );

    currencyRows.push({
      currency: cur,
      collectionsReceived: serializeMoneyDecimal(collectionsReceived),
      paymentsMade: serializeMoneyDecimal(paymentsMade),
      receivablesDue: serializeMoneyDecimal(receivablesDue),
      payablesDue: serializeMoneyDecimal(payablesDue),
      projectedCapital: serializeMoneyDecimal(projectedCapital),
      receivableOpenCount,
      payableOpenCount,
      scenario: delayed && scenarioCapital ? {
        receivablesDue: serializeMoneyDecimal(delayed.included),
        projectedCapital: serializeMoneyDecimal(scenarioCapital),
        capitalDifference: serializeMoneyDecimal(scenarioCapital.minus(projectedCapital)),
        deferredReceivables: serializeMoneyDecimal(delayed.deferred),
        deferredReceivableCount: delayed.deferredCount,
      } : null,
    });
  }

  currencyRows.sort((a, b) =>
    a.currency === "ARS" ? -1 : b.currency === "ARS" ? 1 : a.currency.localeCompare(b.currency),
  );

  if (currencyRows.length === 0) {
    const cur = filters.currency ?? "ARS";
    currencyRows.push({
      currency: cur,
      collectionsReceived: "0.00",
      paymentsMade: "0.00",
      receivablesDue: "0.00",
      payablesDue: "0.00",
      projectedCapital: "0.00",
      receivableOpenCount: 0,
      payableOpenCount: 0,
      scenario: collectionDelayDays === null ? null : {
        receivablesDue: "0.00", projectedCapital: "0.00", capitalDifference: "0.00",
        deferredReceivables: "0.00", deferredReceivableCount: 0,
      },
    });
  }

  return {
    type: "REPORT",
    projectId,
    asOfDate,
    currencies: currencyRows,
    warnings,
    sectionsExcluded,
    context,
    collectionDelayDays,
    scenarioError,
  };
}
