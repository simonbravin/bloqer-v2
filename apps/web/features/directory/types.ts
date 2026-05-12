import type { Contact, ContactRole } from "@bloqer/database";

export type ContactWithRoles = Contact & { roles: ContactRole[] };
