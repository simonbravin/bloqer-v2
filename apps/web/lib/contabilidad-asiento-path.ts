/** Deep link to journal detail; multi-company memberships need `?empresa=` for company scope. */
export function contabilidadAsientoHref(
  journalEntryId: string,
  journalCompanyId: string,
  membershipCompanyId: string | null | undefined,
): string {
  const base = `/contabilidad/asientos/${journalEntryId}`;
  if (!membershipCompanyId) {
    return `${base}?empresa=${encodeURIComponent(journalCompanyId)}`;
  }
  return base;
}
