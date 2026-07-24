/**
 * EDT column counts for view modes ([D-058], [D-059], [D-060] colspan).
 * Pure — used by web WBS table and tests.
 */

export type WbsTableViewMode = {
  base: "cost" | "sale";
  scale: "unit" | "total";
  detail: "compact" | "breakdown";
  /** Independent of money axes — adds Incidencia % before actions. */
  showIncidence?: boolean;
};

/** Fixed EDT columns: Nº, Ítem, Unidad, Cantidad. */
export const WBS_FIXED_COLUMN_COUNT = 4;

/** Trailing actions column (always rendered). */
export const WBS_ACTIONS_COLUMN_COUNT = 1;

/**
 * Money columns for current EDT view.
 * - cost + breakdown → 5 (MAT, MO, EQ, SUB, CD)
 * - otherwise → 1 (compact cost or sale)
 */
export function wbsMoneyColumnCount(viewMode: WbsTableViewMode): number {
  if (viewMode.base === "cost" && viewMode.detail === "breakdown") {
    return 5;
  }
  return 1;
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
