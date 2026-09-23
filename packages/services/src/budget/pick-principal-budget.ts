/**
 * Default contractual budget for screens that show one phase ([D-116]).
 * Prefer the APPROVED root. If the principal was replaced, the newer root
 * wins over an older CLOSED one. An addendum is the fallback only when no root
 * is APPROVED or CLOSED.
 */
export type PrincipalBudgetCandidate = {
  status: string;
  versionNumber: number;
  parentBudgetId: string | null;
};

export function pickPrincipalContractualBudget<T extends PrincipalBudgetCandidate>(
  rows: T[],
): T | null {
  const contractual = rows.filter((row) => row.status === "APPROVED" || row.status === "CLOSED");
  if (contractual.length === 0) return null;

  const roots = contractual.filter((row) => row.parentBudgetId == null);
  const approvedRoot = highestVersion(roots.filter((row) => row.status === "APPROVED"));
  if (approvedRoot) return approvedRoot;

  const closedRoot = highestVersion(roots.filter((row) => row.status === "CLOSED"));
  if (closedRoot) return closedRoot;

  return highestVersion(contractual);
}

function highestVersion<T extends PrincipalBudgetCandidate>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => (row.versionNumber >= best.versionNumber ? row : best));
}
