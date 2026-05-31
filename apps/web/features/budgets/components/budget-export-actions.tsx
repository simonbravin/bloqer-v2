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
import { useBudgetWbsViewMode, type WbsViewMode } from "../lib/wbs-view-mode";

type Props = {
  projectId: string;
  budgetId: string;
};

function buildExportHref(
  projectId: string,
  budgetId: string,
  view: WbsViewMode,
  format: "csv" | "xlsx" | "pdf",
): string {
  const params = new URLSearchParams({ view, format });
  return `/api/reports/proyectos/${projectId}/presupuestos/${budgetId}/export?${params.toString()}`;
}

export function BudgetExportActions({ projectId, budgetId }: Props) {
  const { viewMode } = useBudgetWbsViewMode();
  const csvHref = buildExportHref(projectId, budgetId, viewMode, "csv");
  const xlsxHref = buildExportHref(projectId, budgetId, viewMode, "xlsx");
  const pdfHref = buildExportHref(projectId, budgetId, viewMode, "pdf");

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
          <Link href={xlsxHref} prefetch={false} className="flex cursor-pointer items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Excel
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
