import {
  previewApuEntry as previewDomainApuEntry,
  toStoredApuLine as toDomainStoredApuLine,
  type ApuEntryInput,
  type ApuEntryPreview,
  type ApuStoredLine,
} from "@bloqer/domain";
import { multiplyDecimal, roundQty, serializeMoney } from "@bloqer/utils";
import { computeApuUnitContribution } from "@bloqer/services/budget-apu-calc";
import { isBudgetDecimalWithinStorage } from "@bloqer/validators";

/** Keep D-047 physical conversions, with the same per-line monetary boundary as persistence. */
export function toStoredMoneyApuLine(input: ApuEntryInput): ApuStoredLine {
  const stored = toDomainStoredApuLine(input);
  const contribution = computeApuUnitContribution(stored.isLumpSum ? {
    coefficient: input.coefficient,
    unitCost: input.unitCost,
    partidaQuantity: input.coefficient,
  } : stored, input.itemQuantity);
  return { ...stored, totalCost: Number(contribution), ...(stored.isLumpSum ? { unitCost: Number(contribution) } : {}) };
}

export function previewMoneyApuEntry(input: ApuEntryInput): ApuEntryPreview {
  if (![input.coefficient, input.unitCost, input.itemQuantity].every((value) => Number.isFinite(value) && isBudgetDecimalWithinStorage(value))) {
    return { unitTotal: 0, partidaTotal: 0, resourceNeed: 0, yieldPerItemUnit: null };
  }
  const physical = previewDomainApuEntry(input);
  if (input.mode === "total" && !(input.itemQuantity > 0)) return { ...physical, unitTotal: 0, partidaTotal: 0 };
  const stored = toStoredMoneyApuLine(input);
  return {
    ...physical,
    unitTotal: stored.totalCost,
    partidaTotal: Number(serializeMoney(multiplyDecimal(String(stored.totalCost), roundQty(input.itemQuantity)))),
  };
}
