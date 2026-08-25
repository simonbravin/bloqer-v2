import type { Contact, ContactRole } from "@bloqer/database";

export type ContactWithRoles = Contact & { roles: ContactRole[] };

export function activeContactRoles(roles: ContactRole[]): ContactRole[] {
  return roles.filter((r) => r.status === "ACTIVE");
}
