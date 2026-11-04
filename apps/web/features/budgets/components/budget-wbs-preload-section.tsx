"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { previewSpreadsheetImport } from "@bloqer/services/budget-import-pure";
import type { BudgetImportRow } from "@bloqer/validators";
import { readSpreadsheetFile } from "../lib/read-spreadsheet";
import type { WbsImportPreview } from "./wbs-import-dialog";
import { useBudgetAction } from "../lib/use-budget-action";

type Props = {
  disabled?: boolean;
  onPendingRowsChange: (rows: BudgetImportRow[] | null) => void;
  onPendingChange?: (pending: boolean) => void;
};

export function BudgetWbsPreloadSection({ disabled, onPendingRowsChange, onPendingChange }: Props) {
  const { isPending, isRunning, run: startTransition } = useBudgetAction(toast.error, onPendingChange);
  const [expanded, setExpanded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<WbsImportPreview | null>(null);

  const handleFile = (file: File | null) => {
    if (!file || disabled || isRunning()) return;
    setFileName(file.name);
    setPreview(null);
    onPendingRowsChange(null);

    startTransition(async () => {
      try {
        const rawRows = await readSpreadsheetFile(file);
        const result = previewSpreadsheetImport(rawRows);
        setPreview(result);
        if (result.valid) {
          onPendingRowsChange(
            result.rows.map(({ _row, _parentResolved, ...row }) => {
              void _row;
              void _parentResolved;
              return row;
            }),
          );
        } else {
          onPendingRowsChange(null);
        }
      } catch (err) {
        setPreview(null);
        onPendingRowsChange(null);
        toast.error(err instanceof Error ? err.message : "No se pudo leer el archivo");
      }
    });
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40"
        onClick={() => setExpanded((v) => !v)}
        disabled={disabled}
      >
        Precargar estructura EDT (opcional)
        <span className="text-muted-foreground text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Columna A: numeración (ARQ 1, ARQ 1.1) o rubro (ARQ + nombre en B). Columna B: descripción.
            Sin unidades ni importes (unidad en el APU). Varios rubros generan códigos ARQ.1.1.1.
          </p>

          <Label
            htmlFor="budget-wbs-preload-file"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground"
          >
            <Upload className="h-6 w-6" />
            <span>{fileName ?? "CSV o Excel (.xlsx)"}</span>
            <input
              id="budget-wbs-preload-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              disabled={disabled || isPending}
              onChange={(e) => {
                handleFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </Label>
          {fileName && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled || isPending} onClick={() => {
              setFileName(null);
              setPreview(null);
              onPendingRowsChange(null);
            }}>
              Quitar archivo
            </Button>
          )}

          {preview && !preview.valid && (
            <p className="text-xs text-destructive">
              {preview.errors.length} error(es) en el archivo. Corregí y volvé a subir.
            </p>
          )}

          {preview?.valid && (
            <p className="text-xs text-green-700 dark:text-green-400">
              Listo: {preview.rows.length} nodos
              {preview.profile === "multi_discipline" ? " (multi-rubro)" : ""} se importarán al crear el
              presupuesto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
