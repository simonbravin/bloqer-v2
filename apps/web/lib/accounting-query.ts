/** Build `?dateFrom=&dateTo=&empresa=` for accounting deep links. */
export function accountingAccountHref(
  accountId: string,
  opts: { dateFrom?: string; dateTo?: string; empresa?: string },
): string {
  const q = new URLSearchParams();
  if (opts.dateFrom) q.set("dateFrom", opts.dateFrom);
  if (opts.dateTo) q.set("dateTo", opts.dateTo);
  if (opts.empresa) q.set("empresa", opts.empresa);
  const qs = q.toString();
  return `/contabilidad/cuentas/${accountId}${qs ? `?${qs}` : ""}`;
}
