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
