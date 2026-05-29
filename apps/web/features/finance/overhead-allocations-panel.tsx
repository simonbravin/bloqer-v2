"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  AutoWeightPeriodPreview,
  CompanyOverheadSettings,
  ProjectOverheadAllocationView,
} from "@bloqer/services";
import {
  createOverheadAllocationAction,
  deleteOverheadAllocationAction,
  fetchAutoWeightPreviewAction,
  updateCompanyOverheadModeAction,
  updateCompanyOverheadPctAction,
} from "@/app/(app)/finanzas/gastos-generales/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoneyAmount } from "@/lib/format-money";

type ProjectOption = { id: string; code: string; name: string; currency: string };

type Props = {
  companyId: string;
  settings: CompanyOverheadSettings;
  allocations: ProjectOverheadAllocationView[];
  projects: ProjectOption[];
  canEdit: boolean;
  initialAutoPreview: AutoWeightPeriodPreview | null;
};

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function OverheadAllocationsPanel({
  companyId,
  settings,
  allocations,
  projects,
  canEdit,
  initialAutoPreview,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState(settings.overheadAllocationMode);
  const [pct, setPct] = useState(settings.overheadAllocationPct);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [period, setPeriod] = useState(currentPeriod());
  const [previewPeriod, setPreviewPeriod] = useState(initialAutoPreview?.period ?? currentPeriod());
  const [autoPreview, setAutoPreview] = useState<AutoWeightPeriodPreview | null>(initialAutoPreview);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const isAuto = mode === "AUTO_WEIGHT";

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );
  const allocationCurrency = selectedProject?.currency ?? "ARS";

  useEffect(() => {
    if (!projectId && projects[0]?.id) setProjectId(projects[0].id);
  }, [projects, projectId]);

  useEffect(() => {
    setMode(settings.overheadAllocationMode);
    setPct(settings.overheadAllocationPct);
  }, [settings.overheadAllocationMode, settings.overheadAllocationPct]);

  useEffect(() => {
    if (settings.overheadAllocationMode === "AUTO_WEIGHT" && initialAutoPreview) {
      setAutoPreview(initialAutoPreview);
      setPreviewPeriod(initialAutoPreview.period);
    }
  }, [settings.overheadAllocationMode, initialAutoPreview]);

  function refresh() {
    router.refresh();
  }

  function loadAutoPreview(periodKey: string) {
    startTransition(async () => {
      setError(null);
      const res = await fetchAutoWeightPreviewAction({ companyId, period: periodKey });
      if ("error" in res) setError(res.error);
      else setAutoPreview(res.preview);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/30 p-4 text-sm space-y-2">
        <p className="font-medium text-foreground">Cómo se imputa GG a la obra (D-040)</p>
        <p className="text-muted-foreground">
          Los <strong>gastos generales de empresa</strong> (oficina, vehículos, servicios sin proyecto)
          se cargan con facturas <em>sin obra</em> en el asistente de abajo. Acá elegís el método para
          repartir ese costo corporativo entre proyectos.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Método de imputación</CardTitle>
          <CardDescription>
            Manual: montos por obra y/o % sobre CD devengado. Automático: reparte el pool de facturas
            corporativas del mes según el peso del costo directo devengado de cada obra (Q-013 opción 3).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[220px]">
            <Label>Modo</Label>
            <Select
              value={mode}
              disabled={!canEdit || pending}
              onValueChange={(v) => {
                const next = v as "MANUAL" | "AUTO_WEIGHT";
                setMode(next);
                if (!canEdit) return;
                setError(null);
                startTransition(async () => {
                  const res = await updateCompanyOverheadModeAction({
                    companyId,
                    overheadAllocationMode: next,
                  });
                  if ("error" in res) {
                    setError(res.error);
                    setMode(settings.overheadAllocationMode);
                  } else {
                    refresh();
                    if (next === "AUTO_WEIGHT") loadAutoPreview(previewPeriod);
                  }
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual (% empresa + imputaciones)</SelectItem>
                <SelectItem value="AUTO_WEIGHT">Automático por peso del CD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground w-full">Empresa: {settings.companyName}</p>
        </CardContent>
      </Card>

      {isAuto ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Prorrateo automático por peso del CD</CardTitle>
            <CardDescription>
              Pool = facturas corporativas emitidas en el período (ARS). Cada obra recibe pool × (CD obra
              / CD total empresa en el mes).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="preview-period">Período</Label>
                <Input
                  id="preview-period"
                  pattern="\d{4}-\d{2}"
                  className="w-36 font-mono"
                  value={previewPeriod}
                  disabled={pending}
                  onChange={(e) => setPreviewPeriod(e.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => loadAutoPreview(previewPeriod)}>
                Actualizar vista
              </Button>
            </div>

            {autoPreview ? (
              <>
                <div className="grid gap-2 sm:grid-cols-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Pool corporativo:</span>{" "}
                    <span className="font-mono tabular-nums">
                      {formatMoneyAmount(autoPreview.poolArs, "ARS")}
                    </span>
                    <span className="text-muted-foreground text-xs"> ({autoPreview.invoiceCount} facturas)</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">CD total empresa:</span>{" "}
                    <span className="font-mono tabular-nums">
                      {formatMoneyAmount(autoPreview.totalAccruedCd, "ARS")}
                    </span>
                  </p>
                </div>
                {autoPreview.warnings.length > 0 ? (
                  <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1 list-disc pl-4">
                    {autoPreview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
                {autoPreview.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay proyectos activos en esta empresa.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proyecto</TableHead>
                        <TableHead className="text-right">CD devengado</TableHead>
                        <TableHead className="text-right">Peso</TableHead>
                        <TableHead className="text-right">GG asignado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {autoPreview.rows.map((row) => (
                        <TableRow key={row.projectId}>
                          <TableCell>
                            <span className="font-mono text-xs">{row.projectCode}</span>
                            <span className="text-muted-foreground"> — {row.projectName}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-xs">
                            {formatMoneyAmount(row.accruedCd, "ARS")}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-xs">
                            {row.weightPct}%
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatMoneyAmount(row.allocatedAmount, "ARS")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Elegí un período y actualizá la vista.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Prorrateo automático (% empresa)</CardTitle>
              <CardDescription>
                Se aplica sobre el <strong>costo directo devengado</strong> de cada obra (D-040). Distinto
                del % GG del presupuesto de venta.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="overhead-pct">% sobre CD devengado</Label>
                <Input
                  id="overhead-pct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className="w-32"
                  value={pct}
                  disabled={!canEdit || pending}
                  onChange={(e) => setPct(e.target.value)}
                />
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const parsed = parseFloat(pct);
                      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                        setError("El porcentaje debe estar entre 0 y 100");
                        return;
                      }
                      const res = await updateCompanyOverheadPctAction({
                        companyId,
                        overheadAllocationPct: parsed,
                      });
                      if ("error" in res) setError(res.error);
                      else refresh();
                    });
                  }}
                >
                  Guardar %
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Imputaciones manuales a obra</CardTitle>
              <CardDescription>
                Un monto por proyecto y período (<code className="text-xs">YYYY-MM</code>). Alimenta el
                margen neto en rentabilidad del proyecto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canEdit && projects.length > 0 ? (
                <form
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    startTransition(async () => {
                      const res = await createOverheadAllocationAction({
                        companyId,
                        projectId,
                        period,
                        amount,
                        currency: allocationCurrency,
                        notes: notes.trim() || null,
                      });
                      if ("error" in res) setError(res.error);
                      else {
                        setAmount("");
                        setNotes("");
                        refresh();
                      }
                    });
                  }}
                >
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Proyecto</Label>
                    <Select value={projectId} onValueChange={setProjectId} disabled={pending}>
                      <SelectTrigger>
                        <SelectValue placeholder="Elegir proyecto" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} — {p.name} ({p.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="oh-period">Período</Label>
                    <Input
                      id="oh-period"
                      pattern="\d{4}-\d{2}"
                      placeholder="2026-05"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      disabled={pending}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="oh-amount">Monto ({allocationCurrency})</Label>
                    <Input
                      id="oh-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={pending}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Moneda del presupuesto aprobado del proyecto.
                    </p>
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                    <Label htmlFor="oh-notes">Notas (opcional)</Label>
                    <Input
                      id="oh-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Button type="submit" disabled={pending || !projectId}>
                      Agregar imputación
                    </Button>
                  </div>
                </form>
              ) : null}

              {canEdit && projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay proyectos activos en esta empresa.</p>
              ) : null}

              {allocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin imputaciones registradas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Notas</TableHead>
                      {canEdit ? <TableHead className="w-24" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.period}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{row.projectCode}</span>
                          <span className="text-muted-foreground"> — {row.projectName}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMoneyAmount(row.amount, row.currency)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {row.notes ?? "—"}
                        </TableCell>
                        {canEdit ? (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => {
                                if (!confirm("¿Eliminar esta imputación?")) return;
                                setError(null);
                                startTransition(async () => {
                                  const res = await deleteOverheadAllocationAction(row.id);
                                  if ("error" in res) setError(res.error);
                                  else refresh();
                                });
                              }}
                            >
                              Eliminar
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
