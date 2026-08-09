/** Statuses that impact reported treasury balances ([ACCOUNT_MOVEMENTS.md] / [D-075]). */
export const BALANCE_AFFECTING_MOVEMENT_STATUSES = ["CONFIRMED", "RECONCILED"] as const;

export type BalanceAffectingMovementStatus =
  (typeof BALANCE_AFFECTING_MOVEMENT_STATUSES)[number];
