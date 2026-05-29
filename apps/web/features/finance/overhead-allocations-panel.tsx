"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanyOverheadSettings, ProjectOverheadAllocationView } from "@bloqer/services";
import {
  createOverheadAllocationAction,
  deleteOverheadAllocationAction,
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

type ProjectOption = { id: string; code: string; name: string };

type Props = {
  companyId: string;
  settings: CompanyOverheadSettings;
  allocations: ProjectOverheadAllocationView[];
  projects: ProjectOption[];
  canEdit: boolean;
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
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(settings.overheadAllocationPct);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [period, setPeriod] = useState(currentPeriod());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
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
          <p className="text-xs text-muted-foreground w-full">
            Empresa: {settings.companyName}
          </p>
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
                    currency: "ARS",
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
                        {p.code} — {p.name}
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
                <Label htmlFor="oh-amount">Monto (ARS)</Label>
                <Input
                  id="oh-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={pending}
                  required
                />
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

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
    </div>
  );
}
