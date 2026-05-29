/** Decimal estilo AR sin depender del locale del runtime (seguro para SSR + cliente). */
export function formatDecimalAr(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const [intPart, decPart = "00"] = abs.toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withThousands},${decPart}`;
}

/** Formatea un monto decimal string con moneda ISO (es-AR). */
export function formatMoneyAmount(raw: string, currency?: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (currency && currency.length === 3) {
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      /* moneda no soportada por Intl */
    }
  }
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
