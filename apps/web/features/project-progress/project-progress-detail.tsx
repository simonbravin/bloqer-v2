"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Search } from "lucide-react";
import type { ProjectProgressReport, ProjectProgressRow } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMoneyDisplay,
  formatQtyWithUnit,
  formatRatePctWithSymbol,
  isPositiveQty,
} from "@/lib/format-money";

const PAGE_SIZE = 20;
const PENDING_LABELS: Record<string, string> = {
  PHYSICAL_MISSING: "Sin medición",
  PHYSICAL_REMAINING: "Por ejecutar",
  CERTIFICATION_PENDING: "Por certificar",
  CERTIFICATION_APPROVAL: "Certificados por aprobar",
  INVOICE_PENDING: "Por facturar",
  SCHEDULE_DELAYED: "Tareas atrasadas",
  SCHEDULE_BLOCKED: "Tareas bloqueadas",
  RECEIVABLE_OVERDUE: "Cobros vencidos",
  JOBSITE_PENDING: "Libro por aprobar",
  COST_UNALLOCATED: "Sin imputación EDT",
  COST_OVERRUN: "Costo excedido",
};

export function ProjectProgressPending({ report }: { report: ProjectProgressReport }) {
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const kinds = [...new Set(report.pending.map((item) => item.kind))];
  const filtered = kind ? report.pending.filter((item) => item.kind === kind) : report.pending;
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card className="rounded-xl" id="pendientes">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Pendientes para avanzar</CardTitle>
            <CardDescription>
              Cada hallazgo abre su evidencia o el lugar donde resolverlo. Las tareas muestran la
              situación actual del proyecto completo.
            </CardDescription>
          </div>
          <div className="w-full sm:w-auto">
            <Label htmlFor="progress-pending-kind" className="sr-only">
              Tipo de pendiente
            </Label>
            <select
              id="progress-pending-kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs sm:w-56"
            >
              <option value="">Todos los pendientes ({report.pending.length})</option>
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {PENDING_LABELS[value] ?? "Otros pendientes"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
            No se detectaron pendientes con los datos y permisos disponibles para este alcance.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-start justify-between gap-3 rounded-lg border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="min-w-0 space-y-1.5">
                  <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {PENDING_LABELS[item.kind] ?? "Pendiente"}
                  </span>
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                  {item.date ? (
                    <p className="text-xs text-muted-foreground">
                      Fecha: {formatDate(`${item.date}T12:00:00.000Z`)}
                    </p>
                  ) : null}
                  {item.amount !== undefined ? (
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoneyDisplay(item.amount, report.currency)}
                    </p>
                  ) : null}
                  {item.qty !== undefined ? (
                    <p className="text-sm font-semibold tabular-nums">
                      {formatQtyWithUnit(item.qty, item.unit)}
                    </p>
                  ) : null}
                </div>
                <ArrowUpRight
                  className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        )}
        <Pagination page={page} count={filtered.length} onPage={setPage} />
      </CardContent>
    </Card>
  );
}

