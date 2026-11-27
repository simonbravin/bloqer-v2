"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DecimalInput, reportInvalidDecimalInputs } from "@/components/ui/decimal-input";
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
  addBankStatementLineAction,
  cancelBankReconciliationAction,
  closeBankReconciliationAction,
  createMovementFromStatementLineAction,
  importBankStatementCsvAction,
  importBankStatementOfxAction,
  matchBankReconciliationLineAction,
  removeBankStatementLineAction,
  reopenBankReconciliationAction,
  startBankReconciliationAction,
  unmatchBankReconciliationLineAction,
} from "@/app/(app)/tesoreria/conciliacion/actions";
import type { BankReconciliationView } from "@bloqer/services";
import { toast } from "sonner";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { ManualFxField } from "@/features/finance/components/manual-fx-field";
import {
  ConfirmAlertDialog,
  ReasonAlertDialog,
} from "@/components/ui/reason-alert-dialog";

type Candidate = {
  id: string;
  movementDate: Date | string;
  valueDate: Date | string | null;
  type: string;
  amount: string;
  description: string;
  status: string;
};

interface Props {
  session: BankReconciliationView;
  candidates: Candidate[];
  canEdit: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  INFLOW: "Ingreso",
  OUTFLOW: "Egreso",
  TRANSFER_IN: "Transferencia entrada",
  TRANSFER_OUT: "Transferencia salida",
  ADJUSTMENT: "Ajuste",
  OPENING_BALANCE: "Saldo inicial",
};

type PendingDialog =
  | { kind: "close" }
  | { kind: "cancel-open" }
  | { kind: "cancel-closed" }
  | { kind: "reopen" }
  | { kind: "create-movement"; lineId: string; dirLabel: string; amount: string }
  | { kind: "remove-line"; lineId: string };

const PAGE_SIZE = 10;

