"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerManualTreasuryAdjustmentAction } from "@/app/(app)/tesoreria/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { ManualFxField } from "@/features/finance/components/manual-fx-field";

interface Props {
  accountId: string;
  accountName: string;
  currency: string;
}

export function ManualTreasuryAdjustmentForm({
  accountId,
  accountName,
  currency,
}: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending: isPending, run, isBusy } = useOperationalAction({ onError: setError });
  const [direction, setDirection] = useState<"INFLOW" | "OUTFLOW">("INFLOW");
  const { idempotencyKey } = useIdempotencyKey();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy()) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    void run(async () => {
      const res = await registerManualTreasuryAdjustmentAction({
        accountId,
        movementDate: fd.get("movementDate") as string,
        direction,
        amount: fd.get("amount") as string,
        fxRate: currency !== "ARS" ? fxRate : undefined,
        description: fd.get("description") as string,
        idempotencyKey,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/tesoreria/cuentas/${accountId}`);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <p className="mb-4 text-sm text-muted-foreground">
        Ajuste manual sobre <span className="font-medium text-foreground">{accountName}</span>{" "}
        ({currency}). Generá un movimiento de ajuste confirmado en la cuenta.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="adjustment-direction">Dirección</Label>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as "INFLOW" | "OUTFLOW")}
            >
              <SelectTrigger id="adjustment-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INFLOW">Ingreso (aumenta saldo)</SelectItem>
                <SelectItem value="OUTFLOW">Egreso (disminuye saldo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ManualFxField currency={currency} value={fxRate} onValueChange={setFxRate} id="adjustment-fx-rate" disabled={isPending} />

          <div className="space-y-1">
            <Label htmlFor="movementDate">Fecha</Label>
            <Input id="movementDate" name="movementDate" type="date" required />
          </div>

          <div className="space-y-1">
            <Label htmlFor="amount">Monto ({currency})</Label>
            <DecimalInput
              id="amount"
              name="amount"
              value={amount}
              onValueChange={setAmount}
              placeholder="0,00"
              required
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Input
              id="description"
              name="description"
              type="text"
              maxLength={500}
              required
              placeholder="Motivo del ajuste"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Registrar ajuste"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => router.push(`/tesoreria/cuentas/${accountId}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
