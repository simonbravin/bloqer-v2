"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox, toSearchableOptions } from "@/components/ui/searchable-combobox";
import { InvoiceLinesEditor } from "@/features/ap/components/invoice-lines-editor";
import type { InvoiceLine } from "@/features/ap/components/invoice-lines-editor";
import { registerTransactionAction } from "@/app/(app)/finanzas/transacciones/actions";

export type SupplierOption = { id: string; label: string };
export type TreasuryAccountOption = { id: string; label: string; currency: string };

type TransactionKind = "AP_EXPENSE" | "TREASURY_INFLOW";

interface Props {
  suppliers: SupplierOption[];
  treasuryAccounts: TreasuryAccountOption[];
  canAp: boolean;
  canTreasury: boolean;
}

const DEFAULT_LINE: InvoiceLine = { description: "", quantity: "1", unitPrice: "", taxRate: "21" };

export function NewTransactionDialog({ suppliers, treasuryAccounts, canAp, canTreasury }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransactionKind>(canAp ? "AP_EXPENSE" : "TREASURY_INFLOW");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [supplierContactId, setSupplierContactId] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([{ ...DEFAULT_LINE }]);
  const [payNow, setPayNow] = useState(false);
  const [payAccountId, setPayAccountId] = useState("");

  const [inflowAccountId, setInflowAccountId] = useState("");

  const treasuryOptions = useMemo(
    () => toSearchableOptions(treasuryAccounts.map((a) => ({ id: a.id, label: a.label }))),
    [treasuryAccounts],
  );

  if (!canAp && !canTreasury) return null;

  function resetForm() {
    setError(null);
    setSupplierContactId("");
    setLines([{ ...DEFAULT_LINE }]);
    setPayNow(false);
    setPayAccountId("");
    setInflowAccountId("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      if (kind === "AP_EXPENSE") {
        if (!supplierContactId) {
          setError("Debe seleccionar un proveedor");
          return;
        }
        if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
          setError("Completá descripción, cantidad y precio en todas las líneas");
          return;
        }
        if (payNow && !payAccountId) {
          setError("Selecciona la cuenta de pago");
          return;
        }
        const issueDate = fd.get("issueDate") as string;
        const dueDate = fd.get("dueDate") as string;
        const paymentDate = (fd.get("paymentDate") as string) || issueDate;
        const res = await registerTransactionAction({
          kind: "AP_EXPENSE",
          supplierContactId,
          issueDate,
          dueDate,
          currency: "ARS",
          notes: (fd.get("notes") as string) || null,
          internalNotes: null,
          lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
          payNow: payNow
            ? {
                accountId: payAccountId,
                paymentDate,
                notes: null,
              }
            : undefined,
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        setOpen(false);
        resetForm();
        router.refresh();
        router.push(res.href);
        return;
      }

      if (!inflowAccountId) {
        setError("Seleccioná la cuenta de tesorería");
        return;
      }
      const res = await registerTransactionAction({
        kind: "TREASURY_INFLOW",
        accountId: inflowAccountId,
        movementDate: fd.get("movementDate") as string,
        amount: fd.get("amount") as string,
        description: fd.get("description") as string,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOpen(false);
      resetForm();
      router.refresh();
      router.push(res.href);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Nueva transacción</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registrar transacción</DialogTitle>
          <DialogDescription>
            Alta rápida de gasto corporativo o ingreso manual de caja (sin imputar a obra).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {canAp && (
            <Button
              type="button"
              size="sm"
              variant={kind === "AP_EXPENSE" ? "secondary" : "outline"}
              onClick={() => setKind("AP_EXPENSE")}
            >
              Gasto / factura proveedor
            </Button>
          )}
          {canTreasury && (
            <Button
              type="button"
              size="sm"
              variant={kind === "TREASURY_INFLOW" ? "secondary" : "outline"}
              onClick={() => setKind("TREASURY_INFLOW")}
            >
              Ingreso de caja
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          )}

          {kind === "AP_EXPENSE" && (
            <>
              <div className="space-y-1">
                <Label>Proveedor</Label>
                <SearchableCombobox
                  options={toSearchableOptions(suppliers)}
                  value={supplierContactId}
                  onValueChange={setSupplierContactId}
                  placeholder="Seleccionar proveedor..."
                  searchPlaceholder="Buscar proveedor..."
                  emptyText="Ningún proveedor coincide."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="issueDate">Fecha de emisión</Label>
                  <Input id="issueDate" name="issueDate" type="date" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dueDate">Vencimiento</Label>
                  <Input id="dueDate" name="dueDate" type="date" required />
                </div>
              </div>
              <InvoiceLinesEditor lines={lines} onChange={setLines} />
              <div className="space-y-1">
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
              {canAp && canTreasury && treasuryAccounts.length > 0 && (
                <div className="rounded-md border p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={payNow}
                      onChange={(e) => setPayNow(e.target.checked)}
                    />
                    Pagar ahora (egreso de caja)
                  </label>
                  {payNow && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1">
                        <Label>Cuenta de pago</Label>
                        <SearchableCombobox
                          options={treasuryOptions}
                          value={payAccountId}
                          onValueChange={setPayAccountId}
                          placeholder="Cuenta..."
                          searchPlaceholder="Buscar cuenta..."
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="paymentDate">Fecha de pago</Label>
                        <Input id="paymentDate" name="paymentDate" type="date" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {kind === "TREASURY_INFLOW" && (
            <>
              <div className="space-y-1">
                <Label>Cuenta</Label>
                <SearchableCombobox
                  options={treasuryOptions}
                  value={inflowAccountId}
                  onValueChange={setInflowAccountId}
                  placeholder="Seleccionar cuenta..."
                  searchPlaceholder="Buscar cuenta..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="movementDate">Fecha</Label>
                  <Input id="movementDate" name="movementDate" type="date" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">Monto</Label>
                  <Input id="amount" name="amount" inputMode="decimal" required />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Descripción</Label>
                <Input id="description" name="description" required />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
