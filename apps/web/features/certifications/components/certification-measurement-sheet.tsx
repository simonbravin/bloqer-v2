"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { previewCertificationMeasurement } from "@bloqer/services/certification-measurement-pure";
import type { CertificationMeasurementRow, CertificationMeasurementSheet } from "@bloqer/services";
import type { SaveCertificationMeasurementInput } from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctWithSymbol,
} from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { buildMeasurementTree } from "../lib/measurement-tree";
import { CertificationMeasureForm } from "./certification-measure-form";

interface Props {
  sheet: CertificationMeasurementSheet;
  editable: boolean;
  onSave: (data: SaveCertificationMeasurementInput) => Promise<{ ok: true } | { error: string }>;
}
const pct = (value: string | null) => (value == null ? "—" : formatRatePctWithSymbol(value));

export function CertificationMeasurementWorksheet({ sheet, editable, onSave }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [lock, setLock] = useState<string | null>(null);
  if (lock && lock !== sheet.revision) setLock(null);
  const active = sheet.rows.find((row) => row.wbsNodeId === activeId) ?? null;
  const byId = useMemo(() => new Map(sheet.rows.map((row) => [row.wbsNodeId, row])), [sheet.rows]);
  const entries = useMemo(
    () =>
      buildMeasurementTree(
        [
          ...sheet.groups.map((group) => ({ ...group, isGroup: true })),
          ...sheet.rows.map((row) => ({
            id: row.wbsNodeId,
            parentId: row.parentId,
            code: row.code,
            name: row.name,
            isGroup: false,
          })),
        ],
        query,
        collapsed,
      ),
    [sheet.groups, sheet.rows, query, collapsed],
  );
  const matchingItems = entries.filter((entry) => !entry.isGroup).length;

  function toggle(id: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-3" aria-label="Planilla de medición">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Planilla de medición</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {editable
              ? "Revisá el avance y certificá sólo lo pendiente. Los rubros agrupan las partidas."
              : "Mediciones guardadas en este certificado. El avance real es una referencia del libro al cierre del período."}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {sheet.rows.filter((row) => row.lineId).length} de {sheet.rows.length} partidas medidas
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-52 sm:w-auto sm:flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por código o nombre de partida…"
            aria-label="Buscar partidas"
            className="bg-card pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCollapsed(new Set())}
          disabled={!!query}
        >
          Expandir todo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCollapsed(new Set(sheet.groups.map((group) => group.id)))}
          disabled={!!query}
        >
          Contraer todo
        </Button>
        {query && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuery("")}>
            Limpiar
          </Button>
        )}
      </div>
      {sheet.rows.length === 0 ? (
        <ListEmptyState
          title="Sin partidas"
          description={
            editable
              ? "El presupuesto no tiene partidas para certificar."
              : "Este certificado no contiene mediciones."
          }
        />
      ) : entries.length === 0 ? (
        <ListEmptyState
          title="Sin coincidencias"
          description="Probá con otro código o nombre de partida."
        />
      ) : (
        <TableScroll>
          <Table className="min-w-[880px] [&_td]:py-2 [&_th]:text-xs">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Partida</TableHead>
                <TableHead
                  className="text-right"
                  title="Cantidad en otros certificados emitidos o aprobados / presupuesto"
                >
                  Cert. previo
                </TableHead>
                <TableHead
                  className="text-right"
                  title="Avance físico del libro aprobado hasta el fin del período"
                >
                  Avance real
                </TableHead>
                <TableHead className="text-right" title="Cantidad de este período">
                  Cant. período
                </TableHead>
                <TableHead
                  className="text-right"
                  title="Porcentaje físico guardado en este certificado, independiente de la cantidad económica"
                >
                  Físico período
                </TableHead>
                <TableHead
                  className="text-right"
                  title="Cantidad previa + este certificado sobre cantidad presupuestada"
                >
                  Acumulado
                </TableHead>
                <TableHead className="text-right">Monto · {sheet.currency}</TableHead>
                {editable && (
                  <TableHead className="w-20">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) =>
                entry.isGroup ? (
                  <TableRow key={entry.id} className="bg-muted/50 hover:bg-muted/70">
                    <TableCell colSpan={editable ? 8 : 7}>
                      <button
                        type="button"
                        className="flex min-h-8 w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ paddingLeft: entry.depth * 16 }}
                        aria-expanded={!!query || !collapsed.has(entry.id)}
                        onClick={() => toggle(entry.id)}
                        disabled={!!query}
                      >
                        {!!query || !collapsed.has(entry.id) ? (
                          <ChevronDown className="size-4 shrink-0" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0" />
                        )}
                        <span className="font-mono text-xs font-semibold">{entry.code}</span>
                        <span className="max-w-[70vw] truncate font-medium" title={entry.name}>
                          {entry.name}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {entry.itemCount} {entry.itemCount === 1 ? "partida" : "partidas"}
                        </span>
                      </button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <SheetRow
                    key={entry.id}
                    row={byId.get(entry.id)!}
                    depth={entry.depth}
                    editable={editable}
                    disabled={lock != null}
                    onMeasure={() => setActiveId(entry.id)}
                  />
                ),
              )}
            </TableBody>
          </Table>
        </TableScroll>
      )}
      {query && (
        <p role="status" className="text-xs text-muted-foreground">
          {matchingItems} {matchingItems === 1 ? "partida encontrada" : "partidas encontradas"}. La
          búsqueda muestra sus rubros.
        </p>
      )}
      <Dialog
        open={active != null}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
          {active && (
            <CertificationMeasureForm
              key={`${active.wbsNodeId}:${sheet.revision}`}
              sheet={sheet}
              row={active}
              onSave={onSave}
              onClose={() => setActiveId(null)}
              onSaved={() => {
                setLock(sheet.revision);
                setActiveId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SheetRow({
  row,
  depth,
  editable,
  disabled,
  onMeasure,
}: {
  row: CertificationMeasurementRow;
  depth: number;
  editable: boolean;
  disabled: boolean;
  onMeasure: () => void;
}) {
  const included = row.lineId != null;
  const preview = previewCertificationMeasurement({
    ...row,
    currentQty: row.currentQty ?? "0",
    physicalPct: row.physicalPct ?? "0",
  });
  return (
    <TableRow>
      <TableCell className="w-full min-w-72 max-w-0">
        <div className="flex items-center gap-2" style={{ paddingLeft: Math.min(depth, 4) * 16 }}>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.code}</span>
          <span className="truncate" title={`${row.code} — ${row.name}`}>
            {row.name}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {row.unit || "—"}
          </span>
        </div>
      </TableCell>
      <TableCell
        className="text-right font-mono text-xs"
        title={`${formatQtyFromString(row.previousQty)} ${row.unit} certificados`}
      >
        {pct(row.previousPct)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {pct(row.suggestions[0]?.progressPct ?? null)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {included ? formatQtyFromString(row.currentQty!) : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {included ? pct(row.physicalPct) : "—"}
      </TableCell>
      <TableCell
        className={cn("text-right font-mono text-xs", preview.overQuantity && "text-destructive")}
      >
        {pct(preview.cumulativePct)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-medium">
        {included ? formatMoneyAmount(row.currentAmount!) : "—"}
      </TableCell>
      {editable && (
        <TableCell>
          <Button
            type="button"
            variant={included ? "ghost" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={onMeasure}
            aria-label={`${included ? "Editar" : "Medir"} ${row.code}`}
          >
            {included ? "Editar" : "Medir"}
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
