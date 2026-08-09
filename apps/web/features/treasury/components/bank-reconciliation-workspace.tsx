"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
import {
  ConfirmAlertDialog,
  ReasonAlertDialog,
} from "@/components/ui/reason-alert-dialog";

type Candidate = {
  id: string;
  movementDate: Date | string;
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

export function BankReconciliationWorkspace({ session, candidates, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
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

  function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    successToast?: string,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if ("error" in res) setError(res.error);
      else {
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
      if (!("error" in res)) form.reset();
      return res;
    });
  }

  function handleCsvFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Solo se admite archivo .csv");
      return;
    }
    setError(null);
    startTransition(async () => {
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
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".ofx") && !lower.endsWith(".qfx")) {
      setError("Solo se admite archivo .ofx o .qfx");
      return;
    }
    setError(null);
    startTransition(async () => {
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

      <div className="grid gap-4 rounded-lg border bg-card p-4 text-sm sm:grid-cols-4">
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
          <p className="text-muted-foreground">Cuadre / pendientes</p>
          <p className="font-medium">
            {session.statementBalances ? "Extracto cuadra" : "Extracto no cuadra"}
            {" · "}
            {session.unmatchedLines} sin match
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
                OFX 1.x (SGML): transacciones STMTTRN con DTPOSTED y TRNAMT. Máx. 500 líneas.
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
          <div className="grid gap-3 sm:grid-cols-5">
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
              <Input id="amount" name="amount" inputMode="decimal" required placeholder="0.00" />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Extracto ({session.lines.length})</h3>
          </div>
          <ul className="divide-y">
            {session.lines.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground">Sin líneas aún.</li>
            )}
            {session.lines.map((line) => {
              const active = selectedLineId === line.id;
              return (
                <li
                  key={line.id}
                  className={`px-4 py-3 text-sm ${active ? "bg-muted/60" : ""}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      setSelectedLineId(line.id);
                      setSelectedMovementId(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{line.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(line.lineDate)} ·{" "}
                          {line.direction === "CREDIT" ? "Crédito" : "Débito"}
                          {line.reference ? ` · ${line.reference}` : ""}
                        </p>
                        {line.match && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Match: {line.match.movement.description}
                          </p>
                        )}
                      </div>
                      <p className="font-mono tabular-nums">
                        {formatMoneyAmount(line.amount, session.currency)}
                      </p>
                    </div>
                  </button>
                  {editable && (
                    <div className="mt-2 flex gap-2">
                      {line.match ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            run(() =>
                              unmatchBankReconciliationLineAction(line.match!.id, session.id),
                            )
                          }
                        >
                          Desconciliar
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() =>
                              setDialog({
                                kind: "create-movement",
                                lineId: line.id,
                                dirLabel:
                                  line.direction === "CREDIT" ? "ingreso" : "egreso",
                                amount: line.amount,
                              })
                            }
                          >
                            Crear movimiento
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => setDialog({ kind: "remove-line", lineId: line.id })}
                          >
                            Quitar
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">
              Movimientos del sistema ({filteredCandidates.length}
              {selectedLine ? " compatibles" : ""})
            </h3>
          </div>
          <ul className="divide-y">
            {filteredCandidates.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground">
                {selectedLine
                  ? "No hay movimientos confirmados con mismo monto y dirección."
                  : "Seleccioná una línea del extracto o no hay candidatos en el período."}
              </li>
            )}
            {filteredCandidates.map((m) => {
              const active = selectedMovementId === m.id;
              return (
                <li key={m.id} className={`px-4 py-3 text-sm ${active ? "bg-muted/60" : ""}`}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedMovementId(m.id)}
                    disabled={!editable || !selectedLine || Boolean(selectedLine.match)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{m.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(m.movementDate)} · {TYPE_LABEL[m.type] ?? m.type}
                        </p>
                      </div>
                      <p className="font-mono tabular-nums">
                        {formatMoneyAmount(m.amount, session.currency)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {editable && selectedLine && !selectedLine.match && selectedMovementId && (
            <div className="border-t p-4">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      matchBankReconciliationLineAction({
                        reconciliationId: session.id,
                        statementLineId: selectedLine.id,
                        accountMovementId: selectedMovementId,
                      }),
                    "Línea emparejada",
                  )
                }
              >
                Emparejar seleccionados
              </Button>
            </div>
          )}
        </div>
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
            <p>
              ¿Crear un movimiento de {dialog.dirLabel} por{" "}
              {formatMoneyAmount(dialog.amount, session.currency)} en «{session.accountName}» y
              emparejarlo con esta línea?
            </p>
          ) : null
        }
        confirmLabel="Crear y emparejar"
        pending={isPending}
        onConfirm={() => {
          if (dialog?.kind !== "create-movement") return;
          const lineId = dialog.lineId;
          run(
            () =>
              createMovementFromStatementLineAction({
                reconciliationId: session.id,
                statementLineId: lineId,
              }),
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
