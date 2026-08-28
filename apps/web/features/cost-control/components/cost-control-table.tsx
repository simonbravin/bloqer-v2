"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import type { CostControlFilters, CostControlRow, CostControlTotals } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoneyAmount } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { CostVarianceBadge } from "./cost-variance-badge";
import { WbsItemDrilldownDialog } from "./wbs-item-drilldown-dialog";
import {
  ALL_EDT_COLUMNS,
  columnsForPreset,
  defaultEdtPresetState,
  EDT_COLUMN_LABELS,
  EDT_PRESET_LABELS,
  persistEdtPresetState,
  readEdtPresetState,
  type EdtColumnId,
  type EdtPresetId,
  type EdtPresetState,
} from "../lib/edt-column-presets";

const COLUMN_HINTS: Partial<Record<EdtColumnId, string>> = {
  committed:
    "Compromisos firmes: OC confirmadas y subcontratos activos. Aún no necesariamente facturados.",
  received:
    "Recepción física confirmada (cant. × PU de la OC). Informativo; no suma a la exposición.",
  accrued:
    "Obligación reconocida: facturas de proveedor emitidas y certificaciones de subcontrato aprobadas.",
  paid: "Pagos confirmados imputables a esta partida.",
  consumed:
    "Consumo de inventario (stock OUT CONFIRMED / CONSUMPTION) imputado a la partida. No suma a la exposición esperada.",
  openCommitted:
    "Comprometido abierto = max(0, Comprometido − Devengado ligado al mismo compromiso). Evita doble conteo OC+factura.",
  exposure:
    "Exposición esperada = Devengado + Comprometido abierto (anti doble conteo). No suma OC + factura en bruto.",
  pctPurchased: "Comprometido ÷ presupuesto de costo × 100.",
  pctPhysical: "Cantidad recibida ÷ cantidad presupuestada × 100.",
  pctEconomic: "Devengado ÷ presupuesto de costo × 100.",
  pctExposure: "Exposición esperada ÷ presupuesto de costo × 100.",
};

