import { listJournalEntriesSchema } from "@bloqer/validators";

export type EmpresaSearch = { empresa?: string };

/** Validates `?empresa=` UUID for accounting company scope (multi-company tenants). */
export function companyQueryFilter(sp: EmpresaSearch): { companyId?: string } {
  const parsed = listJournalEntriesSchema.safeParse({ companyId: sp.empresa ?? null });
  if (!parsed.success || !parsed.data.companyId) return {};
  return { companyId: parsed.data.companyId };
}
