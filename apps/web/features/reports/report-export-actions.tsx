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

type SearchParamsLike = Record<string, string | string[] | undefined>;

function buildQuery(params: SearchParamsLike, extra?: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === "") continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v) q.append(key, v);
      }
    } else {
      q.set(key, raw);
    }
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
    }
  }
  return q.toString();
}

type Props = {
  exportPath: string;
  params: SearchParamsLike;
  /** When true, shows a single Exportar menu with CSV + PDF. Use `pdfOnly` when the route only supports PDF. */
  pdf?: boolean;
  pdfOnly?: boolean;
  /** Button / menu label. Defaults: "Exportar CSV" | "Exportar PDF" | "Exportar". */
  label?: string;
};

export function ReportExportActions({
  exportPath,
  params,
  pdf = false,
  pdfOnly = false,
  label,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const qs = buildQuery(params);
  const csvHref = qs ? `${exportPath}?${qs}` : exportPath;
  const pdfHref = `${exportPath}?${buildQuery(params, { format: "pdf" })}`;

  async function downloadExport(href: string) {
    setDownloading(true);
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        const detail = contentType.includes("application/json")
          ? ((await response.json()) as { error?: string }).error
          : await response.text();
        throw new Error(detail || `No se pudo generar la exportación (${response.status})`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "reporte";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
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
        onClick={() => void downloadExport(pdfHref)}
      >
        {downloading ? "Generando…" : (label ?? "Exportar PDF")}
      </Button>
    );
  }

  if (!pdf) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={() => void downloadExport(csvHref)}
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
          {label ?? "Exportar"}
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onSelect={() => void downloadExport(csvHref)}
          className="flex cursor-pointer items-center gap-2"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void downloadExport(pdfHref)}
          className="flex cursor-pointer items-center gap-2"
        >
          <FileText className="h-4 w-4" aria-hidden />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
