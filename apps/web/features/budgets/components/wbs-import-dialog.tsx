"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { readSpreadsheetFile } from "../lib/read-spreadsheet";
import type { BudgetImportRow } from "@bloqer/validators";

export type WbsImportPreview = {
  valid: boolean;
  rows: (BudgetImportRow & { _row: number })[];
  errors: { row: number; field: string; message: string }[];
  warnings: { row: number; message: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasExistingNodes: boolean;
  onPreview: (rawRows: unknown[][]) => Promise<WbsImportPreview | { error: string }>;
  onExecute: (
    rows: BudgetImportRow[],
    options: { replaceExisting: boolean },
  ) => Promise<{ createdNodes: number; createdItems: number } | { error: string }>;
  onSuccess?: () => void;
};

export function WbsImportDialog({
  open,
  onOpenChange,
  hasExistingNodes,
  onPreview,
  onExecute,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<WbsImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const reset = useCallback(() => {
    setFileName(null);
    setPreview(null);
    setConfirmed(false);
    setReplaceExisting(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setConfirmed(false);

    startTransition(async () => {
      try {
        const rawRows = await readSpreadsheetFile(file);
        const result = await onPreview(rawRows);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setPreview(result);
        if (!result.valid) {
          toast.error("Hay errores en el archivo. Revisá la vista previa.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo leer el archivo");
      }
    });
  };

  const handleImport = () => {
    if (!preview?.valid || !confirmed) return;
    if (hasExistingNodes && !replaceExisting) {
      toast.error("Marcá reemplazar estructura o eliminá los nodos existentes.");
      return;
    }

    startTransition(async () => {
      const rows = preview.rows.map(({ _row: _, ...row }) => row);
      const result = await onExecute(rows, { replaceExisting: hasExistingNodes && replaceExisting });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Importados ${result.createdNodes} nodos (${result.createdItems} ítems)`,
      );
      handleOpenChange(false);
      onSuccess?.();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar estructura WBS</DialogTitle>
          <DialogDescription>
            Columna A: numeración (ej. ARQ 1, ARQ 1.1, ARQ 1.1.1). Columna B: descripción.
            Columna C: unidad (solo ítems hoja). No se importan importes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-4">
            <Label
              htmlFor="wbs-import-file"
              className="flex cursor-pointer flex-col items-center gap-2 text-sm text-muted-foreground"
            >
              <Upload className="h-8 w-8" />
              <span>{fileName ?? "Seleccionar CSV o Excel (.xlsx)"}</span>
              <input
                id="wbs-import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                disabled={isPending}
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </Label>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Cómo interpretamos el archivo</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>1–2 segmentos sin unidad → capítulo o subcapítulo (GROUP)</li>
              <li>3 segmentos o unidad en columna C → ítem hoja (ITEM)</li>
              <li>Profundidad máxima: 3 niveles (ej. 1 → 1.1 → 1.1.1)</li>
            </ul>
          </div>

          {hasExistingNodes && (
            <div className="flex items-start gap-2">
              <input
                id="replace-wbs"
                type="checkbox"
                className="mt-1"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              <Label htmlFor="replace-wbs" className="text-sm leading-snug cursor-pointer">
                Reemplazar toda la estructura WBS existente (no se puede deshacer)
              </Label>
            </div>
          )}

          {preview && preview.errors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive mb-2">Errores</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {preview.errors.map((e, i) => (
                  <li key={i} className="text-destructive">
                    Fila {e.row}, {e.field}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview && preview.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium mb-1">Advertencias</p>
              <ul className="space-y-0.5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>Fila {w.row}: {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {preview && preview.rows.length > 0 && (
            <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Código</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-16">Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 50).map((row) => (
                    <TableRow key={row.code}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="text-xs">{row.type === "GROUP" ? "Capítulo" : "Ítem"}</TableCell>
                      <TableCell className="text-sm truncate max-w-[200px]">{row.name}</TableCell>
                      <TableCell className="text-xs">{row.unit ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.rows.length > 50 && (
                <p className="text-xs text-muted-foreground p-2 border-t">
                  … y {preview.rows.length - 50} filas más
                </p>
              )}
            </div>
          )}

          <div className="flex items-start gap-2">
            <input
              id="confirm-import"
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              disabled={!preview?.valid}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <Label htmlFor="confirm-import" className="text-sm leading-snug cursor-pointer">
              Entiendo que Bloqer usa la columna A como jerarquía y no importa montos del archivo
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!preview?.valid || !confirmed || isPending}
          >
            {isPending ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
