import {
  compareDecimal,
  DISPLAY_DECIMALS,
  formatGroupedDecimal,
  roundQty,
  roundRatePct,
  roundToDecimals,
  serializeMoney,
} from "@bloqer/utils";

/**
 * Canonical UI number formatting ([D-053]).
 * Use these helpers (or DecimalInput) everywhere — do not dump DTO strings or type="number".
 * Money, qty and unit prices: 2 dp + thousands es-AR. %: 2 dp, comma decimal. FX: 6.
 */

/** Decimal estilo AR sin depender del locale del runtime (seguro para SSR + cliente). */
export function formatDecimalAr(n: number): string {
  return formatDecimalArFromString(serializeMoney(n));
}

/** Format a decimal string as es-AR without IEEE float (D-053 display: 2 dp + miles). */
export function formatDecimalArFromString(raw: string): string {
  try {
    return formatGroupedDecimal(raw, DISPLAY_DECIMALS);
  } catch {
    return raw;
  }
}

/** Cantidades en UI: 2 dp + miles. El storage puede seguir en 4 dp. */
export function formatQtyFromString(raw: string): string {
  return formatDecimalArFromString(raw);
}

/** @deprecated Use formatQtyFromString — same 2 dp display. */
export function formatBudgetQtyFromString(raw: string): string {
  return formatQtyFromString(raw);
}

/** Precios unitarios en UI: 2 dp + miles (el DTO puede traer 4 dp). */
export function formatUnitPriceFromString(raw: string): string {
  return formatDecimalArFromString(raw);
}

/** IVA / desc. % / umbrales: 2 dp en UI, coma es-AR; recorta ceros (storage puede ser 4 dp). */
export function formatRatePctFromString(raw: string): string {
  try {
    const canonical = roundToDecimals(raw, DISPLAY_DECIMALS);
    const trimmed = canonical.replace(/0+$/, "").replace(/\.$/, "");
    return trimmed.replace(".", ",");
  } catch {
    return raw;
  }
}

function displayOrDash(raw: string | null | undefined, format: (s: string) => string): string {
  if (raw == null) return "—";
  const t = String(raw).trim();
  if (!t) return "—";
  try {
    return format(t);
  } catch {
    return t;
  }
}

/** Qty in tables/fichas; empty → em dash. */
export function formatQtyDisplay(raw: string | null | undefined): string {
  return displayOrDash(raw, formatQtyFromString);
}

export function formatQtyWithUnit(
  raw: string | null | undefined,
  unit?: string | null,
): string {
  const qty = formatQtyDisplay(raw);
  if (qty === "—") return qty;
  const u = unit?.trim();
  return u ? `${qty} ${u}` : qty;
}

/** Unit prices / referential $ without currency symbol. */
export function formatUnitPriceDisplay(raw: string | null | undefined): string {
  return displayOrDash(raw, formatUnitPriceFromString);
}

export function formatMoneyDisplay(raw: string | null | undefined, currency?: string): string {
  return displayOrDash(raw, (s) => formatMoneyAmount(s, currency));
}

export function formatRatePctDisplay(raw: string | null | undefined): string {
  return displayOrDash(raw, formatRatePctFromString);
}

/** Percent in tables/KPIs: `10,50%` or em dash. */
export function formatRatePctWithSymbol(raw: string | null | undefined): string {
  const body = formatRatePctDisplay(raw);
  return body === "—" ? "—" : `${body}%`;
}

/** Tooltip/eje de chart: Recharts entrega number; el texto sale por el kernel. */
export function formatChartMoney(value: number | string, currency?: string): string {
  return formatMoneyAmount(String(value), currency);
}

/** Eje Y compacto (solo labels de Recharts; no es cálculo financiero). */
export function formatChartAxis(value: number): string {
  if (!Number.isFinite(value)) return "";
  const n = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (n >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${sign}${(n / 1_000).toFixed(0)}k`;
  return value.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/** Formatea un monto decimal string con moneda ISO (es-AR). */
export function formatMoneyAmount(raw: string, currency?: string): string {
  const body = formatDecimalArFromString(raw);
  if (currency && currency.length === 3) {
    try {
      const n = Number(serializeMoney(raw));
      if (Number.isFinite(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER / 100) {
        return new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
      }
    } catch {
      /* fall through */
    }
    return `${body} ${currency}`;
  }
  return body;
}

/** True when a serialized money string is strictly greater than zero (no IEEE float). */
export function isPositiveMoneyAmount(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return false;
  try {
    const s = serializeMoney(raw);
    return s !== "0.00" && !s.startsWith("-");
  } catch {
    return false;
  }
}

/** True for 0 / 0.0 / 0.00 after D-053 money serialization. */
export function isZeroMoneyAmount(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return true;
  try {
    return serializeMoney(raw) === "0.00";
  } catch {
    return raw === "0" || raw === "0.0" || raw === "0.00";
  }
}

export function isZeroQty(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return true;
  try {
    return roundQty(raw) === "0.0000";
  } catch {
    return false;
  }
}

/** True for 0 / 0.00 / 0.0000 after D-053 rate serialization. */
export function isZeroRatePct(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return true;
  try {
    return roundRatePct(raw) === "0.0000";
  } catch {
    return raw === "0" || raw === "0.0" || raw === "0.00" || raw === "0.0000";
  }
}

export function isPositiveQty(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return false;
  try {
    const s = roundQty(raw);
    return s !== "0.0000" && !s.startsWith("-");
  } catch {
    return false;
  }
}

export function isNegativeQty(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return false;
  try {
    return roundQty(raw).startsWith("-");
  } catch {
    return false;
  }
}

/** Compare quantities at 4 dp without IEEE float. */
export function compareQty(a: string, b: string): -1 | 0 | 1 {
  try {
    return compareDecimal(roundQty(a || "0"), roundQty(b || "0"));
  } catch {
    return 0;
  }
}

export function moneyAmountTone(raw: string): "success" | "danger" | "muted" {
  if (isZeroMoneyAmount(raw)) return "muted";
  return isPositiveMoneyAmount(raw) ? "success" : "danger";
}
