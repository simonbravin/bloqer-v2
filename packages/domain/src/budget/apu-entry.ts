/**
 * APU entry modes ([D-047]): lines are always stored per unit of the CostItem.
 * "total" mode lets the user enter whole-item quantities/prices; we convert on save.
 *
 * Persistence uses Decimal(18, 4) for coefficient and unitCost. Dividing a small
 * coefficient by item quantity (e.g. 1/900 → 0.0011) loses money; total mode
 * therefore stores coefficient = 1 and puts the proration on unitCost.
 */
export type ApuEntryMode = "unit" | "total";

export type ApuLineAmounts = {
  coefficient: number;
  unitCost: number;
};

export type ApuEntryInput = ApuLineAmounts & {
  mode: ApuEntryMode;
  itemQuantity: number;
};

/** Matches Prisma `@db.Decimal(18, 4)` on cost_analysis_lines. */
export const APU_DECIMAL_PLACES = 4;

export function roundApuDecimal(value: number, places: number = APU_DECIMAL_PLACES): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function finiteOrZero(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Convert UI entry amounts to stored (unitario) coefficient / unitCost. */
export function toStoredApuLine(input: ApuEntryInput): ApuLineAmounts {
  const coefficient = finiteOrZero(input.coefficient);
  const unitCost = finiteOrZero(input.unitCost);
  const itemQuantity = finiteOrZero(input.itemQuantity);

  if (input.mode === "unit" || itemQuantity <= 0) {
    return {
      coefficient: roundApuDecimal(coefficient),
      unitCost: roundApuDecimal(unitCost),
    };
  }

  const partida = coefficient * unitCost;
  return {
    coefficient: 1,
    unitCost: roundApuDecimal(partida / itemQuantity),
  };
}

/**
 * Reverse of toStoredApuLine for editing in total mode:
 * show as 1 × (unitario × qty) so the partida total is editable as a single price.
 */
export function toEntryApuLine(input: ApuEntryInput): ApuLineAmounts {
  const coefficient = finiteOrZero(input.coefficient);
  const unitCost = finiteOrZero(input.unitCost);
  const itemQuantity = finiteOrZero(input.itemQuantity);

  if (input.mode === "unit" || itemQuantity <= 0) {
    return { coefficient, unitCost };
  }

  return {
    coefficient: 1,
    unitCost: roundApuDecimal(coefficient * unitCost * itemQuantity),
  };
}

/**
 * Convert amounts between entry modes in the form (display only).
 * Keeps the implied partida total stable when quantity &gt; 0.
 */
export function convertApuEntryMode(
  from: ApuEntryMode,
  to: ApuEntryMode,
  amounts: ApuLineAmounts,
  itemQuantity: number,
): ApuLineAmounts {
  if (from === to) return amounts;
  const qty = finiteOrZero(itemQuantity);
  if (qty <= 0) return amounts;

  const product = finiteOrZero(amounts.coefficient) * finiteOrZero(amounts.unitCost);

  if (to === "total") {
    return { coefficient: 1, unitCost: roundApuDecimal(product * qty) };
  }

  return { coefficient: 1, unitCost: roundApuDecimal(product / qty) };
}

/** Line total as stored (per 1 unit of the item). */
export function lineUnitTotal(amounts: ApuLineAmounts): number {
  return finiteOrZero(amounts.coefficient) * finiteOrZero(amounts.unitCost);
}

/**
 * Live preview for the entry form.
 * - unit mode: partida = (coef×precio)×qtyÍtem; unitario = coef×precio
 * - total mode: partida = coef×precio; unitario = (coef×precio)/qtyÍtem
 */
export function previewApuEntry(input: ApuEntryInput): {
  unitTotal: number;
  partidaTotal: number;
} {
  const product = finiteOrZero(input.coefficient) * finiteOrZero(input.unitCost);
  const qty = finiteOrZero(input.itemQuantity);

  if (input.mode === "total") {
    return {
      partidaTotal: product,
      unitTotal: qty <= 0 ? 0 : product / qty,
    };
  }

  return {
    unitTotal: product,
    partidaTotal: product * qty,
  };
}

export function canUseTotalPartidaMode(itemQuantity: number): boolean {
  return Number.isFinite(itemQuantity) && itemQuantity > 0;
}
