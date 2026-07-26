/**
 * APU entry modes ([D-047] amended):
 * - Lines contribute money per 1 unit of the CostItem (`totalCost` is authoritative).
 * - "total" + resource: keep partidaQuantity + resource unit price; derive coefficient.
 * - "total" + lump: legacy money-safe coef=1 (UI deprecated; prefer unit `gl` + resource).
 * - "unit": coefficient × unitCost as entered; partidaQuantity = null.
 * - Unit `gl` (Global): non-purchasable in materials; still stored as resource when cant×precio.
 */

export type ApuEntryMode = "unit" | "total";

/** Sub-mode when entry mode is "total". `lump` is legacy-only in UI. */
export type ApuTotalKind = "resource" | "lump";

/** Canonical budget unit value for non-purchasable globals ([D-047]). */
export const APU_GLOBAL_UNIT = "gl";

/** True when line unit is Global (`gl`) — no materials needQty. */
export function isGlobalUnit(unit: string | null | undefined): boolean {
  return (unit ?? "").trim().toLowerCase() === APU_GLOBAL_UNIT;
}

export type ApuLineAmounts = {
  coefficient: number;
  unitCost: number;
};

export type ApuStoredLine = ApuLineAmounts & {
  totalCost: number;
  partidaQuantity: number | null;
  isLumpSum: boolean;
};

export type ApuEntryInput = ApuLineAmounts & {
  mode: ApuEntryMode;
  /** Default "resource" when mode is "total". Ignored for unit mode. */
  totalKind?: ApuTotalKind;
  itemQuantity: number;
};

/** Matches Prisma `@db.Decimal(18, 4)` on cost_analysis_lines. */
export const APU_DECIMAL_PLACES = 4;

/** Operational money decimals ([D-053]). */
export const APU_MONEY_DECIMALS = 2;

export function roundApuDecimal(value: number, places: number = APU_DECIMAL_PLACES): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Half-up to money decimals (domain-local; mirrors @bloqer/utils roundMoney). */
export function roundApuMoney(value: number): number {
  return roundApuDecimal(value, APU_MONEY_DECIMALS);
}

