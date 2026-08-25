import { compareDecimal, roundMoney, roundQty, serializeMoney, serializeUnitPrice } from "@bloqer/utils";

function formatFixedDecimalString(s: string): string {
  const sign = s.startsWith("-") ? "-" : "";
  const abs = sign ? s.slice(1) : s;
  const [intPart, decPart = ""] = abs.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart ? `${sign}${withThousands},${decPart}` : `${sign}${withThousands}`;
}

/** Decimal estilo AR sin depender del locale del runtime (seguro para SSR + cliente). */
export function formatDecimalAr(n: number): string {
  return formatDecimalArFromString(serializeMoney(n));
}

/** Format a decimal string as es-AR without IEEE float (D-053). */
export function formatDecimalArFromString(raw: string): string {
  let s: string;
  try {
    s = serializeMoney(raw);
  } catch {
    return raw;
  }
  return formatFixedDecimalString(s);
}

/** Cantidades inventario / cómputo (4 dp, D-053). */
export function formatQtyFromString(raw: string): string {
  try {
    return formatFixedDecimalString(roundQty(raw));
  } catch {
    return raw;
  }
}

/** Cantidad de presupuesto en tabla: 2 dp de display (el valor persistido sigue en 4 dp). */
export function formatBudgetQtyFromString(raw: string): string {
  try {
    return formatFixedDecimalString(roundMoney(raw, 2));
  } catch {
    return raw;
  }
}

/** Precios unitarios de línea (4 dp, D-086). */
export function formatUnitPriceFromString(raw: string): string {
  try {
    return formatFixedDecimalString(serializeUnitPrice(raw));
  } catch {
    return raw;
  }
}

/** Tooltip/eje de chart: Recharts entrega number; el texto sale por el kernel. */
export function formatChartMoney(value: number | string, currency?: string): string {
  return formatMoneyAmount(String(value), currency);
}

/** Formatea un monto decimal string con moneda ISO (es-AR). */
export function formatMoneyAmount(raw: string, currency?: string): string {
  const body = formatDecimalArFromString(raw);
  if (currency && currency.length === 3) {
    // Prefer Intl currency style when magnitude is Number-safe; else code suffix.
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
