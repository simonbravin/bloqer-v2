import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { hasOpenObligationBalance, isObligationOverdue, OBLIGATION_OPEN_BALANCE_EPSILON } from "../finance/obligation-date";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import type { ReceivablesProjectSummary } from "./receivable.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";

export type CompanyReceivableSnapshotRow = {
  currency: string;
  dueDate: Date;
  originalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  status: string;
};

const ZERO = new Prisma.Decimal(0);

export async function fetchCompanyReceivableSnapshotRows(
  ctx: ServiceContext,
): Promise<CompanyReceivableSnapshotRow[]> {
  await assertArTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "AR")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }

  return prisma.receivable.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { notIn: ["PAID", "CANCELLED"] },
      // Receivable.companyId es NOT NULL → scope directo por empresa (no hay filas compartidas).
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    },
    select: {
      currency: true,
      dueDate: true,
      originalAmount: true,
      paidAmount: true,
      status: true,
    },
  });
}

function openBalance(row: CompanyReceivableSnapshotRow): Prisma.Decimal | null {
  if (row.status === "CANCELLED") return null;
  const bal = row.originalAmount.minus(row.paidAmount);
  if (!hasOpenObligationBalance(bal, OBLIGATION_OPEN_BALANCE_EPSILON)) return null;
  return bal;
}

export function aggregateCompanyReceivableBalances(
  rows: CompanyReceivableSnapshotRow[],
): ReceivablesProjectSummary {
  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();

  for (const row of rows) {
    const bal = openBalance(row);
    if (!bal) continue;
    const cur = row.currency;
    total.set(cur, (total.get(cur) ?? ZERO).add(bal));
    if (isObligationOverdue(row.dueDate)) {
      overdue.set(cur, (overdue.get(cur) ?? ZERO).add(bal));
    }
  }

  const toRows = (m: Map<string, Prisma.Decimal>) =>
    [...m.entries()]
      .filter(([, v]) => hasOpenObligationBalance(v, OBLIGATION_OPEN_BALANCE_EPSILON))
      .map(([currency, amount]) => ({ currency, amount: serializeMoneyDecimal(amount) }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

  return { totalByCurrency: toRows(total), overdueByCurrency: toRows(overdue) };
}