export function ProjectProgressDetail({ report }: { report: ProjectProgressReport }) {
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const query = search.trim().toLocaleLowerCase("es-AR");
  const rows = report.rows.filter((row) => {
    const matches =
      !query ||
      `${row.wbsCode} ${row.wbsName} ${row.budgetName}`.toLocaleLowerCase("es-AR").includes(query);
    const hasPending =
      row.issues.length > 0 ||
      isPositiveQty(row.physicalRemainingQty) ||
      isPositiveQty(row.pendingCertifyQty);
    return matches && (!pendingOnly || hasPending);
  });
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card className="min-w-0 rounded-xl" id="partidas">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Detalle por partida</CardTitle>
            <CardDescription>
              Unidades propias de cada partida. Los porcentajes y costos conservan sus bases.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-64">
              <Search
                className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                aria-label="Buscar partida por código o nombre"
                placeholder="Buscar partida…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-9 pl-8"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(event) => {
                  setPendingOnly(event.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Sólo con pendientes
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay partidas para estos filtros.
          </p>
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {visible.map((row) => (
                <article key={`${row.budgetId}:${row.wbsNodeId}`} className="rounded-lg border p-4">
                  <PartidaLabel row={row} />
                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
                    <Metric label="Plan al corte" value={formatRatePctWithSymbol(row.planPct)} />
                    <Metric
                      label="Libro aprobado"
                      value={formatRatePctWithSymbol(row.physicalPct)}
                    />
                    <Metric
                      label="Por ejecutar"
                      value={formatQtyWithUnit(row.physicalRemainingQty, row.unit)}
                    />
                    <Metric
                      label="Por certificar"
                      value={formatQtyWithUnit(row.pendingCertifyQty, row.unit)}
                    />
                    <Metric
                      label="Certificado"
                      value={formatQtyWithUnit(row.certifiedQty, row.unit)}
                    />
                    <Metric
                      label="Costo devengado"
                      value={formatMoneyDisplay(row.costAccrued, report.currency)}
                    />
                  </dl>
                  <details className="mt-4 border-t pt-3 text-xs">
                    <summary className="cursor-pointer font-medium text-primary">
                      Ver importes y observaciones
                    </summary>
                    <dl className="mt-3 grid grid-cols-2 gap-3">
                      <Metric
                        label="Venta presupuestada"
                        value={formatMoneyDisplay(row.budgetSale, report.currency)}
                      />
                      <Metric
                        label="Costo presupuestado"
                        value={formatMoneyDisplay(row.budgetCost, report.currency)}
                      />
                      <Metric
                        label="Monto certificado"
                        value={formatMoneyDisplay(row.certifiedAmount, report.currency)}
                      />
                      <Metric
                        label="Monto por certificar"
                        value={formatMoneyDisplay(row.pendingCertifyAmount, report.currency)}
                      />
                      <Metric
                        label="Exposición"
                        value={formatMoneyDisplay(row.costExposure, report.currency)}
                      />
                      <Metric
                        label="Pagado"
                        value={formatMoneyDisplay(row.costPaid, report.currency)}
                      />
                    </dl>
                    <RowIssues issues={row.issues} />
                  </details>
                </article>
              ))}
            </div>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partida / presupuesto</TableHead>
                    <TableHead className="text-right">Plan al corte</TableHead>
                    <TableHead className="text-right">Libro aprobado</TableHead>
                    <TableHead className="text-right">Por ejecutar</TableHead>
                    <TableHead className="text-right">Certificado</TableHead>
                    <TableHead className="text-right">Por certificar</TableHead>
                    <TableHead className="text-right">Costos · {report.currency}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={`${row.budgetId}:${row.wbsNodeId}`}>
                      <TableCell className="min-w-56 max-w-80 whitespace-normal align-top">
                        <PartidaLabel row={row} />
                        <RowIssues issues={row.issues} />
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {formatRatePctWithSymbol(row.planPct)}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        <p>{formatRatePctWithSymbol(row.physicalPct)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatQtyWithUnit(row.physicalQty, row.unit)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        <p>{formatQtyWithUnit(row.physicalRemainingQty, row.unit)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatRatePctWithSymbol(row.physicalRemainingPct)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        <p>{formatQtyWithUnit(row.certifiedQty, row.unit)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatMoneyDisplay(row.certifiedAmount, report.currency)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        <p>{formatQtyWithUnit(row.pendingCertifyQty, row.unit)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatMoneyDisplay(row.pendingCertifyAmount, report.currency)}
                        </p>
                      </TableCell>
                      <TableCell className="text-right align-top text-xs tabular-nums">
                        <p>
                          <span className="text-muted-foreground">Presup. </span>
                          {formatMoneyDisplay(row.budgetCost, report.currency)}
                        </p>
                        <p className="mt-1">
                          <span className="text-muted-foreground">Deveng. </span>
                          {formatMoneyDisplay(row.costAccrued, report.currency)}
                        </p>
                        <p className="mt-1">
                          <span className="text-muted-foreground">Expos. </span>
                          {formatMoneyDisplay(row.costExposure, report.currency)}
                        </p>
                        <p className="mt-1">
                          <span className="text-muted-foreground">Pagado </span>
                          {formatMoneyDisplay(row.costPaid, report.currency)}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        <Pagination page={page} count={rows.length} onPage={setPage} />
        <p className="mt-4 text-xs text-muted-foreground">
          «—» indica información no disponible o sin acceso. Las cantidades de unidades diferentes
          no se suman.
        </p>
      </CardContent>
    </Card>
  );
}

function PartidaLabel({ row }: { row: ProjectProgressRow }) {
  return (
    <div className="min-w-0">
      <Link href={row.href} className="font-medium text-primary hover:underline">
        {row.wbsCode} · {row.wbsName}
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        {row.budgetName} · {formatQtyWithUnit(row.budgetQty, row.unit)} presupuestados
      </p>
    </div>
  );
}

function RowIssues({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400">
      {issues.map((issue, index) => (
        <li key={index}>{issue}</li>
      ))}
    </ul>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Pagination({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  if (count <= PAGE_SIZE) return null;
  const pages = Math.ceil(count / PAGE_SIZE);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        {count} resultados · página {page} de {pages}
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page === pages}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