function ReconciliationPager({ page, total, pending, onPage }: { page: number; total: number; pending: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
    <span>Página {page} de {pages} · {total} resultados</span>
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={pending || page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
      <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={pending || page >= pages} onClick={() => onPage(page + 1)}>Siguiente</Button>
    </div>
  </div>;
}

export function BankReconciliationWorkspace({ session, candidates, canEdit }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { pending: isPending, run: runOperation, isBusy } = useOperationalAction({ onError: setError });
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [lineFilter, setLineFilter] = useState<"pending" | "all">(session.status === "DRAFT" || session.status === "IN_PROGRESS" ? "pending" : "all");
  const [lineSearch, setLineSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [linePage, setLinePage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [lineAmount, setLineAmount] = useState("");
  const [movementFxRate, setMovementFxRate] = useState("");
  const [movementFxError, setMovementFxError] = useState<string | null>(null);
  const movementFieldsRef = useRef<HTMLDivElement>(null);
  const movementPanelRef = useRef<HTMLElement>(null);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);

  const editable = canEdit && (session.status === "DRAFT" || session.status === "IN_PROGRESS");
  const viewOnlyEditableStatus =
    !canEdit && (session.status === "DRAFT" || session.status === "IN_PROGRESS");

  const selectedLine = useMemo(
    () => session.lines.find((l) => l.id === selectedLineId) ?? null,
    [session.lines, selectedLineId],
  );

  const filteredCandidates = useMemo(() => {
    if (!selectedLine) return candidates;
    return candidates.filter((m) => {
      const isInflow = m.type === "INFLOW" || m.type === "TRANSFER_IN";
      const directionOk = selectedLine.direction === "CREDIT" ? isInflow : !isInflow;
      return directionOk && m.amount === selectedLine.amount;
    });
  }, [candidates, selectedLine]);

  const pendingLineCount = session.lines.filter((line) => !line.match).length;
  const visibleLines = session.lines.filter((line) => (lineFilter === "all" || !line.match)
    && `${line.description} ${line.reference ?? ""}`.toLocaleLowerCase("es-AR").includes(lineSearch.trim().toLocaleLowerCase("es-AR")));
  const visibleCandidates = filteredCandidates.filter((movement) => movement.description.toLocaleLowerCase("es-AR").includes(movementSearch.trim().toLocaleLowerCase("es-AR")));
  const currentLinePage = Math.min(linePage, Math.max(1, Math.ceil(visibleLines.length / PAGE_SIZE)));
  const currentMovementPage = Math.min(movementPage, Math.max(1, Math.ceil(visibleCandidates.length / PAGE_SIZE)));
  // A refreshed candidate list must invalidate a stale selection before enabling confirmation.
  const selectedMovement = visibleCandidates.find((movement) => movement.id === selectedMovementId) ?? null;

  function clearSelection() {
    setSelectedLineId(null);
    setSelectedMovementId(null);
    setMovementSearch("");
    setMovementPage(1);
  }

  function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    successToast?: string,
  ) {
    if (isBusy()) return Promise.resolve();
    setError(null);
    return runOperation(async () => {
      const res = await action();
      if ("error" in res) {
        setError(res.error);
        toast.error(res.error);
      } else {
        setDialog(null);
        setSelectedLineId(null);
        setSelectedMovementId(null);
        if (successToast) toast.success(successToast);
        router.refresh();
      }
    });
  }

  function handleAddLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    run(async () => {
      const res = await addBankStatementLineAction({
        reconciliationId: session.id,
        lineDate: fd.get("lineDate") as string,
        description: String(fd.get("description") ?? "").trim(),
        amount: String(fd.get("amount") ?? "").trim(),
        direction,
        reference: String(fd.get("reference") ?? "").trim() || null,
      });
      if (!("error" in res)) {
        form.reset();
        setLineAmount("");
      }
      return res;
    });
  }

  function handleCsvFile(file: File | null) {
    if (!file || isBusy()) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Solo se admite archivo .csv");
      return;
    }
    setError(null);
    void runOperation(async () => {
      try {
        const csvText = await file.text();
        const res = await importBankStatementCsvAction({
          reconciliationId: session.id,
          csvText,
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const parts: string[] = [];
        if (res.skippedOutOfPeriod > 0) parts.push(`${res.skippedOutOfPeriod} fuera de período`);
        if (res.skippedDuplicates > 0) parts.push(`${res.skippedDuplicates} duplicadas`);
        const skipMsg = parts.length > 0 ? ` (${parts.join(", ")} omitidas)` : "";
        toast.success(`Importadas ${res.importedCount} líneas${skipMsg}. Sesión en progreso.`);
        router.refresh();
      } catch {
        setError("No se pudo leer el archivo CSV");
      }
    });
  }

  function handleOfxFile(file: File | null) {
    if (!file || isBusy()) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".ofx") && !lower.endsWith(".qfx")) {
      setError("Solo se admite archivo .ofx o .qfx");
      return;
    }
    setError(null);
    void runOperation(async () => {
      try {
        const ofxText = await file.text();
        const res = await importBankStatementOfxAction({
          reconciliationId: session.id,
          ofxText,
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const parts: string[] = [];
        if (res.skippedOutOfPeriod > 0) parts.push(`${res.skippedOutOfPeriod} fuera de período`);
        if (res.skippedDuplicates > 0) parts.push(`${res.skippedDuplicates} duplicadas`);
        const skipMsg = parts.length > 0 ? ` (${parts.join(", ")} omitidas)` : "";
        toast.success(`Importadas ${res.importedCount} líneas OFX${skipMsg}. Sesión en progreso.`);
        router.refresh();
      } catch {
        setError("No se pudo leer el archivo OFX");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {viewOnlyEditableStatus && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Tenés permiso de ver, no de editar.
        </p>
      )}

      {session.notes ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap">
          <span className="font-medium text-foreground">Notas: </span>
          <span className="text-muted-foreground">{session.notes}</span>
        </p>
      ) : null}

      <div className="grid gap-4 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-muted-foreground">Saldo inicial</p>
          <p className="font-mono font-medium">
            {formatMoneyAmount(session.openingBalance, session.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Saldo final declarado</p>
          <p className="font-mono font-medium">
            {formatMoneyAmount(session.closingBalance, session.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Saldo según extracto</p>
          <p className="font-mono font-medium">
            {formatMoneyAmount(session.impliedClosingBalance, session.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Saldo de libros al cierre</p>
          <p className="font-mono font-medium">{formatMoneyAmount(session.systemClosingBalance, session.currency)}</p>
          <p className="text-xs text-muted-foreground">Por fecha valor, con fecha contable cuando falta.</p>
        </div>
        <div>
          <p className="text-muted-foreground">Diferencia banco − sistema</p>
          <p className="font-mono font-medium">{formatMoneyAmount(session.bankClosingDifference, session.currency)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Cuadre / pendientes</p>
          <p className="font-medium">
            {session.statementBalances ? "Extracto cuadra" : "Extracto no cuadra"}
            {" · "}
            {session.unmatchedLines} sin emparejar
          </p>
        </div>
      </div>

      {session.status === "CANCELLED" && (
        <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Esta sesión está cancelada. Los emparejamientos quedaron deshechos; podés consultar el
          historial pero no editar.
        </p>
      )}
      {session.status === "CLOSED" && (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Conciliación cerrada. Para volver a emparejar, reabrila con un motivo (queda auditado).
        </p>
      )}

      {canEdit && session.status !== "CANCELLED" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {session.status === "DRAFT" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                title="Opcional: al agregar líneas o importar, la sesión pasa sola a «En progreso»."
                onClick={() => run(() => startBankReconciliationAction(session.id))}
              >
                Pasar a en progreso
              </Button>
            )}
            {session.status === "IN_PROGRESS" && (
              <Button
                size="sm"
                disabled={
                  isPending
                  || !session.statementBalances
                  || session.unmatchedLines > 0
                  || candidates.length > 0
                }
                title={
                  !session.statementBalances
                    ? "El extracto no cuadra con los saldos declarados"
                    : session.unmatchedLines > 0
                      ? `Todavía hay ${session.unmatchedLines} línea(s) sin emparejar`
                      : candidates.length > 0
                        ? `Hay ${candidates.length} movimiento(s) confirmado(s) sin conciliar en el período`
                        : undefined
                }
                onClick={() => setDialog({ kind: "close" })}
              >
                Cerrar conciliación
              </Button>
            )}
            {session.status === "CLOSED" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setDialog({ kind: "reopen" })}
              >
                Reabrir sesión
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                setDialog({
                  kind: session.status === "CLOSED" ? "cancel-closed" : "cancel-open",
                })
              }
            >
              Cancelar sesión
            </Button>
          </div>
          {session.status === "IN_PROGRESS"
            && (
              !session.statementBalances
              || session.unmatchedLines > 0
              || candidates.length > 0
            ) && (
            <p className="text-xs text-muted-foreground">
              Para cerrar: el extracto tiene que cuadrar
              {session.unmatchedLines > 0
                ? `, no pueden quedar líneas sin match (${session.unmatchedLines})`
                : ""}
              {candidates.length > 0
                ? ` y tienen que estar conciliados o cancelados todos los movimientos del período (${candidates.length} pendientes)`
                : ""}
              .
            </p>
          )}
        </div>
      )}

      {editable && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Importar CSV de extracto</h3>
              <p className="text-xs text-muted-foreground">
                Columnas: fecha, descripcion, monto, direccion [, referencia]. Separador , o ;.
              </p>
            </div>
            <div>
              <Input
                type="file"
                accept=".csv,text/csv"
                disabled={isPending}
                className="max-w-xs cursor-pointer text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  handleCsvFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Importar OFX / QFX</h3>
              <p className="text-xs text-muted-foreground">
                OFX 1.x (SGML): transacciones STMTTRN con DTPOSTED y TRNAMT. Máx. 500 líneas. Para XFER, el monto necesita signo explícito: + para crédito o − para débito.
              </p>
            </div>
            <div>
              <Input
                type="file"
                accept=".ofx,.qfx,application/x-ofx,application/vnd.intu.qfx"
                disabled={isPending}
                className="max-w-xs cursor-pointer text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  handleOfxFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
      )}

      {editable && (
        <form onSubmit={handleAddLine} className="space-y-3 rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Agregar línea de extracto</h3>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="lineDate">Fecha</Label>
              <Input id="lineDate" name="lineDate" type="date" required />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" name="description" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="amount">Monto</Label>
              <DecimalInput
                id="amount"
                name="amount"
                value={lineAmount}
                onValueChange={setLineAmount}
                required
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="line-direction">Dirección</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as "CREDIT" | "DEBIT")}
              >
                <SelectTrigger id="line-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CREDIT">Crédito (ingreso)</SelectItem>
                  <SelectItem value="DEBIT">Débito (egreso)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="reference">Referencia (opcional)</Label>
              <Input id="reference" name="reference" maxLength={120} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" size="sm" disabled={isPending}>
                Agregar línea
              </Button>
            </div>
          </div>
        </form>
      )}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <section aria-label="Líneas del extracto" className="min-w-0 rounded-lg border bg-card">
          <div className="space-y-3 border-b p-4">
            <h3 className="font-semibold">Extracto ({session.lines.length})</h3>
            <div role="group" aria-label="Filtrar extracto" className="grid grid-cols-2 gap-2">
              <Button type="button" variant={lineFilter === "pending" ? "secondary" : "outline"} className="min-h-11 whitespace-normal" aria-pressed={lineFilter === "pending"} disabled={isPending} onClick={() => { setLineFilter("pending"); setLinePage(1); clearSelection(); }}>Pendientes ({pendingLineCount})</Button>
              <Button type="button" variant={lineFilter === "all" ? "secondary" : "outline"} className="min-h-11 whitespace-normal" aria-pressed={lineFilter === "all"} disabled={isPending} onClick={() => { setLineFilter("all"); setLinePage(1); clearSelection(); }}>Todas ({session.lines.length})</Button>
            </div>
            <Label htmlFor="reconciliation-line-search">Buscar en el extracto</Label>
            <Input id="reconciliation-line-search" placeholder="Descripción o referencia" value={lineSearch} disabled={isPending} onChange={(event) => { setLineSearch(event.target.value); setLinePage(1); clearSelection(); }} />
            <p className="text-xs text-muted-foreground">{visibleLines.length} líneas en este filtro · Hasta {PAGE_SIZE} por página. Los filtros no cambian saldos ni condiciones de cierre.</p>
          </div>
          <ul className="divide-y">
            {visibleLines.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">Sin líneas para este filtro. Revisá la búsqueda o elegí Todas.</li>}
            {visibleLines.slice((currentLinePage - 1) * PAGE_SIZE, currentLinePage * PAGE_SIZE).map((line) => {
              const active = selectedLineId === line.id;
              return <li key={line.id} className={`min-w-0 px-4 py-3 text-sm ${active ? "bg-muted/60" : ""}`}>
                <button type="button" className="min-h-11 w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={active} disabled={isPending} onClick={() => {
                  setSelectedLineId(line.id); setSelectedMovementId(null); setMovementSearch(""); setMovementPage(1);
                  if (window.matchMedia("(max-width: 1023px)").matches) {
                    movementPanelRef.current?.scrollIntoView({ block: "start" });
                    movementPanelRef.current?.focus({ preventScroll: true });
                  }
                }}>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{line.description}</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">{formatDate(line.lineDate)} · {line.direction === "CREDIT" ? "Crédito" : "Débito"}{line.reference ? ` · ${line.reference}` : ""}</p>
                      <p className="mt-1 text-xs font-medium">{line.match ? "Conciliada" : "Pendiente"}</p>
                      {line.match && <p className="mt-1 break-words text-xs text-muted-foreground">Emparejado: {line.match.movement.description} · {formatDate(line.match.movement.valueDate ?? line.match.movement.movementDate)}</p>}
                    </div>
                    <p className="break-words font-mono tabular-nums">{formatMoneyAmount(line.amount, session.currency)}</p>
                  </div>
                </button>
                {editable && <div className="mt-2 flex flex-wrap gap-2">
                  {line.match ? <Button size="sm" className="min-h-11" variant="outline" disabled={isPending} onClick={() => run(() => unmatchBankReconciliationLineAction(line.match!.id, session.id))}>Desconciliar</Button> : <>
                    <Button size="sm" className="min-h-11" variant="outline" disabled={isPending} onClick={() => {
                      setMovementFxRate(""); setMovementFxError(null);
                      setDialog({ kind: "create-movement", lineId: line.id, dirLabel: line.direction === "CREDIT" ? "ingreso" : "egreso", amount: line.amount });
                    }}>Crear movimiento</Button>
                    <Button size="sm" className="min-h-11" variant="ghost" disabled={isPending} onClick={() => setDialog({ kind: "remove-line", lineId: line.id })}>Quitar</Button>
                  </>}
                </div>}
              </li>;
            })}
          </ul>
          <ReconciliationPager page={currentLinePage} total={visibleLines.length} pending={isPending} onPage={(page) => { setLinePage(page); clearSelection(); }} />
        </section>

        <section ref={movementPanelRef} tabIndex={-1} aria-label="Revisar coincidencias" className="min-w-0 scroll-mt-24 rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="space-y-3 border-b p-4">
            <h3 className="font-semibold">Movimientos del sistema ({filteredCandidates.length}{selectedLine ? " compatibles" : ""})</h3>
            {selectedLine ? <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">Línea seleccionada del extracto</p>
              <p className="break-words">{selectedLine.description}</p>
              <p className="break-words text-xs text-muted-foreground">{formatDate(selectedLine.lineDate)} · {selectedLine.direction === "CREDIT" ? "Crédito" : "Débito"}{selectedLine.reference ? ` · ${selectedLine.reference}` : ""}</p>
              <p className="font-semibold tabular-nums">{formatMoneyAmount(selectedLine.amount, session.currency)}</p>
            </div> : <p className="text-sm text-muted-foreground">Elegí una línea del extracto para ver movimientos del mismo importe y dirección, dentro de esta cuenta, moneda y período.</p>}
            {selectedLine && !selectedLine.match && <p role="status" className="rounded-md border p-3 text-sm">
              {filteredCandidates.length > 1
                ? `Hay ${filteredCandidates.length} coincidencias posibles. El importe y la dirección no identifican por sí solos la operación: compará fechas y descripciones antes de elegir.`
                : filteredCandidates.length === 1
                  ? "Hay una coincidencia posible. Revisá fecha y descripción antes de confirmar; no se selecciona automáticamente."
                  : "No hay movimientos confirmados del mismo importe y dirección. Revisá la cuenta, el período y el registro original antes de crear un movimiento."}
            </p>}
            {selectedLine?.match && <p className="text-sm text-muted-foreground">Esta línea ya está conciliada. Revisá el emparejamiento en el extracto; para cambiarlo, primero desconciliá.</p>}
            <Label htmlFor="reconciliation-movement-search">Buscar movimiento</Label>
            <Input id="reconciliation-movement-search" placeholder="Descripción del movimiento" value={movementSearch} disabled={isPending} onChange={(event) => { setMovementSearch(event.target.value); setMovementPage(1); setSelectedMovementId(null); }} />
            <p className="text-xs text-muted-foreground">{visibleCandidates.length} resultados de {filteredCandidates.length} · Ordenados por fecha valor o contable · Hasta {PAGE_SIZE} por página.</p>
          </div>
          <ul className="divide-y">
            {visibleCandidates.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">{movementSearch.trim() ? "Sin resultados para la búsqueda. Borrala para ver todos los candidatos." : "Sin movimientos disponibles para esta selección."}</li>}
            {visibleCandidates.slice((currentMovementPage - 1) * PAGE_SIZE, currentMovementPage * PAGE_SIZE).map((m) => {
              const active = selectedMovementId === m.id;
              return <li key={m.id} className={`min-w-0 px-4 py-3 text-sm ${active ? "bg-muted/60" : ""}`}>
                <button type="button" className="min-h-11 w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={active} onClick={() => setSelectedMovementId(m.id)} disabled={isPending || !editable || !selectedLine || Boolean(selectedLine.match)}>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{m.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(m.valueDate ?? m.movementDate)} · {TYPE_LABEL[m.type] ?? m.type}{m.valueDate ? " · Fecha valor" : " · Fecha contable"}</p>
                    </div>
                    <p className="break-words font-mono tabular-nums">{formatMoneyAmount(m.amount, session.currency)}</p>
                  </div>
                </button>
              </li>;
            })}
          </ul>
          <ReconciliationPager page={currentMovementPage} total={visibleCandidates.length} pending={isPending} onPage={(page) => { setMovementPage(page); setSelectedMovementId(null); }} />
          {editable && selectedLine && !selectedLine.match && selectedMovement && <div className="space-y-3 border-t p-4">
            <div role="region" aria-label="Par a confirmar" className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">Revisá el par antes de confirmar</p>
              <p className="break-words"><span className="font-medium">Extracto:</span> {selectedLine.description} · {formatDate(selectedLine.lineDate)}</p>
              <p className="break-words"><span className="font-medium">Sistema:</span> {selectedMovement.description} · {formatDate(selectedMovement.valueDate ?? selectedMovement.movementDate)}</p>
              <p className="font-medium tabular-nums">{formatMoneyAmount(selectedLine.amount, session.currency)} · {selectedLine.direction === "CREDIT" ? "Ingreso" : "Egreso"}</p>
              <p className="text-xs text-muted-foreground">Solo se concilia este par al confirmar. El servicio vuelve a comprobar su disponibilidad.</p>
            </div>
            <Button className="min-h-11 w-full whitespace-normal" disabled={isPending} onClick={() => run(() => matchBankReconciliationLineAction({ reconciliationId: session.id, statementLineId: selectedLine.id, accountMovementId: selectedMovement.id }), "Línea emparejada")}>Emparejar seleccionados</Button>
          </div>}
        </section>
      </div>
      <ConfirmAlertDialog
        open={dialog?.kind === "close"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Cerrar conciliación"
        description="No vas a poder emparejar más líneas hasta reabrirla."
        confirmLabel="Cerrar"
        pending={isPending}
        onConfirm={() =>
          run(() => closeBankReconciliationAction(session.id), "Conciliación cerrada")
        }
      />
      <ConfirmAlertDialog
        open={dialog?.kind === "cancel-open"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Cancelar sesión"
        description="Se deshacen los emparejamientos. Los movimientos creados desde el extracto no se borran solos."
        confirmLabel="Cancelar sesión"
        variant="destructive"
        pending={isPending}
        onConfirm={() =>
          run(() => cancelBankReconciliationAction(session.id, null), "Sesión cancelada")
        }
      />
      <ReasonAlertDialog
        open={dialog?.kind === "cancel-closed"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Cancelar conciliación cerrada"
        description="Indicá el motivo. Se deshacen los emparejamientos; queda auditado. Los movimientos creados desde el extracto no se borran solos."
        confirmLabel="Cancelar sesión"
        variant="destructive"
        pending={isPending}
        onConfirm={(reason) =>
          run(() => cancelBankReconciliationAction(session.id, reason), "Sesión cancelada")
        }
      />
      <ReasonAlertDialog
        open={dialog?.kind === "reopen"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Reabrir sesión"
        description="Se habilita de nuevo el emparejamiento. El motivo queda auditado."
        confirmLabel="Reabrir"
        pending={isPending}
        onConfirm={(reason) =>
          run(
            () =>
              reopenBankReconciliationAction({
                reconciliationId: session.id,
                reason,
              }),
            "Sesión reabierta",
          )
        }
      />
      <ConfirmAlertDialog
        open={dialog?.kind === "create-movement"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Crear movimiento desde extracto"
        description={
          dialog?.kind === "create-movement" ? (
            <div ref={movementFieldsRef} className="space-y-3">
              <p>
                ¿Crear un movimiento de {dialog.dirLabel} por{" "}
                {formatMoneyAmount(dialog.amount, session.currency)} en «{session.accountName}» y
                emparejarlo con esta línea?
              </p>
              <ManualFxField
                currency={session.currency}
                value={movementFxRate}
                onValueChange={(value) => {
                  setMovementFxRate(value);
                  setMovementFxError(null);
                }}
                id="reconciliation-movement-fx-rate"
                disabled={isPending}
              />
              {movementFxError ? <p role="alert" className="text-destructive">{movementFxError}</p> : null}
            </div>
          ) : null
        }
        confirmLabel="Crear y emparejar"
        pending={isPending}
        onConfirm={() => {
          if (dialog?.kind !== "create-movement") return;
          if (!reportInvalidDecimalInputs(movementFieldsRef.current)) return;
          if (session.currency !== "ARS" && !movementFxRate) {
            setMovementFxError("Ingresá el tipo de cambio para este movimiento.");
            return;
          }
          const lineId = dialog.lineId;
          return run(
            async () => {
              const result = await createMovementFromStatementLineAction({
                reconciliationId: session.id,
                statementLineId: lineId,
                fxRate: session.currency !== "ARS" ? movementFxRate : undefined,
              });
              if ("error" in result) setMovementFxError(result.error);
              return result;
            },
            "Movimiento creado y emparejado",
          );
        }}
      />
      <ConfirmAlertDialog
        open={dialog?.kind === "remove-line"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Quitar línea"
        description="¿Quitar esta línea del extracto? Si se había creado un movimiento automático desde esta línea, también se anula."
        confirmLabel="Quitar"
        variant="destructive"
        pending={isPending}
        onConfirm={() => {
          if (dialog?.kind !== "remove-line") return;
          run(
            () => removeBankStatementLineAction(dialog.lineId, session.id),
            "Línea quitada",
          );
        }}
      />
    </div>
  );
}
