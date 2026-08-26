import {
  compareDecimal,
  DISPLAY_DECIMALS,
  formatGroupedDecimal,
  roundQty,
  roundRatePct,
  serializeMoney,
} from "@bloqer/utils";

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

/** IVA / desc. %: recorta ceros y usa coma es-AR (storage 4 dp). */
export function formatRatePctFromString(raw: string): string {
  try {
    const canonical = roundRatePct(raw);
    const trimmed = canonical.replace(/0+$/, "").replace(/\.$/, "");
    return trimmed.replace(".", ",");
  } catch {
    return raw;
  }
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
