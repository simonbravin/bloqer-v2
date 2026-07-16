import { ServiceError } from "../types";

/** Currency guard — no FX conversion in current phases. */
export function assertTreasuryAccountCurrencyMatches(
  accountCurrency: string,
  obligationCurrency: string,
): void {
  if (accountCurrency === obligationCurrency) return;
  throw new ServiceError(
    "CONFLICT",
    `Moneda de cuenta (${accountCurrency}) no coincide con la del saldo (${obligationCurrency}). FX no disponible.`,
  );
}
