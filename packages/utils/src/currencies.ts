export type CurrencyOption = {
  code: string;
  name: string;
};

/**
 * Monedas frecuentes en operaciones de construcción en América (ISO 4217).
 * Valor persistido = `code`; UI muestra nombre legible.
 */
export const AMERICAS_CURRENCY_OPTIONS: readonly CurrencyOption[] = [
  { code: "ARS", name: "Peso argentino" },
  { code: "USD", name: "Dólar estadounidense" },
  { code: "EUR", name: "Euro" },
  { code: "BRL", name: "Real brasileño" },
  { code: "CLP", name: "Peso chileno" },
  { code: "UYU", name: "Peso uruguayo" },
  { code: "PYG", name: "Guaraní paraguayo" },
  { code: "BOB", name: "Boliviano" },
  { code: "PEN", name: "Sol peruano" },
  { code: "COP", name: "Peso colombiano" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "PAB", name: "Balboa panameño" },
] as const;

export type AmericasCurrencyCode = (typeof AMERICAS_CURRENCY_OPTIONS)[number]["code"];

const BY_CODE = new Map(AMERICAS_CURRENCY_OPTIONS.map((c) => [c.code, c]));

export function getCurrencyOption(code: string): CurrencyOption | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Etiqueta para selects: `USD — Dólar estadounidense` */
export function formatCurrencyLabel(code: string): string {
  const c = getCurrencyOption(code);
  return c ? `${c.code} — ${c.name}` : code.toUpperCase();
}

/** Nombre legible; si no está en la lista, devuelve el código. */
export function formatCurrencyName(code: string): string {
  return getCurrencyOption(code)?.name ?? code.toUpperCase();
}

/** Tablas y detalle: `Dólar estadounidense (USD)` */
export function formatCurrencyDisplay(code: string): string {
  const c = getCurrencyOption(code);
  return c ? `${c.name} (${c.code})` : code.toUpperCase();
}

export function isKnownAmericasCurrency(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}
