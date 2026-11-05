"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createInternalTransferAction } from "@/app/(app)/tesoreria/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { ManualFxField } from "@/features/finance/components/manual-fx-field";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  accounts: AccountOption[];
  /** Prefill from account detail CTA (`?fromAccountId=`). */
  defaultSourceAccountId?: string;
  /**
   * Override after success (e.g. historial).
   * When omitted, redirects to the **actual** source account extracto.
   */
  successHref?: string;
}

export function InternalTransferForm({
  accounts,
  defaultSourceAccountId = "",
  successHref,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { pending: isPending, run, isBusy } = useOperationalAction({ onError: setError });
  const [sourceAccountId, setSourceAccountId] = useState(
    defaultSourceAccountId && accounts.some((a) => a.id === defaultSourceAccountId)
      ? defaultSourceAccountId
      : "",
  );
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [transferDate, setTransferDate] = useState(() => toIsoDateInTimeZone());
  const [customValueDate, setCustomValueDate] = useState<string | null>(null);
  const valueDate = customValueDate ?? transferDate;
  const { idempotencyKey, rotateIdempotencyKey } = useIdempotencyKey();

  const sourceAccount = accounts.find((a) => a.id === sourceAccountId) ?? null;
  const destinationOptions = !sourceAccount
    ? accounts.filter((a) => a.id !== sourceAccountId)
    : accounts.filter(
        (a) => a.id !== sourceAccount.id && a.currency === sourceAccount.currency,
      );

  function onSourceChange(id: string) {
    const nextSource = accounts.find((account) => account.id === id);
    if (nextSource?.currency !== sourceAccount?.currency) setFxRate("");
    setSourceAccountId(id);
    setDestinationAccountId((prev) => {
      const src = accounts.find((a) => a.id === id);
      if (!src) return "";
      const dest = accounts.find((a) => a.id === prev);
      if (!dest || dest.id === id || dest.currency !== src.currency) return "";
      return prev;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy()) return;
    if (!sourceAccountId) { setError("Seleccioná la cuenta de origen"); return; }
    if (!destinationAccountId) { setError("Seleccioná la cuenta de destino"); return; }
    if (sourceAccountId === destinationAccountId) {
      setError("La cuenta origen y destino deben ser diferentes");
      return;
    }
    const src = accounts.find((a) => a.id === sourceAccountId);
    const dest = accounts.find((a) => a.id === destinationAccountId);
    if (src && dest && src.currency !== dest.currency) {
      setError(
        `Monedas diferentes (${src.currency} → ${dest.currency}). Elegí cuentas de la misma moneda.`,
      );
      return;
    }
    const fd = new FormData(e.currentTarget);
    setError(null);
    void run(async () => {
      const res = await createInternalTransferAction({
        sourceAccountId,
        destinationAccountId,
        transferDate: fd.get("transferDate") as string,
        valueDate:    fd.get("valueDate") as string,
        amount:       fd.get("amount") as string,
        fxRate:       src && src.currency !== "ARS" ? fxRate : undefined,
        description:  (fd.get("description") as string) || null,
        idempotencyKey,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        rotateIdempotencyKey();
        const href =
          successHref ??
          (sourceAccountId
            ? `/tesoreria/cuentas/${sourceAccountId}`
            : "/tesoreria/transferencias");
        router.push(href);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Mueve plata entre cuentas de la empresa. Un pago a un proveedor no es una transferencia.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="transfer-source">Cuenta origen</Label>
            <Select onValueChange={onSourceChange} value={sourceAccountId}>
              <SelectTrigger id="transfer-source">
                <SelectValue placeholder="Seleccionar cuenta…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1">
            <Label htmlFor="transfer-destination">Cuenta destino</Label>
            <Select
              onValueChange={setDestinationAccountId}
              value={destinationAccountId}
              disabled={!sourceAccountId}
            >
              <SelectTrigger id="transfer-destination">
                <SelectValue
                  placeholder={
                    sourceAccountId
                      ? destinationOptions.length === 0
                        ? "No hay otra cuenta en esa moneda…"
                        : "Seleccionar cuenta…"
                      : "Elegí origen primero…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {destinationOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="transferDate">Fecha contable</Label>
            <Input
              id="transferDate"
              name="transferDate"
              type="date"
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="valueDate">Fecha valor</Label>
            <Input
              id="valueDate"
              name="valueDate"
              type="date"
              required
              value={valueDate}
              onChange={(e) => setCustomValueDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Fecha efectiva en las cuentas. Podés cambiarla si difiere de la fecha contable.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="amount">Monto</Label>
            <DecimalInput
              id="amount"
              name="amount"
              value={amount}
              onValueChange={setAmount}
              required
              placeholder="0,00"
            />
          </div>

          {sourceAccount ? (
            <ManualFxField currency={sourceAccount.currency} value={fxRate} onValueChange={setFxRate} id="transfer-fx-rate" disabled={isPending} />
          ) : null}

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Input id="description" name="description" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              isPending ||
              !sourceAccountId ||
              !destinationAccountId ||
              destinationOptions.length === 0
            }
          >
            {isPending ? "Guardando…" : "Crear transferencia"}
          </Button>
        </div>
      </form>
    </div>
  );
}
