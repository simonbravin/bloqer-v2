import { divideDecimal, multiplyDecimal, roundMoney, roundQty } from "@bloqer/utils";

export type ApuUnitContributionInput = {
  coefficient: string | number;
  unitCost: string | number;
  partidaQuantity?: string | number | null;
};

/**
 * Shared UI/server APU contribution (D-047 / D-053). Round stored operands to
 * four decimals, then the exact product or resource quotient directly to money.
 * Never round a quotient to four decimals before its two-decimal money result.
 * Callers validate input and resolve legacy lump lines before invoking this helper.
 */
export function computeApuUnitContribution(
  line: ApuUnitContributionInput,
  itemQuantity: string | number,
): string {
  const unitCost = roundQty(line.unitCost);
  if (line.partidaQuantity != null) {
    return divideDecimal(
      multiplyDecimal(roundQty(line.partidaQuantity), unitCost),
      roundQty(itemQuantity),
      2,
    );
  }
  return roundMoney(multiplyDecimal(roundQty(line.coefficient), unitCost));
}