function finiteOrZero(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Convert UI entry amounts to stored unitario fields + partidaQuantity. */
export function toStoredApuLine(input: ApuEntryInput): ApuStoredLine {
  const coefficient = finiteOrZero(input.coefficient);
  const unitCost = finiteOrZero(input.unitCost);
  const itemQuantity = finiteOrZero(input.itemQuantity);
  const totalKind: ApuTotalKind = input.totalKind ?? "resource";

  if (input.mode === "unit" || itemQuantity <= 0) {
    const coef = roundApuDecimal(coefficient);
    const price = roundApuDecimal(unitCost);
    return {
      coefficient: coef,
      unitCost: price,
      // Keep 4 dp on line contribution so × itemQty recovers partida money ([D-047]).
      totalCost: roundApuDecimal(coef * price),
      partidaQuantity: null,
      isLumpSum: false,
    };
  }

  if (totalKind === "lump") {
    const partida = coefficient * unitCost;
    const unitContribution = roundApuDecimal(partida / itemQuantity);
    return {
      coefficient: 1,
      unitCost: unitContribution,
      totalCost: unitContribution,
      partidaQuantity: 1,
      isLumpSum: true,
    };
  }

  // Total partida — recurso: preserve physical qty + resource unit price
  const partidaQty = roundApuDecimal(coefficient);
  const resourcePrice = roundApuDecimal(unitCost);
  const coefPerUnit = roundApuDecimal(partidaQty / itemQuantity);
  const unitContribution = roundApuDecimal((partidaQty * resourcePrice) / itemQuantity);
  return {
    coefficient: coefPerUnit,
    unitCost: resourcePrice,
    totalCost: unitContribution,
    partidaQuantity: partidaQty,
    isLumpSum: false,
  };
}

export type ApuEntryReverseInput = ApuStoredLine & {
  mode: ApuEntryMode;
  itemQuantity: number;
};

/**
 * Reverse of toStoredApuLine for editing.
 * - unit: stored coef/price
 * - total + lump: 1 × (unitCost × itemQty)
 * - total + resource: partidaQuantity × unitCost (resource price)
 */
export function toEntryApuLine(input: ApuEntryReverseInput): ApuLineAmounts & { totalKind: ApuTotalKind } {
  const itemQuantity = finiteOrZero(input.itemQuantity);
  const coefficient = finiteOrZero(input.coefficient);
  const unitCost = finiteOrZero(input.unitCost);

  if (input.mode === "unit" || itemQuantity <= 0) {
    return { coefficient, unitCost, totalKind: "resource" };
  }

  // Only explicit lump (or legacy flagged rows). Do NOT treat unit-mode coef=1 as lump.
  if (input.isLumpSum) {
    return {
      coefficient: 1,
      unitCost: roundApuDecimal(unitCost * itemQuantity),
      totalKind: "lump",
    };
  }

  const partidaQty =
    input.partidaQuantity != null ? finiteOrZero(input.partidaQuantity) : roundApuDecimal(coefficient * itemQuantity);
  return {
    coefficient: partidaQty,
    unitCost,
    totalKind: "resource",
  };
}

/**
 * Convert amounts between entry modes in the form (display only).
 * Preserves implied partida money; for total→unit uses resource-style coef=1 collapse
 * only when switching without knowing partidaQuantity (form fields only).
 */
export function convertApuEntryMode(
  from: ApuEntryMode,
  to: ApuEntryMode,
  amounts: ApuLineAmounts,
  itemQuantity: number,
  totalKind: ApuTotalKind = "resource",
): ApuLineAmounts {
  if (from === to) return amounts;
  const qty = finiteOrZero(itemQuantity);
  if (qty <= 0) return amounts;

  const coef = finiteOrZero(amounts.coefficient);
  const price = finiteOrZero(amounts.unitCost);

  if (to === "total") {
    if (from === "unit") {
      // Show as total resource: need = coef × qty, same unit price
      return {
        coefficient: roundApuDecimal(coef * qty),
        unitCost: price,
      };
    }
  }

  // total → unit
  if (totalKind === "lump") {
    const partida = coef * price;
    return {
      coefficient: 1,
      unitCost: roundApuDecimal(partida / qty),
    };
  }
  // resource: cant/qty per unit, keep resource price
  return {
    coefficient: roundApuDecimal(coef / qty),
    unitCost: price,
  };
}

/** Line total as stored (per 1 unit of the item). Prefer stored totalCost when available. */
export function lineUnitTotal(amounts: ApuLineAmounts, totalCost?: number): number {
  if (totalCost !== undefined && Number.isFinite(totalCost)) return totalCost;
  return finiteOrZero(amounts.coefficient) * finiteOrZero(amounts.unitCost);
}

export type ApuEntryPreview = {
  unitTotal: number;
  partidaTotal: number;
  /** Physical resource need for the partida (total resource mode) or coef×qty (unit). */
  resourceNeed: number;
  /** Yield per 1 unit of the CostItem (resource mode). */
  yieldPerItemUnit: number | null;
};

/**
 * Live preview for the entry form.
 */
export function previewApuEntry(input: ApuEntryInput): ApuEntryPreview {
  const coef = finiteOrZero(input.coefficient);
  const price = finiteOrZero(input.unitCost);
  const qty = finiteOrZero(input.itemQuantity);
  const totalKind: ApuTotalKind = input.totalKind ?? "resource";

  if (input.mode === "total") {
    const partidaTotal = coef * price;
    return {
      partidaTotal,
      unitTotal: qty <= 0 ? 0 : partidaTotal / qty,
      resourceNeed: coef,
      yieldPerItemUnit: qty <= 0 || totalKind === "lump" ? null : coef / qty,
    };
  }

  return {
    unitTotal: coef * price,
    partidaTotal: coef * price * qty,
    resourceNeed: coef * qty,
    yieldPerItemUnit: coef,
  };
}

export function canUseTotalPartidaMode(itemQuantity: number): boolean {
  return Number.isFinite(itemQuantity) && itemQuantity > 0;
}

/**
 * Lazy migrate legacy Monto global (`isLumpSum`) → resource amounts for 1 Global × monto.
 * Caller must set `unit = gl` when persisting. Money-preserving for itemQuantity > 0.
 */
export function migrateLegacyLumpToGlobalResource(
  line: ApuStoredLine,
  itemQuantity: number,
): ApuStoredLine {
  if (!line.isLumpSum) return line;
  const qty = finiteOrZero(itemQuantity);
  if (qty <= 0) return line;
  const partidaMoney = finiteOrZero(line.totalCost) * qty;
  return toStoredApuLine({
    mode: "total",
    totalKind: "resource",
    coefficient: 1,
    unitCost: partidaMoney,
    itemQuantity: qty,
  });
}

export type PhysicalNeedOpts = {
  /** Legacy Monto global — never purchasable. */
  isLumpSum?: boolean;
  /** Unit `gl` (Global) — non-purchasable ([D-047]). */
  unit?: string | null;
};

/**
 * Physical need for materials board / OC ([D-047]).
 * Returns 0 for legacy lump and for unit Global (`gl`).
 */
export function physicalNeedQty(
  partidaQuantity: number | null | undefined,
  coefficient: number,
  itemQuantity: number,
  opts?: PhysicalNeedOpts,
): number {
  if (opts?.isLumpSum || isGlobalUnit(opts?.unit)) return 0;
  if (partidaQuantity != null && Number.isFinite(partidaQuantity)) {
    return finiteOrZero(partidaQuantity);
  }
  return finiteOrZero(coefficient) * finiteOrZero(itemQuantity);
}

/**
 * Recompute resource line when CostItem.quantity changes (partidaQuantity + unitCost fixed).
 */
export function recomputeResourceForItemQuantity(
  stored: ApuStoredLine,
  newItemQuantity: number,
): ApuStoredLine {
  const qty = finiteOrZero(newItemQuantity);
  if (qty <= 0 || stored.partidaQuantity == null || stored.isLumpSum) return stored;

  const partidaQty = finiteOrZero(stored.partidaQuantity);
  const resourcePrice = finiteOrZero(stored.unitCost);
  return {
    coefficient: roundApuDecimal(partidaQty / qty),
    unitCost: resourcePrice,
    totalCost: roundApuDecimal((partidaQty * resourcePrice) / qty),
    partidaQuantity: partidaQty,
    isLumpSum: false,
  };
}

/**
 * Recompute lump-sum line when item quantity changes (partida money constant).
 * `partidaMoney` = previous totalCost × previous item quantity.
 */
export function recomputeLumpForItemQuantity(
  partidaMoney: number,
  newItemQuantity: number,
): ApuStoredLine {
  const qty = finiteOrZero(newItemQuantity);
  const money = finiteOrZero(partidaMoney);
  if (qty <= 0) {
    return {
      coefficient: 1,
      unitCost: roundApuDecimal(money),
      totalCost: roundApuDecimal(money),
      partidaQuantity: 1,
      isLumpSum: true,
    };
  }
  const unitContribution = roundApuDecimal(money / qty);
  return {
    coefficient: 1,
    unitCost: unitContribution,
    totalCost: unitContribution,
    partidaQuantity: 1,
    isLumpSum: true,
  };
}

/**
 * Normalize a stored/payload line against the CostItem quantity that will be persisted.
 * - resource (partidaQuantity set): derive coef/totalCost from qty + resource price (idempotent).
 * - lump: treat `totalCost` as unit contribution for `itemQuantity` (money = totalCost × qty).
 * - unit mode: totalCost = coef × unitCost.
 */
export function normalizeStoredApuLineForItemQuantity(
  line: ApuStoredLine,
  itemQuantity: number,
): ApuStoredLine {
  if (line.isLumpSum) {
    const qty = finiteOrZero(itemQuantity);
    // Never invent/collapse lump money when qty is not positive — caller must reject qty ≤ 0.
    if (qty <= 0) return line;
    const unitContribution = finiteOrZero(line.totalCost);
    return recomputeLumpForItemQuantity(unitContribution * qty, qty);
  }
  if (line.partidaQuantity != null) {
    if (!(finiteOrZero(itemQuantity) > 0)) return line;
    return recomputeResourceForItemQuantity(
      { ...line, isLumpSum: false },
      itemQuantity,
    );
  }
  const coef = roundApuDecimal(finiteOrZero(line.coefficient));
  const price = roundApuDecimal(finiteOrZero(line.unitCost));
  return {
    coefficient: coef,
    unitCost: price,
    totalCost: roundApuDecimal(coef * price),
    partidaQuantity: null,
    isLumpSum: false,
  };
}