function HintHead({ label, hint }: { label: string; hint?: string }) {
  if (!hint) {
    return <TableHead className="text-right">{label}</TableHead>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TableHead className="text-right cursor-help underline decoration-dotted decoration-muted-foreground/50">
          {label}
        </TableHead>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

function PctPill({ value }: { value: string | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const n = Number(value);
  const tone =
    n > 105
      ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
      : n >= 90
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums", tone)}>
      {value}%
    </span>
  );
}

type DrilldownFilters = Pick<CostControlFilters, "budgetId" | "dateFrom" | "dateTo">;

type Props = {
  rows: CostControlRow[];
  totals: CostControlTotals;
  projectId: string;
  filters?: DrilldownFilters;
};

function itemPageHref(projectId: string, wbsNodeId: string, filters?: DrilldownFilters) {
  const sp = new URLSearchParams();
  if (filters?.budgetId) sp.set("budgetId", filters.budgetId);
  if (filters?.dateFrom) sp.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) sp.set("dateTo", filters.dateTo);
  const q = sp.toString();
  return `/proyectos/${projectId}/control-costos/${wbsNodeId}${q ? `?${q}` : ""}`;
}

function isModifiedClick(e: MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function cellValue(row: CostControlRow, col: EdtColumnId): ReactNode {
  switch (col) {
    case "budgetCost":
      return formatMoneyAmount(row.budgetTotalCost);
    case "budgetSale":
      return formatMoneyAmount(row.budgetTotalSale);
    case "certified":
      return (
        <>
          {formatMoneyAmount(row.certifiedApproved)}
          {row.flags.overCertified ? <span className="ml-1 text-destructive">!</span> : null}
        </>
      );
    case "committed":
      return formatMoneyAmount(row.committedCost);
    case "received":
      return formatMoneyAmount(row.receivedCost);
    case "accrued":
      return formatMoneyAmount(row.accruedCost);
    case "paid":
      return formatMoneyAmount(row.paidCost);
    case "consumed":
      return formatMoneyAmount(row.inventoryConsumedCost);
    case "openCommitted":
      return formatMoneyAmount(row.openCommittedCost);
    case "exposure":
      return formatMoneyAmount(row.expectedCostExposure);
    case "variance":
      return (
        <CostVarianceBadge variance={row.costVariance} label={formatMoneyAmount(row.costVariance)} />
      );
    case "physicalProgress":
      return row.operationalProgressQty;
    case "qtyBudgeted":
      return row.budgetQty;
    case "qtyCommitted":
      return row.qtyCommitted;
    case "qtyReceived":
      return row.qtyReceived;
    case "qtyConsumed":
      return row.qtyConsumed;
    case "pctPurchased":
      return <PctPill value={row.pctPurchased} />;
    case "pctPhysical":
      return <PctPill value={row.pctPhysical} />;
    case "pctEconomic":
      return <PctPill value={row.pctEconomic} />;
    case "pctExposure":
      return <PctPill value={row.pctExposure} />;
    default:
      return null;
  }
}

function totalValue(
  totals: CostControlTotals,
  col: EdtColumnId,
  rows: CostControlRow[],
): ReactNode {
  switch (col) {
    case "budgetCost":
      return formatMoneyAmount(totals.budgetTotalCost);
    case "budgetSale":
      return formatMoneyAmount(totals.budgetTotalSale);
    case "certified":
      return formatMoneyAmount(totals.certifiedApproved);
    case "committed":
      return formatMoneyAmount(totals.committedCost);
    case "received":
      return formatMoneyAmount(totals.receivedCost);
    case "accrued":
      return formatMoneyAmount(totals.accruedCost);
    case "paid":
      return formatMoneyAmount(totals.paidCost);
    case "consumed":
      return formatMoneyAmount(totals.inventoryConsumedCost);
    case "openCommitted":
      return formatMoneyAmount(totals.openCommittedCost);
    case "exposure":
      return formatMoneyAmount(totals.expectedCostExposure);
    case "variance":
      return formatMoneyAmount(totals.costVariance);
    case "physicalProgress":
      return totals.operationalProgressQty;
    case "qtyBudgeted": {
      const s = rows.reduce((a, r) => a + Number(r.budgetQty || 0), 0);
      return s.toFixed(4);
    }
    case "qtyCommitted": {
      const s = rows.reduce((a, r) => a + Number(r.qtyCommitted || 0), 0);
      return s.toFixed(4);
    }
    case "qtyReceived": {
      const s = rows.reduce((a, r) => a + Number(r.qtyReceived || 0), 0);
      return s.toFixed(4);
    }
    case "qtyConsumed": {
      const s = rows.reduce((a, r) => a + Number(r.qtyConsumed || 0), 0);
      return s.toFixed(4);
    }
    default:
      // % columns: footer blank (sum of % is meaningless)
      return null;
  }
}

function EdtRowCard({
  row,
  columns,
  projectId,
  filters,
  onOpen,
}: {
  row: CostControlRow;
  columns: EdtColumnId[];
  projectId: string;
  filters?: DrilldownFilters;
  onOpen: (row: CostControlRow) => void;
}) {
  const href = itemPageHref(projectId, row.wbsNodeId, filters);
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={cn(
        "w-full rounded-lg border bg-card p-3 text-left space-y-2",
        row.flags.overBudget && "border-red-300 dark:border-red-800",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={href}
            className="font-mono text-xs font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.wbsCode}
          </Link>
          <p className="truncate text-sm font-medium">{row.wbsName}</p>
        </div>
        <CostVarianceBadge
          variance={row.costVariance}
          label={formatMoneyAmount(row.costVariance)}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {columns.slice(0, 8).map((col) => (
          <div key={col} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{EDT_COLUMN_LABELS[col]}</dt>
            <dd className="tabular-nums text-right">{cellValue(row, col)}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}

export function CostControlTable({ rows, totals, projectId, filters = {} }: Props) {
  const [openItem, setOpenItem] = useState<CostControlRow | null>(null);
  const [presetState, setPresetState] = useState<EdtPresetState>(defaultEdtPresetState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPresetState(readEdtPresetState(projectId));
    setHydrated(true);
  }, [projectId]);

  function updatePreset(next: EdtPresetState) {
    setPresetState(next);
    persistEdtPresetState(projectId, next);
  }

  const columns = columnsForPreset(presetState);

  function openFromList(e: MouseEvent, row: CostControlRow) {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setOpenItem(row);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <div className="space-y-1">
            <Label className="text-xs">Vista de columnas</Label>
            <Select
              value={presetState.preset}
              onValueChange={(v) => {
                const preset = v as EdtPresetId;
                updatePreset({
                  ...presetState,
                  preset,
                  customColumns:
                    preset === "custom"
                      ? presetState.customColumns
                      : columnsForPreset({ ...presetState, preset }),
                });
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EDT_PRESET_LABELS) as EdtPresetId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {EDT_PRESET_LABELS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {presetState.preset === "custom" && hydrated ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-w-3xl">
              {ALL_EDT_COLUMNS.map((col) => {
                const checked = presetState.customColumns.includes(col);
                return (
                  <label key={col} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v
                          ? [...presetState.customColumns, col]
                          : presetState.customColumns.filter((c) => c !== col);
                        updatePreset({ preset: "custom", customColumns: next });
                      }}
                    />
                    {EDT_COLUMN_LABELS[col]}
                  </label>
                );
              })}
            </div>
          ) : null}
          {!hydrated ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => updatePreset(defaultEdtPresetState())}
            >
              Restablecer
            </Button>
          )}
        </div>

        {/* Mobile cards */}
        <div className="grid gap-2 md:hidden">
          {rows.map((row) => (
            <EdtRowCard
              key={row.wbsNodeId}
              row={row}
              columns={columns}
              projectId={projectId}
              filters={filters}
              onOpen={setOpenItem}
            />
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <TableScroll stickyFirstColumn>
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/50">
                <TableRow>
                  <TableHead className="w-28">EDT</TableHead>
                  <TableHead>Ítem</TableHead>
                  {columns.map((col) => (
                    <HintHead
                      key={col}
                      label={EDT_COLUMN_LABELS[col]}
                      hint={COLUMN_HINTS[col]}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.wbsNodeId}
                    className={cn(
                      "cursor-pointer",
                      row.flags.overBudget && "bg-red-50/50 dark:bg-red-950/10",
                    )}
                    onClick={(e) => {
                      if (isModifiedClick(e)) return;
                      setOpenItem(row);
                    }}
                  >
                    <TableCell className="font-mono font-medium">
                      <Link
                        href={itemPageHref(projectId, row.wbsNodeId, filters)}
                        className="hover:underline text-primary"
                        onClick={(e) => openFromList(e, row)}
                      >
                        {row.wbsCode}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      <Link
                        href={itemPageHref(projectId, row.wbsNodeId, filters)}
                        className="hover:underline"
                        onClick={(e) => openFromList(e, row)}
                      >
                        {row.wbsName}
                      </Link>
                      {row.flags.missingBudget && (
                        <span className="ml-1 text-yellow-600 text-xs">(sin análisis)</span>
                      )}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell
                        key={col}
                        className={cn(
                          "text-right",
                          col === "exposure" && "font-medium",
                          [
                            "committed",
                            "received",
                            "accrued",
                            "paid",
                            "consumed",
                            "openCommitted",
                            "budgetSale",
                            "physicalProgress",
                          ].includes(col) && "text-muted-foreground",
                        )}
                      >
                        {cellValue(row, col)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={2}>Total</TableCell>
                  {columns.map((col) => (
                    <TableCell key={col} className="text-right">
                      {totalValue(totals, col, rows)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            </Table>
          </TableScroll>
        </div>
      </div>

      <WbsItemDrilldownDialog
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null);
        }}
        projectId={projectId}
        wbsNodeId={openItem?.wbsNodeId ?? null}
        wbsCode={openItem?.wbsCode ?? ""}
        wbsName={openItem?.wbsName ?? ""}
        filters={filters}
      />
    </TooltipProvider>
  );
}
