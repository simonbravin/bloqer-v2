"use client";

import { ExportCsvButton } from "@/components/ui/export-csv-button";
import type { ProjectWithClient } from "@bloqer/services";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  ON_HOLD: "En pausa",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

const TYPE_LABELS: Record<string, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
};

export function ProjectListExportButton({ projects }: { projects: ProjectWithClient[] }) {
  const rows = projects.map((p) => [
    p.code ?? "",
    p.name,
    p.client.fantasyName ?? p.client.legalName,
    TYPE_LABELS[p.type] ?? p.type,
    STATUS_LABELS[p.status] ?? p.status,
  ]);

  return (
    <ExportCsvButton
      filename="proyectos.csv"
      headers={["Código", "Nombre", "Cliente", "Tipo", "Estado"]}
      rows={rows}
    />
  );
}
