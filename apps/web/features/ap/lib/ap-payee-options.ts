import type { SupplierOption } from "../components/supplier-invoice-form";

/** List filter for AP payees without a purchase order ([D-089]). */
export const LIST_AP_DIRECT_PAYEES = {
  roles: ["SUPPLIER", "EMPLOYEE"] as ("SUPPLIER" | "EMPLOYEE")[],
  status: "ACTIVE" as const,
};

export const AP_PAYEE_PICKER_HINT =
  "Solo contactos con rol Proveedor o Empleado activo. Buscá por nombre fantasía o razón social. Si no aparece, asignale ese rol en su ficha del Directorio.";

const PAYEE_ROLE_LABEL: Record<string, string> = {
  SUPPLIER: "Proveedor",
  EMPLOYEE: "Empleado",
};

function payeeSearchValue(parts: (string | null | undefined)[]): string {
  return [...new Set(parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)))].join(" ");
}

export function toApPayeeOption(contact: {
  id: string;
  legalName: string;
  fantasyName: string | null;
  country?: string | null;
  ivaCondition?: string | null;
  roles?: { role: string }[];
}): SupplierOption {
  const name = contact.fantasyName ?? contact.legalName;
  const tags = [...new Set(
    (contact.roles ?? [])
      .map((r) => PAYEE_ROLE_LABEL[r.role])
      .filter((label): label is string => Boolean(label)),
  )];
  return {
    id: contact.id,
    label: tags.length > 0 ? `${name} · ${tags.join(" · ")}` : name,
    country: contact.country ?? undefined,
    ivaCondition: contact.ivaCondition,
    searchValue: payeeSearchValue([name, contact.legalName, contact.fantasyName, ...tags]),
  };
}

/** Keep the current invoice payee selectable (e.g. subcontractor-only contacts). */
export function withCurrentApPayee(
  options: SupplierOption[],
  current: { id: string; name: string },
): SupplierOption[] {
  if (options.some((o) => o.id === current.id)) return options;
  return [{ id: current.id, label: current.name }, ...options];
}
