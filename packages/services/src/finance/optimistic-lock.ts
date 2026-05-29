import { ServiceError } from "../types";

/** Optimistic lock: updateMany must affect exactly one row or the txn aborts with CONFLICT. */
export function assertOptimisticRowUpdate(updateCount: number, conflictMessage: string): void {
  if (updateCount !== 1) {
    throw new ServiceError("CONFLICT", conflictMessage);
  }
}
