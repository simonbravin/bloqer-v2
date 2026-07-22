import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { buildFinancialHref } from "../finance/financial-trace.service";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import {
  getTreasurySummaryByTenant,
  type AccountBalanceSummary,
} from "./balance.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";

const ZERO = new Prisma.Decimal(0);
const RECENT_MOVEMENTS = 8;
/** Calendario operativo del producto (es-AR); evita desfase UTC en Vercel. */
const TENANT_TZ = "America/Argentina/Buenos_Aires";

export type TreasuryMoneyByCurrency = {
  currency: string;
  amount: string;
};

export type TreasuryHubMovementRow = {
  id: string;
  movementDate: string;
  description: string;
  amount: string;
  currency: string;
  type: string;
  accountName: string;
  href: string;
};

export type TreasuryHubOverview = {
  accounts: AccountBalanceSummary[];
  /** Saldos consolidados por moneda (cuentas activas). */
  balanceByCurrency: TreasuryMoneyByCurrency[];
  /** INFLOW del mes calendario (excluye transferencias internas). */
  monthlyInflowByCurrency: TreasuryMoneyByCurrency[];
  /** OUTFLOW del mes calendario (excluye transferencias internas). */
  monthlyOutflowByCurrency: TreasuryMoneyByCurrency[];
  recentMovements: TreasuryHubMovementRow[];
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Primer día del mes y hoy (YYYY-MM-DD) en zona del tenant, como Date UTC medianoche para `@db.Date`. */
function monthBoundsForTenant(now = new Date()): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TENANT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now };
  }
  return {
    start: new Date(`${y}-${m}-01T00:00:00.000Z`),
    end: new Date(`${y}-${m}-${d}T00:00:00.000Z`),
  };
}

function sumByCurrency(
  rows: { currency: string; amount: Prisma.Decimal }[],
): TreasuryMoneyByCurrency[] {
  const map = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? ZERO).plus(r.amount));
  }
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount: serializeMoneyDecimal(amount) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Hub `/tesoreria`: posición de caja, flujo del mes y actividad reciente.
 * No incluye CxC/CxP (eso es Finanzas). Transferencias internas no cuentan
 * en ingresos/egresos del mes (no cambian caja consolidada).
 *
 * Alcance tenant (todas las empresas): coincide con `listTreasuryAccounts` y las
 * pestañas Cuentas / Transferencias / Reportes de `/tesoreria`, para que el Resumen
 * muestre las mismas cuentas y movimientos que el resto del módulo.
 */
export async function getTreasuryHubOverview(ctx: ServiceContext): Promise<TreasuryHubOverview> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver tesorería");
  }

  const accounts = await getTreasurySummaryByTenant(ctx);
  const balanceByCurrency = sumByCurrency(
    accounts.map((a) => ({
      currency: a.currency,
      amount: new Prisma.Decimal(a.balance),
    })),
  );

  const { start, end } = monthBoundsForTenant();

  const [monthlyRows, recentRows] = await Promise.all([
    prisma.accountMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "CONFIRMED",
        type: { in: ["INFLOW", "OUTFLOW"] },
        movementDate: { gte: start, lte: end },
      },
      select: { type: true, currency: true, amount: true },
    }),
    prisma.accountMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "CONFIRMED",
      },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      take: RECENT_MOVEMENTS,
      select: {
        id: true,
        movementDate: true,
        description: true,
        amount: true,
        currency: true,
        type: true,
        accountId: true,
        account: { select: { name: true } },
      },
    }),
  ]);

  const monthlyInflowByCurrency = sumByCurrency(
    monthlyRows
      .filter((m) => m.type === "INFLOW")
      .map((m) => ({ currency: m.currency, amount: m.amount })),
  );
  const monthlyOutflowByCurrency = sumByCurrency(
    monthlyRows
      .filter((m) => m.type === "OUTFLOW")
      .map((m) => ({ currency: m.currency, amount: m.amount })),
  );

  const recentMovements: TreasuryHubMovementRow[] = recentRows.map((m) => ({
    id: m.id,
    movementDate: isoDate(m.movementDate),
    description: m.description,
    amount: serializeMoneyDecimal(m.amount),
    currency: m.currency,
    type: m.type,
    accountName: m.account.name,
    href: buildFinancialHref("AccountMovement", m.id, { accountId: m.accountId }),
  }));

  return {
    accounts,
    balanceByCurrency,
    monthlyInflowByCurrency,
    monthlyOutflowByCurrency,
    recentMovements,
  };
}
