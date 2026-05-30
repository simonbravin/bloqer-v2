"use client";

import Link from "next/link";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
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
};

export function ReportExportActions({ exportPath, params, pdf = false, pdfOnly = false }: Props) {
  const qs = buildQuery(params);
  const csvHref = qs ? `${exportPath}?${qs}` : exportPath;
  const pdfHref = `${exportPath}?${buildQuery(params, { format: "pdf" })}`;

  if (pdfOnly) {
    return (
      <Button type="button" variant="outline" size="sm" asChild>
        <Link href={pdfHref} prefetch={false} target="_blank" rel="noopener noreferrer">
          Exportar PDF
        </Link>
      </Button>
    );
  }

  if (!pdf) {
    return (
      <Button type="button" variant="outline" size="sm" asChild>
        <Link href={csvHref} prefetch={false}>
          Exportar CSV
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" aria-hidden />
          Exportar
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={csvHref} prefetch={false} className="flex cursor-pointer items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            CSV
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={pdfHref}
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            className="flex cursor-pointer items-center gap-2"
          >
            <FileText className="h-4 w-4" aria-hidden />
            PDF
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** @deprecated Use ReportExportActions */
export function ReportCsvExportLink(props: { exportPath: string; params: SearchParamsLike }) {
  return <ReportExportActions exportPath={props.exportPath} params={props.params} />;
}

/** @deprecated Use ReportExportActions with pdf */
export function ReportPdfExportLink(props: { exportPath: string; params: SearchParamsLike }) {
  return <ReportExportActions exportPath={props.exportPath} params={props.params} pdfOnly />;
}
