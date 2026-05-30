import { Prisma } from "@bloqer/database";
import type { DashboardKpi } from "./tenant-dashboard.service";

const ZERO = new Prisma.Decimal(0);

export function fmtDecimalEs(value: string, currencyCode?: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  if (currencyCode) {
    try {
      return new Intl.NumberFormat("es-AR", {
        style:                 "currency",
        currency:              currencyCode,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${value} ${currencyCode}`;
    }
  }
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

export function pushMoneyKpi(
  kpis: DashboardKpi[],
  key: string,
  label: string,
  byCurrency: Map<string, Prisma.Decimal>,
  href: string,
  emptyLabel = "—",
) {
  const entries = [...byCurrency.entries()].filter(([, a]) => a.greaterThan(ZERO));
  if (entries.length === 0) {
    kpis.push({ key, label, value: emptyLabel, href, tone: "muted" });
    return;
  }
  if (entries.length === 1) {
    const [currency, amount] = entries[0]!;
    kpis.push({
      key,
      label,
      value: fmtDecimalEs(amount.toString(), currency),
      href,
    });
    return;
  }
  kpis.push({
    key,
    label,
    value: "Multimoneda",
    href,
    tone: "muted",
  });
}

/** Net balance KPIs (cobros − pagos): includes zero and negative amounts. */
export function pushSignedNetMoneyKpi(
  kpis: DashboardKpi[],
  key: string,
  label: string,
  byCurrency: Map<string, Prisma.Decimal>,
  href: string,
  emptyLabel = "Sin movimientos",
) {
  const entries = [...byCurrency.entries()].filter(([, a]) => !a.isZero());
  if (entries.length === 0) {
    const zeroEntries = [...byCurrency.entries()];
    if (zeroEntries.length === 1) {
      const [currency] = zeroEntries[0]!;
      kpis.push({ key, label, value: fmtDecimalEs("0", currency), href, tone: "muted" });
      return;
    }
    if (zeroEntries.length > 1) {
      kpis.push({ key, label, value: "Multimoneda", href, tone: "muted" });
      return;
    }
    kpis.push({ key, label, value: emptyLabel, href, tone: "muted" });
    return;
  }
  if (entries.length === 1) {
    const [currency, amount] = entries[0]!;
    kpis.push({
      key,
      label,
      value: fmtDecimalEs(amount.toString(), currency),
      href,
      tone: amount.lessThan(ZERO) ? "warning" : "default",
    });
    return;
  }
  const anyNegative = entries.some(([, a]) => a.lessThan(ZERO));
  kpis.push({
    key,
    label,
    value: "Multimoneda",
    href,
    tone: anyNegative ? "warning" : "muted",
  });
}

export function pushMoneyRowsKpi(
  kpis: DashboardKpi[],
  key: string,
  label: string,
  rows: { currency: string; amount: string }[],
  href: string,
  emptyLabel = "—",
) {
  const byCurrency = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    const cur = r.currency;
    const amt = new Prisma.Decimal(r.amount);
    if (amt.greaterThan(ZERO)) {
      byCurrency.set(cur, (byCurrency.get(cur) ?? ZERO).plus(amt));
    }
  }
  pushMoneyKpi(kpis, key, label, byCurrency, href, emptyLabel);
}
