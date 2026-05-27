"use client";

import { ExportCsvButton } from "@/components/ui/export-csv-button";
import type { ContactWithRoles } from "@/features/directory/types";

export function ContactListExportButton({ contacts }: { contacts: ContactWithRoles[] }) {
  const rows = contacts.map((c) => [
    c.legalName,
    c.fantasyName ?? "",
    c.taxId ?? "",
    c.email ?? "",
    c.roles.map((r) => r.role).join("; "),
    c.status === "ACTIVE" ? "Activo" : "Archivado",
  ]);

  return (
    <ExportCsvButton
      filename="directorio.csv"
      headers={["Razón social", "Nombre fantasía", "CUIT", "Email", "Roles", "Estado"]}
      rows={rows}
    />
  );
}
