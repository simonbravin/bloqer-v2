/**
 * AccountMovement rows that must NOT generate a treasury GL draft —
 * cash is already represented by COLLECTION / PAYMENT journals (or opening balance).
 * [D-061]
 *
 * Client-safe (no Prisma / server-only) for ledger UI imports.
 */
const SKIP_TREASURY_GL_SOURCES: ReadonlySet<string> = new Set([
  "COLLECTION",
  "PAYMENT",
  "OPENING_BALANCE",
]);

export function treasuryMovementSourceSupportsAccountingDraft(
  sourceType: string | null | undefined,
): boolean {
  if (!sourceType) return true;
  return !SKIP_TREASURY_GL_SOURCES.has(sourceType);
}

export function treasuryMovementTypeSupportsAccountingDraft(type: string): boolean {
  return type === "INFLOW" || type === "OUTFLOW" || type === "TRANSFER_IN" || type === "TRANSFER_OUT";
}

export function treasuryMovementSupportsAccountingDraft(params: {
  type: string;
  sourceType: string | null | undefined;
}): boolean {
  return (
    treasuryMovementTypeSupportsAccountingDraft(params.type) &&
    treasuryMovementSourceSupportsAccountingDraft(params.sourceType)
  );
}
