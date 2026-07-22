import { serializeMoney } from "@bloqer/utils";

/** Decimal estilo AR sin depender del locale del runtime (seguro para SSR + cliente). */
export function formatDecimalAr(n: number): string {
  return formatDecimalArFromString(n.toFixed(2));
}

/** Format a decimal string as es-AR without IEEE float (D-053). */
export function formatDecimalArFromString(raw: string): string {
  let s: string;
  try {
    s = serializeMoney(raw);
  } catch {
    return raw;
  }
  const sign = s.startsWith("-") ? "-" : "";
  const abs = sign ? s.slice(1) : s;
  const [intPart, decPart = "00"] = abs.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withThousands},${decPart}`;
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
