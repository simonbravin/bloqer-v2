"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/export-csv";

export function ExportCsvButton({
  filename,
  headers,
  rows,
  label = "Exportar CSV",
  disabled,
}: {
  filename: string;
  headers: string[];
  rows: string[][];
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || rows.length === 0}
      className="gap-1.5"
      onClick={() => downloadCsv(filename, headers, rows)}
    >
      <Download className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
