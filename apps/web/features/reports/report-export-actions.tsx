"use client";

import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readReportDownload, reportDownloadHref, type ReportDownloadFormat } from "./report-download";

type SearchParamsLike = Record<string, string | string[] | undefined>;

type Props = {
  exportPath: string;
  params: SearchParamsLike;
  /** When true, shows Exportar menu with CSV + PDF. Use `pdfOnly` when the route only supports PDF. */
  pdf?: boolean;
  pdfOnly?: boolean;
  /** When true, adds XLSX to the export menu (requires route support). */
  xlsx?: boolean;
  /** When false, hides CSV from the menu. Defaults to true when the menu is shown. */
  csv?: boolean;
  /** Button / menu label. Defaults: "Exportar CSV" | "Exportar PDF" | "Exportar". */
  label?: string;
};

export function ReportExportActions({
  exportPath,
  params,
  pdf = false,
  pdfOnly = false,
  xlsx = false,
  csv = true,
  label,
}: Props) {
  const [downloading, setDownloading] = useState(false);

  async function downloadExport(format: ReportDownloadFormat) {
    setDownloading(true);
    try {
      const response = await fetch(reportDownloadHref(exportPath, params, format), { credentials: "same-origin" });
      const { blob, filename } = await readReportDownload(response, format);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la exportación");
    } finally {
      setDownloading(false);
    }
  }

  if (pdfOnly) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={() => void downloadExport("pdf")}
      >
        {downloading ? "Generando…" : (label ?? "Exportar PDF")}
      </Button>
    );
  }

  const useMenu = pdf || xlsx;
  if (!useMenu) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={() => void downloadExport("csv")}
      >
        {downloading ? "Generando…" : (label ?? "Exportar CSV")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2" disabled={downloading}>
          <Download className="h-4 w-4" aria-hidden />
          {downloading ? "Generando…" : (label ?? "Exportar")}
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {csv ? (
          <DropdownMenuItem
            onSelect={() => void downloadExport("csv")}
            className="flex cursor-pointer items-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            CSV
          </DropdownMenuItem>
        ) : null}
        {xlsx ? (
          <DropdownMenuItem
            onSelect={() => void downloadExport("xlsx")}
            className="flex cursor-pointer items-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Excel
          </DropdownMenuItem>
        ) : null}
        {pdf ? (
          <DropdownMenuItem
            onSelect={() => void downloadExport("pdf")}
            className="flex cursor-pointer items-center gap-2"
          >
            <FileText className="h-4 w-4" aria-hidden />
            PDF
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
