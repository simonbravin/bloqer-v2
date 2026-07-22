function formatDecimalEs(value: string, currencyCode?: string): string {
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  if (currencyCode) {
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(number);
    } catch {
      return `${value} ${currencyCode}`;
    }
  }
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatDashboardMoney(value: string, currency?: string | null): string {
  if (currency && currency.length === 3) return formatDecimalEs(value, currency);
  return formatDecimalEs(value);
}
