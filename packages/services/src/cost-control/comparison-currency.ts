import { ServiceError } from "../types";

/** D-122: call only after scope/relationship checks, for a contributing money source. */
export function assertBudgetCurrency(
  budgetCurrency: string,
  sourceCurrency: string | null | undefined,
): void {
  if (budgetCurrency && sourceCurrency === budgetCurrency) return;

  throw new ServiceError(
    "VALIDATION",
    sourceCurrency
      ? `No se puede calcular el resultado económico en ${budgetCurrency}: hay documentos en ${sourceCurrency}. No se convierten ni se omiten importes de otra moneda. Revisá el alcance y las monedas; los tableros de cantidades siguen disponibles.`
      : `No se puede calcular el resultado económico en ${budgetCurrency}: hay documentos sin moneda trazable. Revisá su moneda; no se supone un tipo de cambio. Los tableros de cantidades siguen disponibles.`,
  );
}
