import { isGlobalUnit } from "@bloqer/domain";
import {
  addDecimal,
  compareDecimal,
  divideDecimal,
  effectiveUnitPriceNet,
  multiplyDecimal,
  roundToDecimals,
} from "@bloqer/utils";

export type PurchaseVarianceTier =
  | "NONE"
  | "NOTE_REQUIRED"
  | "EXTRA_APPROVAL"
  | "UNIT_MISMATCH"
  | "NO_BUDGET_BASELINE";

export type BudgetRefKind = "UNIT_PRICE" | "GLOBAL_PARTIDA" | "NONE";

export type VarianceLineInput = {
  unit: string;
  unitPrice: string;
  discountPct?: string;
  budgetUnitCost: string | null;
  budgetUnit: string | null;
  varianceJustification?: string | null;
};

export type VarianceLineResult = {
  variancePct: string | null;
  varianceTier: PurchaseVarianceTier;
  varianceUnitMismatch: boolean;
  requiresJustification: boolean;
  requiresExtraApproval: boolean;
};

export type VarianceSettings = {
  varianceSoftAlertPct: string;
  varianceExtraApprovalPct: string;
};

/** Company defaults ([BR-PUR-009]); submit uses live política when available. */
export const DEFAULT_VARIANCE_SETTINGS: VarianceSettings = {
  varianceSoftAlertPct: "10",
  varianceExtraApprovalPct: "25",
};

/**
 * A lump-sum partida (`gl`) is a total, not a $/u. Comparing it to a physical
 * PO line (un, kg, m2…) is not a unit mismatch and must not use the partida
 * total as the line referential ([BR-PUR-009], COST_FORMULAS §4.1).
 */
export function isComparablePurchaseBaseline(
  lineUnit: string,
  budgetUnit: string | null | undefined,
): boolean {
  if (!budgetUnit?.trim()) return true;
  if (isGlobalUnit(budgetUnit) && !isGlobalUnit(lineUnit)) return false;
  return true;
}

export function resolveBudgetRefKind(
  lineUnit: string,
  budgetUnit: string | null | undefined,
  budgetUnitCost: string | null | undefined,
): BudgetRefKind {
  if (!isComparablePurchaseBaseline(lineUnit, budgetUnit)) return "GLOBAL_PARTIDA";
  try {
    if (budgetUnitCost && compareDecimal(budgetUnitCost, "0") !== 0) return "UNIT_PRICE";
  } catch {
    return "NONE";
  }
  return "NONE";
}

export function varianceJustificationReasonEs(tier: PurchaseVarianceTier | string): string {
  if (tier === "UNIT_MISMATCH") return "unidad distinta al presupuesto";
  if (tier === "NO_BUDGET_BASELINE") return "sin referencial de partida";
  if (tier === "EXTRA_APPROVAL") return "precio muy por encima del referencial";
  if (tier === "NOTE_REQUIRED") return "precio por encima del referencial";
  return "precio por encima del referencial";
}

export function formatMissingVarianceJustificationError(lineHints: string[]): string {
  if (lineHints.length === 0) {
    return "Completá la justificación de desvío presupuestario en las líneas. Entrá a Editar y usá el campo Justificación desvío.";
  }
  const shown = lineHints.slice(0, 4);
  const extra = lineHints.length - shown.length;
  const list = shown.join("; ");
  const suffix = extra > 0 ? `; y ${extra} más` : "";
  return `Completá la justificación de desvío en: ${list}${suffix}. Entrá a Editar y usá el campo Justificación desvío de cada línea.`;
}

function normalizeUnit(u: string): string {
  return u.trim().toLowerCase();
}

const NEUTRAL_VARIANCE: VarianceLineResult = {
  variancePct: null,
  varianceTier: "NONE",
  varianceUnitMismatch: false,
  requiresJustification: false,
  requiresExtraApproval: false,
};

/**
 * Server path (submit / authorize). Invalid decimals or settings must fail
 * the mutation — never silently skip [BR-PUR-009].
 */
export function evaluateLineVariance(
  line: VarianceLineInput,
  settings: VarianceSettings,
): VarianceLineResult {
  return evaluateLineVarianceUnsafe(line, settings);
}

/**
 * Editor / DRAFT hydrate. Incomplete prices (`12.`) must not crash the page
 * or look like a desvío.
 */
export function evaluateLineVarianceLenient(
  line: VarianceLineInput,
  settings: VarianceSettings,
): VarianceLineResult {
  try {
    return evaluateLineVarianceUnsafe(line, settings);
  } catch {
    return NEUTRAL_VARIANCE;
  }
}

function evaluateLineVarianceUnsafe(
  line: VarianceLineInput,
  settings: VarianceSettings,
): VarianceLineResult {
  const soft = settings.varianceSoftAlertPct;
  const extra = settings.varianceExtraApprovalPct;

  if (!isComparablePurchaseBaseline(line.unit, line.budgetUnit)) {
    return NEUTRAL_VARIANCE;
  }

  if (line.budgetUnit && normalizeUnit(line.unit) !== normalizeUnit(line.budgetUnit)) {
    const needsNote = compareDecimal(line.unitPrice.trim() || "0", "0") > 0;
    return {
      variancePct: null,
      varianceTier: "UNIT_MISMATCH",
      varianceUnitMismatch: true,
      requiresJustification: needsNote,
      requiresExtraApproval: false,
    };
  }

  const baselineRaw = line.budgetUnitCost?.trim() || "";
  const baseline = baselineRaw && compareDecimal(baselineRaw, "0") !== 0 ? baselineRaw : null;
  const price = effectiveUnitPriceNet({
    quantity: "1",
    unitPriceNet: line.unitPrice.trim() || "0",
    discountPct: line.discountPct ?? "0",
  });

  if (!baseline) {
    const priced = compareDecimal(price, "0") > 0;
    return {
      variancePct: null,
      varianceTier: priced ? "NO_BUDGET_BASELINE" : "NONE",
      varianceUnitMismatch: false,
      requiresJustification: priced,
      requiresExtraApproval: false,
    };
  }

  const pct = multiplyDecimal(
    divideDecimal(addDecimal(price, multiplyDecimal(baseline, "-1")), baseline, 8),
    "100",
  );
  const variancePct = roundToDecimals(pct, 4);

  if (compareDecimal(pct, soft) < 0) {
    return {
      variancePct,
      varianceTier: "NONE",
      varianceUnitMismatch: false,
      requiresJustification: false,
      requiresExtraApproval: false,
    };
  }

  if (compareDecimal(pct, extra) < 0) {
    return {
      variancePct,
      varianceTier: "NOTE_REQUIRED",
      varianceUnitMismatch: false,
      requiresJustification: true,
      requiresExtraApproval: false,
    };
  }

  return {
    variancePct,
    varianceTier: "EXTRA_APPROVAL",
    varianceUnitMismatch: false,
    requiresJustification: true,
    requiresExtraApproval: true,
  };
}
