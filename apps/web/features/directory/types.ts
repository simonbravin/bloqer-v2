import type { Contact, ContactRole } from "@bloqer/database";

export type ContactWithRoles = Contact & { roles: ContactRole[] };

const CONTACT_ROLE_LABELS: Record<string, string> = {
  CLIENT: "Cliente", SUPPLIER: "Proveedor", SUBCONTRACTOR: "Subcontratista", EMPLOYEE: "Empleado", OTHER: "Otro",
};

export function contactRoleLabel(role: string): string {
  return CONTACT_ROLE_LABELS[role] ?? role;
}

export function activeContactRoles(roles: ContactRole[]): ContactRole[] {
  return roles.filter((r) => r.status === "ACTIVE");
}
