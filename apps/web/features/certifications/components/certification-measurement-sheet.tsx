"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { addDecimal } from "@bloqer/utils";
import type { CertificationMeasurementSheet } from "@bloqer/services";
import type { SaveCertificationMeasurementInput } from "@bloqer/validators";
import {
  compareQty,
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctWithSymbol,
} from "@/lib/format-money";

type Sheet = CertificationMeasurementSheet;

type DraftCell = {
  included: boolean;
  currentQty: string;
  physicalPct: string;
};

function initialDraft(sheet: Sheet): Record<string, DraftCell> {
  const draft: Record<string, DraftCell> = {};
  for (const row of sheet.rows) {
    draft[row.wbsNodeId] = {
      included: row.lineId != null,
      currentQty: row.currentQty ?? "",
      physicalPct: row.physicalPct ?? "",
    };
  }
  return draft;
}

interface Props {
  sheet: Sheet;
  editable: boolean;
  onSave: (data: SaveCertificationMeasurementInput) => Promise<{ ok: true } | { error: string }>;
}

export function CertificationMeasurementWorksheet({ sheet, editable, onSave }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const signature = useMemo(
    () => sheet.rows.map((r) => `${r.wbsNodeId}:${r.lineId ?? ""}:${r.currentQty ?? ""}:${r.physicalPct ?? ""}`).join("|"),
    [sheet.rows],
  );
  const [draft, setDraft] = useState(() => initialDraft(sheet));
  const [seenSignature, setSeenSignature] = useState(signature);
  if (seenSignature !== signature) {
    setSeenSignature(signature);
    setDraft(initialDraft(sheet));
  }

  function patch(wbsNodeId: string, next: Partial<DraftCell>) {
    setDraft((prev) => ({
      ...prev,
      [wbsNodeId]: { ...prev[wbsNodeId]!, ...next },
    }));
  }

  function handleSave() {
    setError(null);
    const rows: SaveCertificationMeasurementInput["rows"] = [];
    for (const row of sheet.rows) {
      const cell = draft[row.wbsNodeId];
      if (!cell) continue;
      if (
        cell.included
        && cell.physicalPct.trim() !== ""
        && (compareQty(cell.physicalPct, "0") < 0 || compareQty(cell.physicalPct, "100") > 0)
      ) {
        setError("El % físico debe estar entre 0 y 100.");
        return;
      }
      if (cell.included && (cell.currentQty.trim() === "" || compareQty(cell.currentQty, "0") <= 0)) {
        setError("Indicá una cantidad mayor a 0 en cada partida incluida.");
        return;
      }
      rows.push({
        wbsNodeId: row.wbsNodeId,
        included: cell.included,
        currentQty: cell.currentQty.trim(),
        physicalPct: cell.physicalPct.trim(),
      });
    }
    startTransition(async () => {
      const result = await onSave({ certificationId: sheet.certificationId, rows });
      if ("error" in result) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Planilla guardada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Planilla de medición</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Libro y costo son referencia. La cantidad a certificar queda vacía hasta confirmarla.
          Usar libro del período copia el avance del período, topeado por el saldo contractual.
        </p>
        {!sheet.costAvailable ? (
          <p className="mt-1 text-xs text-muted-foreground">
            El costo del período no está disponible con el permiso de control de costos.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Comprometido, consumido, mano de obra, equipos y subcontratos son costo del período, en {sheet.currency}. No definen la cantidad a certificar.
          </p>
        )}
      </div>

      {sheet.rows.length === 0 ? (
        <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          El presupuesto no tiene partidas para certificar.
        </p>
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partida</TableHead>
                <TableHead className="text-right">Ppto.</TableHead>
                <TableHead className="text-right">Previa</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Libro acum.</TableHead>
                <TableHead className="text-right">Libro período</TableHead>
                <TableHead className="text-right">Comprom.</TableHead>
                <TableHead className="text-right">Consumo</TableHead>
                <TableHead className="text-right">M. obra</TableHead>
                <TableHead className="text-right">Equipos</TableHead>
                <TableHead className="text-right">Subcontr.</TableHead>
                <TableHead>Incluir</TableHead>
                <TableHead className="text-right">Cant. a certificar</TableHead>
                <TableHead className="text-right">% físico</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.rows.map((row) => {
                const cell = draft[row.wbsNodeId] ?? {
                  included: false,
                  currentQty: "",
                  physicalPct: "",
                };
                let over = false;
                try {
                  over = cell.currentQty.trim() !== "" && compareQty(
                    addDecimal(row.previousQty, cell.currentQty || "0"),
                    row.budgetQty,
                  ) > 0;
                } catch {
                  over = false;
                }
                return (
                  <TableRow key={row.wbsNodeId}>
                    <TableCell className="max-w-[220px]">
                      <p className="font-mono text-xs">{row.code}</p>
                      <p className="truncate text-sm">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">{row.unit || "—"}</p>
                    </TableCell>
                    <QtyCell value={row.budgetQty} />
                    <QtyCell value={row.previousQty} muted />
                    <QtyCell value={row.remainingQty} />
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatQtyFromString(row.logQtyAcum)}
                      <span className="block">{formatRatePctWithSymbol(row.logPctAcum)}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatQtyFromString(row.logQtyPeriod)}
                      <span className="block text-muted-foreground">{formatRatePctWithSymbol(row.logPctPeriod)}</span>
                    </TableCell>
                    <MoneyCell value={row.cost?.committedCost} />
                    <MoneyCell value={row.cost?.consumedCost} />
                    <MoneyCell value={row.cost?.laborCost} />
                    <MoneyCell value={row.cost?.equipmentCost} />
                    <MoneyCell value={row.cost?.subcontractCost} />
                    <TableCell>
                      <Checkbox
                        checked={cell.included}
                        disabled={!editable}
                        aria-label={`Incluir ${row.code}`}
                        onCheckedChange={(checked) => patch(row.wbsNodeId, { included: checked === true })}
                      />
                    </TableCell>
                    <TableCell className="min-w-[140px]">
                      {editable ? (
                        <div className="space-y-1">
                          <DecimalInput
                            scale={4}
                            value={cell.currentQty}
                            onValueChange={(currentQty) => patch(row.wbsNodeId, {
                              currentQty,
                              ...(currentQty.trim() !== "" && compareQty(currentQty, "0") > 0
                                ? { included: true }
                                : {}),
                            })}
                            aria-label={`Cantidad ${row.code}`}
                          />
                          {row.suggestedQty ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => patch(row.wbsNodeId, {
                                included: true,
                                currentQty: row.suggestedQty!,
                              })}
                            >
                              Usar libro del período
                            </Button>
                          ) : null}
                          {over ? (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400">
                              Supera el presupuesto. En obra pública la emisión se bloquea.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-right font-mono text-sm">
                          {cell.currentQty ? formatQtyFromString(cell.currentQty) : "—"}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[120px]">
                      {editable ? (
                        <div className="space-y-1">
                          <DecimalInput
                            scale={2}
                            value={cell.physicalPct}
                            onValueChange={(physicalPct) => patch(row.wbsNodeId, { physicalPct })}
                            aria-label={`Porcentaje físico ${row.code}`}
                          />
                          {row.suggestedPhysicalPct ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => patch(row.wbsNodeId, { physicalPct: row.suggestedPhysicalPct! })}
                            >
                              Aplicar % del libro
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-right font-mono text-sm">
                          {cell.physicalPct ? formatRatePctWithSymbol(cell.physicalPct) : "—"}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableScroll>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {editable && sheet.rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Las partidas sin incluir se quitan del certificado al guardar.
          </p>
          <Button type="button" disabled={pending} onClick={handleSave}>
            {pending ? "Guardando..." : "Guardar planilla"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function QtyCell({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <TableCell className={muted ? "text-right font-mono text-xs text-muted-foreground" : "text-right font-mono text-xs"}>
      {formatQtyFromString(value)}
    </TableCell>
  );
}

function MoneyCell({ value }: { value: string | undefined }) {
  return (
    <TableCell className="text-right font-mono text-xs text-muted-foreground">
      {value == null ? "—" : formatMoneyAmount(value)}
    </TableCell>
  );
}
