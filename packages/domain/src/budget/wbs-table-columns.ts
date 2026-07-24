/**
 * EDT column counts for view modes ([D-058], [D-059], [D-060] colspan).
 * Totals are always shown; unit columns are optional extras ([D-058] amend).
 */

export type WbsTableViewMode = {
  base: "cost" | "sale";
  /** @deprecated use showUnit — kept for export/legacy parse */
  scale?: "unit" | "total";
  /** When true, unit price columns appear alongside totals. */
  showUnit?: boolean;
  detail: "compact" | "breakdown";
  /** Independent of money axes — adds Incidencia % before actions. */
  showIncidence?: boolean;
};

/** Fixed EDT columns: Nº, Ítem, Unidad, Cantidad. */
export const WBS_FIXED_COLUMN_COUNT = 4;

/** Trailing actions column (always rendered). */
export const WBS_ACTIONS_COLUMN_COUNT = 1;

export function wbsShowUnit(viewMode: WbsTableViewMode): boolean {
  if (viewMode.showUnit !== undefined) return Boolean(viewMode.showUnit);
  return viewMode.scale === "unit";
}

/**
 * Money columns for current EDT view.
 * Totals always present; unit columns double the money block when showUnit.
 * - cost + breakdown → 5 (or 10 with unit)
 * - compact cost / sale → 1 (or 2 with unit)
 */
export function wbsMoneyColumnCount(viewMode: WbsTableViewMode): number {
  const unit = wbsShowUnit(viewMode);
  if (viewMode.base === "cost" && viewMode.detail === "breakdown") {
    return unit ? 10 : 5;
  }
  return unit ? 2 : 1;
}

export function wbsIncidenceColumnCount(viewMode: WbsTableViewMode): number {
  return viewMode.showIncidence ? 1 : 0;
}

/** Total `<TableCell>` count per data row (incl. actions). */
export function wbsTableColumnCount(viewMode: WbsTableViewMode): number {
  return (
    WBS_FIXED_COLUMN_COUNT +
    wbsMoneyColumnCount(viewMode) +
    wbsIncidenceColumnCount(viewMode) +
    WBS_ACTIONS_COLUMN_COUNT
  );
}
