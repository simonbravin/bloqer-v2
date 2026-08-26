/**
 * Pure mappers for SearchableCombobox — must stay free of "use client"
 * so Server Components can build options safely.
 */

export type SearchableComboboxOption = {
  value: string;
  label: string;
  /** Texto extra para filtrar (ej. razón social + nombre fantasía). */
  searchValue?: string;
};

/** Lowercase, strip diacritics, collapse spaces — for combobox / contact name match. */
export function foldSearchText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Search haystack: razón social and nombre fantasía (no CUIT, no role tags). */
export function contactNameSearchValue(
  legalName: string,
  fantasyName?: string | null,
): string {
  const legal = legalName.trim();
  const fantasy = fantasyName?.trim() || "";
  return [...new Set([legal, fantasy].filter(Boolean))].join(" ");
}

/** `Razón social (fantasía)` when they differ; otherwise just razón social. */
export function formatContactPickerLabel(
  legalName: string,
  fantasyName?: string | null,
): string {
  const legal = legalName.trim();
  const fantasy = fantasyName?.trim() || "";
  if (!fantasy) return legal;
  if (legal.localeCompare(fantasy, "es", { sensitivity: "accent" }) === 0) return legal;
  return `${legal} (${fantasy})`;
}

export function toContactPickerOption(contact: {
  id: string;
  legalName: string;
  fantasyName?: string | null;
  country?: string | null;
  ivaCondition?: string | null;
}): {
  id: string;
  label: string;
  searchValue: string;
  country?: string;
  ivaCondition?: string | null;
} {
  return {
    id: contact.id,
    label: formatContactPickerLabel(contact.legalName, contact.fantasyName),
    searchValue: contactNameSearchValue(contact.legalName, contact.fantasyName),
    country: contact.country ?? undefined,
    ivaCondition: contact.ivaCondition,
  };
}

/** Placeholder for directory contact pickers (legal + fantasy search). */
export const CONTACT_PICKER_SEARCH_PLACEHOLDER =
  "Buscar por razón social o nombre fantasía…";

/** Convierte opciones `{ id, label }` del directorio / AP / ventas. */
export function toSearchableOptions(
  items: { id: string; label: string; searchValue?: string }[],
): SearchableComboboxOption[] {
  return items.map((item) => ({
    value: item.id,
    label: item.label,
    searchValue: item.searchValue ?? item.label,
  }));
}

/** Contactos con fantasy + legal name para búsqueda. */
export function contactsToSearchableOptions(
  contacts: { id: string; fantasyName?: string | null; legalName: string }[],
): SearchableComboboxOption[] {
  return contacts.map((c) => ({
    value: c.id,
    label: formatContactPickerLabel(c.legalName, c.fantasyName),
    searchValue: contactNameSearchValue(c.legalName, c.fantasyName),
  }));
}

/** Valor interno para opción vacía en campos opcionales (WBS, OC, depósito, etc.). */
export const SEARCHABLE_NONE = "__none__";

export function withNoneOption(
  options: SearchableComboboxOption[],
  none: { label: string; value?: string } = { label: "Sin asignación" },
): SearchableComboboxOption[] {
  const value = none.value ?? SEARCHABLE_NONE;
  return [{ value, label: none.label, searchValue: none.label }, ...options];
}

export function wbsToSearchableOptions(
  items: { id: string; code: string; name: string; budgetName?: string; unit?: string }[],
): SearchableComboboxOption[] {
  return items.map((w) => {
    let label = `${w.code} — ${w.name}`;
    if (w.unit) label += ` (${w.unit})`;
    if (w.budgetName) label += ` (${w.budgetName})`;
    return {
      value: w.id,
      label,
      searchValue: `${w.code} ${w.name} ${w.unit ?? ""} ${w.budgetName ?? ""}`,
    };
  });
}

export function productsToSearchableOptions(
  items: { id: string; sku: string; name: string }[],
): SearchableComboboxOption[] {
  return items.map((p) => ({
    value: p.id,
    label: `[${p.sku}] ${p.name}`,
    searchValue: `${p.sku} ${p.name}`,
  }));
}

export function chartAccountsToSearchableOptions(
  accounts: { id: string; code: string; name: string }[],
): SearchableComboboxOption[] {
  return accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
    searchValue: `${a.code} ${a.name}`,
  }));
}

export function projectsToSearchableOptions(
  projects: { id: string; code: string; name: string; currency?: string }[],
): SearchableComboboxOption[] {
  return projects.map((p) => ({
    value: p.id,
    label: p.currency ? `${p.code} — ${p.name} (${p.currency})` : `${p.code} — ${p.name}`,
    searchValue: `${p.code} ${p.name}`,
  }));
}
